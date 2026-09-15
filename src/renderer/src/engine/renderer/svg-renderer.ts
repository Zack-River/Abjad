import { ComposedGlyph } from '../composition/glyph-composer'
import {
  AnimationTimeline,
  AnimationStep,
  CONNECTION_THRESHOLD_UNITS,
  getBridgeHandoffProgress,
  getStepInkProgress,
  smoothProgress
} from '../animation/animation-engine'
import { StrokeItem } from '../data/stroke-registry'
import { svgPathProperties } from 'svg-path-properties'

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function translateSvgPath(path: string, deltaX: number, deltaY: number): string {
  let coordinateIndex = 0
  return path.replace(/([MLC])|(-?\d+(?:\.\d+)?)/g, (_token, command, number) => {
    if (command) {
      coordinateIndex = 0
      return command
    }
    const value = Number(number)
    const translated = value + (coordinateIndex % 2 === 0 ? deltaX : deltaY)
    coordinateIndex += 1
    return fmtNum(translated)
  })
}

const DEFAULT_BODY_STAMP_SPACING = 2.8
const DEFAULT_DOT_STAMP_SPACING = 1.8
export const DEFAULT_STROKE_WEIGHT = 80
const MIN_STROKE_WEIGHT = 50
const MAX_STROKE_WEIGHT = 110
export const GLOBAL_BRUSH_SCALE = 1
/** Canonical brush dimensions in the editor's font-coordinate space. */
export const DEFAULT_BRUSH_HEIGHT = 80
export const DEFAULT_DOT_BRUSH_HEIGHT = 100
export const BRUSH_WIDTH_TO_HEIGHT_RATIO = 0.3
const HANDOFF_OVERLAP_SCALE = 1.12
const MAX_HANDOFF_BRUSH_HEIGHT = 110
const SHADOW_NORMALIZE_ERODE_RADIUS = 1.35
const SHADOW_NORMALIZE_BLUR_RADIUS = 0.25
const MAX_BODY_TANGENT_WINDOW = 0.014
const MAX_DOT_TANGENT_WINDOW = 0.08
const BODY_TANGENT_WINDOW_UNITS = 9
const DOT_TANGENT_WINDOW_UNITS = 6

export interface BrushProfileValue {
  start?: number
  body?: number
  end?: number
}

export interface BrushProfile {
  startRampEnd?: number
  endRampStart?: number
  startRadius?: number
  bodyRadius?: number
  endRadius?: number
  majorScale?: number | BrushProfileValue
  minorScale?: number | BrushProfileValue
  [key: string]: number | BrushProfileValue | undefined
}

function stampSpacing(
  profile: BrushProfile | undefined,
  isDot: boolean,
  spacingScale: number = 1,
  strokeWeight: number = DEFAULT_STROKE_WEIGHT
): number {
  const spacing = profile?.stampSpacing
  const baseSpacing =
    typeof spacing === 'number'
      ? Math.max(1, spacing)
      : isDot
        ? DEFAULT_DOT_STAMP_SPACING
        : DEFAULT_BODY_STAMP_SPACING
  const requestedSpacing = baseSpacing * Math.max(1, spacingScale)

  // A live board may request sparse stamps to reduce DOM work. Never let that
  // optimization exceed the narrow side of the brush, otherwise horizontal
  // portions of a path expose gaps between neighboring rectangles.
  const brushHeight =
    (isDot ? DEFAULT_DOT_BRUSH_HEIGHT : DEFAULT_BRUSH_HEIGHT) *
    Math.max(0.25, strokeWeight / DEFAULT_STROKE_WEIGHT)
  const brushWidth = brushHeight * BRUSH_WIDTH_TO_HEIGHT_RATIO
  const maxCoveredSpacing = brushWidth * 0.75
  return Math.min(requestedSpacing, maxCoveredSpacing)
}

function tangentWindow(profile: BrushProfile | undefined, isDot: boolean, length: number): number {
  const configured = profile?.tangentWindow
  if (typeof configured === 'number') return Math.max(0.001, configured)
  const maxWindow = isDot ? MAX_DOT_TANGENT_WINDOW : MAX_BODY_TANGENT_WINDOW
  const windowUnits = isDot ? DOT_TANGENT_WINDOW_UNITS : BODY_TANGENT_WINDOW_UNITS
  return Math.min(maxWindow, windowUnits / length)
}

function getProgressClipPolygon(
  pathProps: InstanceType<typeof svgPathProperties>,
  length: number,
  progress: number
): string | null {
  if (!length || progress <= 0 || progress >= 1) return null

  const point = pathProps.getPointAtLength(length * progress)
  const halfWin = Math.min(0.08, 6 / length)
  let t0 = progress - halfWin
  let t1 = progress + halfWin
  if (t0 < 0) {
    t1 = Math.min(1, t1 - t0)
    t0 = 0
  } else if (t1 > 1) {
    t0 = Math.max(0, t0 - (t1 - 1))
    t1 = 1
  }

  const before = pathProps.getPointAtLength(length * t0)
  const after = pathProps.getPointAtLength(length * t1)
  const dx = after.x - before.x
  const dy = after.y - before.y
  const magnitude = Math.hypot(dx, dy)
  if (!magnitude) return null

  const tangentX = dx / magnitude
  const tangentY = dy / magnitude
  const normalX = -tangentY
  const normalY = tangentX
  const extent = 10000
  const p1 = {
    x: point.x + normalX * extent,
    y: point.y + normalY * extent
  }
  const p2 = {
    x: point.x - normalX * extent,
    y: point.y - normalY * extent
  }
  const p3 = {
    x: point.x - tangentX * extent - normalX * extent,
    y: point.y - tangentY * extent - normalY * extent
  }
  const p4 = {
    x: point.x - tangentX * extent + normalX * extent,
    y: point.y - tangentY * extent + normalY * extent
  }

  return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`
}

export interface RenderOptions {
  stageWidth?: number
  stageHeight?: number
  showBaseline?: boolean
  strokeWeight?: number
  centerVertically?: boolean
  includeMedianLayer?: boolean
  /** Increase live-mask spacing without changing canonical export spacing. */
  stampSpacingScale?: number
}

export interface ViewportTransform {
  minX: number
  maxX: number
  minY: number
  maxY: number
  boundsWidth: number
  boundsHeight: number
  scale: number
  baselineY: number
  tx: number
}

/**
 * Mathematically exact bounding box computation for an SVG path string in local coordinates.
 * Includes exact extrema solving for Quadratic (Q) and Cubic (C) Bezier curves.
 */
export function getPathBounds(
  d: string
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (!d) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  function addPt(x: number, y: number): void {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  function addQuadExtrema(p0: number, p1: number, p2: number): number[] {
    const res: number[] = []
    const denom = p0 - 2 * p1 + p2
    if (Math.abs(denom) > 1e-12) {
      const t = (p0 - p1) / denom
      if (t > 0 && t < 1) {
        res.push((1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2)
      }
    }
    return res
  }

  function addCubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
    const res: number[] = []
    const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3)
    const b = 6 * (p0 - 2 * p1 + p2)
    const c = 3 * (p1 - p0)

    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) {
        const t = -c / b
        if (t > 0 && t < 1) res.push(t)
      }
    } else {
      const d2 = b * b - 4 * a * c
      if (d2 >= 0) {
        const sd = Math.sqrt(d2)
        const t1 = (-b - sd) / (2 * a)
        const t2 = (-b + sd) / (2 * a)
        if (t1 > 0 && t1 < 1) res.push(t1)
        if (t2 > 0 && t2 < 1) res.push(t2)
      }
    }
    return res.map(
      (t) =>
        (1 - t) * (1 - t) * (1 - t) * p0 +
        3 * (1 - t) * (1 - t) * t * p1 +
        3 * (1 - t) * t * t * p2 +
        t * t * t * p3
    )
  }

  const cmdRegex = /([A-Za-z])([^A-Za-z]*)/g
  let curX = 0
  let curY = 0
  let match: RegExpExecArray | null

  while ((match = cmdRegex.exec(d)) !== null) {
    const cmd = match[1]
    const numMatches = match[2].match(/-?(?:\d*\.\d+|\d+)/g)
    const nums = numMatches ? numMatches.map(Number) : []

    switch (cmd) {
      case 'M':
      case 'L':
        for (let i = 0; i < nums.length; i += 2) {
          curX = nums[i]
          curY = nums[i + 1]
          addPt(curX, curY)
        }
        break
      case 'm':
      case 'l':
        for (let i = 0; i < nums.length; i += 2) {
          curX += nums[i]
          curY += nums[i + 1]
          addPt(curX, curY)
        }
        break
      case 'H':
        for (let i = 0; i < nums.length; i++) {
          curX = nums[i]
          addPt(curX, curY)
        }
        break
      case 'h':
        for (let i = 0; i < nums.length; i++) {
          curX += nums[i]
          addPt(curX, curY)
        }
        break
      case 'V':
        for (let i = 0; i < nums.length; i++) {
          curY = nums[i]
          addPt(curX, curY)
        }
        break
      case 'v':
        for (let i = 0; i < nums.length; i++) {
          curY += nums[i]
          addPt(curX, curY)
        }
        break
      case 'Q':
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = nums[i]
          const y1 = nums[i + 1]
          const x = nums[i + 2]
          const y = nums[i + 3]
          addPt(x, y)
          addQuadExtrema(curX, x1, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addQuadExtrema(curY, y1, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'q':
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = curX + nums[i]
          const y1 = curY + nums[i + 1]
          const x = curX + nums[i + 2]
          const y = curY + nums[i + 3]
          addPt(x, y)
          addQuadExtrema(curX, x1, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addQuadExtrema(curY, y1, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'C':
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = nums[i]
          const y1 = nums[i + 1]
          const x2 = nums[i + 2]
          const y2 = nums[i + 3]
          const x = nums[i + 4]
          const y = nums[i + 5]
          addPt(x, y)
          addCubicExtrema(curX, x1, x2, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addCubicExtrema(curY, y1, y2, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'c':
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = curX + nums[i]
          const y1 = curY + nums[i + 1]
          const x2 = curX + nums[i + 2]
          const y2 = curY + nums[i + 3]
          const x = curX + nums[i + 4]
          const y = curY + nums[i + 5]
          addPt(x, y)
          addCubicExtrema(curX, x1, x2, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addCubicExtrema(curY, y1, y2, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'Z':
      case 'z':
        break
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
  return { minX, maxX, minY, maxY }
}

/**
 * Calculates the exact validated ComparisonGallery viewport transform
 * for a set of positioned composed glyphs.
 *
 * Uses the established calculation verbatim:
 * boundsWidth = maxX - minX
 * boundsHeight = maxY - minY
 * scale = min(0.28, (stageWidth - 120) / boundsWidth, (stageHeight - 110) / boundsHeight)
 * baselineY = round(35 + abs(minY) * scale + (260 - boundsHeight * scale) / 2)
 * tx = round((stageWidth - boundsWidth * scale) / 2 - minX * scale)
 */
export function computeViewportTransform(
  composed: ComposedGlyph[],
  stageWidth: number = 600,
  stageHeight: number = 300,
  centerVertically: boolean = false
): ViewportTransform {
  let minX = Infinity
  let maxX = -Infinity
  let minY = 0
  let maxY = 0

  for (const glyph of composed) {
    if (!glyph.isSupported) continue

    const gx = glyph.glyphX
    const gy = glyph.glyphY

    // 1. Incorporate rendered glyph outline bounds (in SVG coordinates)
    const outlinePaths = [
      glyph.definition?.outlinePath,
      ...(glyph.definition?.outlinePaths || [])
    ].filter((path): path is string => Boolean(path))
    for (const outline of outlinePaths) {
      const b = getPathBounds(outline)
      if (b) {
        if (b.minX + gx < minX) minX = b.minX + gx
        if (b.maxX + gx > maxX) maxX = b.maxX + gx
        if (b.minY + gy < minY) minY = b.minY + gy
        if (b.maxY + gy > maxY) maxY = b.maxY + gy
      }
    }

    // 2. Incorporate stroke geometry (ensures marks/strokes wider than outline are fully framed)
    const strokes = glyph.orderedStrokes || []
    for (const stroke of strokes) {
      // The median path is the geometry actually used by progressive masks.
      // Include it in framing so a refined path cannot be hidden by stale
      // candidate point bounds retained for marker/debug compatibility.
      if (stroke.medianPath) {
        const medianBounds = getPathBounds(stroke.medianPath)
        if (medianBounds) {
          if (medianBounds.minX + gx < minX) minX = medianBounds.minX + gx
          if (medianBounds.maxX + gx > maxX) maxX = medianBounds.maxX + gx
          if (medianBounds.minY + gy < minY) minY = medianBounds.minY + gy
          if (medianBounds.maxY + gy > maxY) maxY = medianBounds.maxY + gy
        }
      }

      if (stroke.pointsWithWidth && stroke.pointsWithWidth.length > 0) {
        for (const p of stroke.pointsWithWidth) {
          const px = p.x + gx
          const py = p.y + gy
          if (px < minX) minX = px
          if (px > maxX) maxX = px
          if (py < minY) minY = py
          if (py > maxY) maxY = py
        }
      } else if (stroke.points && stroke.points.length > 0) {
        for (const p of stroke.points) {
          const px = (p as number[])[0] + gx
          const py = (p as number[])[1] + gy
          if (px < minX) minX = px
          if (px > maxX) maxX = px
          if (py < minY) minY = py
          if (py > maxY) maxY = py
        }
      }
    }
  }

  // Fallback if no valid points found
  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(maxX)) maxX = 600

  // Ensure baseline y=0 is framed
  minY = Math.min(minY, 0)
  maxY = Math.max(maxY, 0)

  // Exact established formula (no ad-hoc clamping or normalization)
  const boundsWidth = maxX - minX
  const boundsHeight = maxY - minY

  const safeBoundsWidth = boundsWidth <= 0 ? 1 : boundsWidth
  const safeBoundsHeight = boundsHeight <= 0 ? 1 : boundsHeight

  const scale = Math.min(
    0.28,
    (stageWidth - 120) / safeBoundsWidth,
    (stageHeight - 110) / safeBoundsHeight
  )

  const baselineY = centerVertically
    ? Math.round((stageHeight - (minY + maxY) * scale) / 2)
    : Math.round(35 + Math.abs(minY) * scale + (260 - boundsHeight * scale) / 2)

  const tx = Math.round((stageWidth - boundsWidth * scale) / 2 - minX * scale)

  return {
    minX,
    maxX,
    minY,
    maxY,
    boundsWidth,
    boundsHeight,
    scale,
    baselineY,
    tx
  }
}

/**
 * Finds the corresponding animation timeline step for a glyph's stroke.
 */
function findStepForStroke(
  timeline: AnimationTimeline | undefined,
  glyphIndex: number,
  stroke: StrokeItem,
  strokeOrderIndex: number
): AnimationStep | undefined {
  if (!timeline || !timeline.steps || timeline.steps.length === 0) return undefined

  // 1. Direct object identity or order match within this glyphIndex
  const directMatch = timeline.steps.find((s) => {
    if (s.glyphIndex !== glyphIndex) return false
    if (s.stroke === (stroke as unknown)) return true
    const candidate = s.stroke as { order?: number } | null | undefined
    if (
      candidate &&
      candidate.order !== undefined &&
      stroke.order !== undefined &&
      candidate.order === stroke.order
    ) {
      return true
    }
    return false
  })
  if (directMatch) return directMatch

  // 2. Normalizers may clone a stroke while preserving its geometry. Match
  // those clones by their median path before falling back to position.
  const geometryMatch = timeline.steps.find((s) => {
    if (s.glyphIndex !== glyphIndex || !s.stroke?.medianPath) return false
    if (s.stroke.medianPath !== stroke.medianPath) return false
    return (
      s.stroke.order === stroke.order ||
      (s.stroke.startPoint?.x === stroke.startPoint?.x &&
        s.stroke.startPoint?.y === stroke.startPoint?.y &&
        s.stroke.endPoint?.x === stroke.endPoint?.x &&
        s.stroke.endPoint?.y === stroke.endPoint?.y)
    )
  })
  if (geometryMatch) return geometryMatch

  // 3. Positional index match among steps belonging to this glyphIndex
  const glyphSteps = timeline.steps.filter((s) => s.glyphIndex === glyphIndex)
  if (glyphSteps.length > strokeOrderIndex) {
    return glyphSteps[strokeOrderIndex]
  }

  // If a stroke cannot be matched deterministically, do not assign an arbitrary step
  return undefined
}

/**
 * Phase 3 generic SVG renderer.
 *
 * Consumes: ComposedGlyph[], timeline, progressMs.
 * Produces: Generic, centered, layered, animated SVG markup.
 *
 * Coordinate-space contract:
 * - outlinePath, medianPath, and mask stamps all reside in local font units.
 * - Each glyph is placed via `<g transform="translate(glyphX, glyphY)">`.
 * - The single viewport transform `translate(tx, baselineY) scale(scale)` is applied
 *   once at the outer word-group level.
 * - Deterministic mask IDs: `mask-g${glyphIndex}-s${strokeOrder}`.
 */
function fmtNum(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(r)
}

export interface PreparedStroke {
  glyphIndex: number
  strokeIndex: number
  strokeOrder: number
  isDot: boolean
  maskId: string
  progressClipId: string
  medianPath: string
  length: number
  spacing: number
  fixedCount: number
  samples: Float32Array // packed: [pathProgress, x, y, angle] * (fixedCount + 1)
  brushProfile?: BrushProfile
  step?: AnimationStep
  continuousMask: boolean
  outlineIds: string[]
  pathProps: InstanceType<typeof svgPathProperties>
  maskX: number
  maskY: number
  maskWidth: number
  maskHeight: number
}

export interface PreparedConnection {
  fromGlyphIndex: number
  connMaskId: string
  nextOutlineId: string
  dx: number
  dy: number
  mode: 'outgoing-mask' | 'handoff-mask'
  bridgePath?: string
  bridgeLength?: number
  bridgeStartMs?: number
  bridgeEndMs?: number
  bridgeBrushHeight?: number
}

export interface PreparedGlyph {
  glyphIndex: number
  glyphId: number
  glyphTransform: string
  isSupported: boolean
  unsupportedOutlineId?: string
  ghostOutlineIds: string[]
  medianPaths: string[]
  strokeIndices: number[]
}

export interface PreparedRenderScene {
  viewport: ViewportTransform
  stageWidth: number
  stageHeight: number
  showBaseline: boolean
  strokeWeight: number
  includeMedianLayer: boolean
  idPrefix: string
  weightDelta: number
  weightFilterRadius: number
  weightFilterId: string
  strokeWeightFilter: string
  shadowFilterId: string
  defsOutlinesMarkup: string
  outlineMap: Map<string, string>
  glyphs: PreparedGlyph[]
  strokes: PreparedStroke[]
  connections: PreparedConnection[]
}

export interface BrushGeometry {
  width: number
  height: number
}

/**
 * Shared brush geometry for Canvas and SVG renderers.
 *
 * Dimensions stay in the editor's canonical font units. The surrounding
 * word-group applies the viewport scale calculated from the actual board and
 * glyph bounds, so the brush remains proportional on every responsive size.
 */
export function getBrushSquareGeometry(
  stroke: Pick<PreparedStroke, 'brushProfile' | 'isDot'>,
  progress: number,
  strokeWeight: number
): BrushGeometry {
  void progress
  const scale = Math.max(0.25, strokeWeight / DEFAULT_STROKE_WEIGHT)
  const height = (stroke.isDot ? DEFAULT_DOT_BRUSH_HEIGHT : DEFAULT_BRUSH_HEIGHT) * scale
  return {
    width: height * BRUSH_WIDTH_TO_HEIGHT_RATIO,
    height
  }
}

/**
 * Prepares scene geometry once for an entire composition.
 * Caches viewport bounds, TrueType outlines, stroke-step associations,
 * connection geometry, and all fixed stamp sample coordinates and tangent angles.
 */
export function prepareRenderScene(
  composed: ComposedGlyph[],
  timeline?: AnimationTimeline,
  renderId: string = '',
  options?: RenderOptions
): PreparedRenderScene {
  const stageWidth = options?.stageWidth ?? 600
  const stageHeight = options?.stageHeight ?? 300
  const showBaseline = options?.showBaseline ?? true
  const strokeWeight = Math.max(
    MIN_STROKE_WEIGHT,
    Math.min(MAX_STROKE_WEIGHT, options?.strokeWeight ?? DEFAULT_STROKE_WEIGHT)
  )
  const includeMedianLayer = options?.includeMedianLayer ?? false

  const viewport = computeViewportTransform(
    composed,
    stageWidth,
    stageHeight,
    options?.centerVertically ?? false
  )

  const idPrefix = renderId && renderId !== 'default' ? `${renderId}-` : ''
  const weightDelta = strokeWeight - DEFAULT_STROKE_WEIGHT
  const weightFilterRadius = Math.min(2.5, Math.abs(weightDelta) * 0.25)
  const weightFilterId = `${idPrefix}stroke-weight`
  const shadowFilterId = `${idPrefix}shadow-normalize`
  // The filter is attached to <use> elements inside the transformed word
  // group. A viewport-sized user-space filter can be evaluated before that
  // transform in Chromium and clip the entire glyph at non-default weights.
  // Keep the effect region deliberately generous; the morphology radius is
  // tiny compared with this safety bounds and the filter remains local to the
  // rendered SVG scene.
  const filterX = -100000
  const filterY = -100000
  const filterW = 200000
  const filterH = 200000
  const strokeWeightFilter =
    weightFilterRadius > 0
      ? `<filter id="${weightFilterId}" x="${filterX}" y="${filterY}" width="${filterW}" height="${filterH}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feMorphology operator="${weightDelta > 0 ? 'dilate' : 'erode'}" radius="${weightFilterRadius}" in="SourceGraphic" /></filter>`
      : ''

  const outlineMap = new Map<string, string>()
  let outlineCounter = 0
  function getOrAddOutline(path: string): string {
    let id = outlineMap.get(path)
    if (!id) {
      id = `${idPrefix}ot-${outlineCounter++}`
      outlineMap.set(path, id)
    }
    return id
  }

  const glyphs: PreparedGlyph[] = []
  const strokes: PreparedStroke[] = []

  for (let gIdx = 0; gIdx < composed.length; gIdx++) {
    const glyph = composed[gIdx]
    const gx = glyph.glyphX
    const gy = glyph.glyphY
    const glyphTransform = `translate(${gx}, ${gy})`

    if (!glyph.isSupported || !glyph.definition) {
      const unsupportedOutline = glyph.definition?.outlinePath || ''
      const unsupportedOutlineId = unsupportedOutline
        ? getOrAddOutline(unsupportedOutline)
        : undefined
      glyphs.push({
        glyphIndex: gIdx,
        glyphId: glyph.glyphId,
        glyphTransform,
        isSupported: false,
        unsupportedOutlineId,
        ghostOutlineIds: [],
        medianPaths: [],
        strokeIndices: []
      })
      continue
    }

    const definition = glyph.definition
    const outlinePath = definition.outlinePath || ''
    const outlinePaths = definition.outlinePaths?.length
      ? definition.outlinePaths
      : outlinePath
        ? [outlinePath]
        : []
    const ghostOutlineIds = outlinePaths.map((p) => getOrAddOutline(p))

    const rawStrokes = glyph.orderedStrokes || definition.strokes || []
    const strokeIndices: number[] = []
    const medianPaths: string[] = []

    for (let sIdx = 0; sIdx < rawStrokes.length; sIdx++) {
      const stroke = rawStrokes[sIdx]
      const strokeOrder = stroke.order ?? sIdx
      const isDot =
        stroke.isCandidateDot === true || stroke.type === 'dot' || glyph.semanticRole === 'dot'

      if (stroke.medianPath) {
        medianPaths.push(stroke.medianPath)
      } else {
        continue
      }

      const maskId = `${idPrefix}mask-g${gIdx}-s${strokeOrder}`
      const progressClipId = `${maskId}-progress-clip`
      const pathProps = new svgPathProperties(stroke.medianPath)
      const length = pathProps.getTotalLength()
      const brushProfile = (stroke as { brushProfile?: BrushProfile }).brushProfile
      // A continuous path mask complements sparse stamps without revealing
      // anything ahead of the moving brush. It avoids stamp-spacing seams for
      // every body stroke, including user-authored paths without a profile.
      const continuousMask = !isDot
      const spacing = stampSpacing(brushProfile, isDot, options?.stampSpacingScale, strokeWeight)
      const fixedCount = Math.floor(length / spacing)
      const samples = new Float32Array((fixedCount + 1) * 4)

      for (let index = 0; index <= fixedCount; index++) {
        const pProg = Math.min(1, (index * spacing) / length)
        const clampedProg = clamp(pProg)
        const point = pathProps.getPointAtLength(length * clampedProg)

        const halfWin = tangentWindow(brushProfile, isDot, length)
        let t0 = clampedProg - halfWin
        let t1 = clampedProg + halfWin
        if (t0 < 0) {
          t1 = Math.min(1, t1 - t0)
          t0 = 0
        } else if (t1 > 1) {
          t0 = Math.max(0, t0 - (t1 - 1))
          t1 = 1
        }
        const before = pathProps.getPointAtLength(length * t0)
        const after = pathProps.getPointAtLength(length * t1)
        const angle = Math.atan2(after.y - before.y, after.x - before.x) * (180 / Math.PI)

        const offset = index * 4
        samples[offset] = clampedProg
        samples[offset + 1] = point.x
        samples[offset + 2] = point.y
        samples[offset + 3] = angle
      }

      // Keep each mask close to the authored stroke. The old fixed 10,000 x
      // 10,000 mask surface was needlessly expensive for animated exports and
      // could force Chromium to allocate very large intermediate alpha buffers.
      let minMaskX = Infinity
      let maxMaskX = -Infinity
      let minMaskY = Infinity
      let maxMaskY = -Infinity
      for (let index = 0; index <= fixedCount; index++) {
        const offset = index * 4
        const x = samples[offset + 1]
        const y = samples[offset + 2]
        minMaskX = Math.min(minMaskX, x)
        maxMaskX = Math.max(maxMaskX, x)
        minMaskY = Math.min(minMaskY, y)
        maxMaskY = Math.max(maxMaskY, y)
      }
      const maskMargin = isDot ? 120 : 180
      const maskX = Number.isFinite(minMaskX) ? minMaskX - maskMargin : -1500
      const maskY = Number.isFinite(minMaskY) ? minMaskY - maskMargin : -1500
      const maskWidth = Number.isFinite(maxMaskX)
        ? Math.max(1, maxMaskX - minMaskX + maskMargin * 2)
        : 3000
      const maskHeight = Number.isFinite(maxMaskY)
        ? Math.max(1, maxMaskY - minMaskY + maskMargin * 2)
        : 3000

      const strokeOutlines = stroke.outlinePaths?.length
        ? stroke.outlinePaths
        : stroke.outlinePath || outlinePath
          ? [stroke.outlinePath || outlinePath]
          : []
      const strokeOutlineIds = strokeOutlines.map((p) => getOrAddOutline(p))

      const step = findStepForStroke(timeline, gIdx, stroke, sIdx)

      const strokeGlobalIndex = strokes.length
      strokes.push({
        glyphIndex: gIdx,
        strokeIndex: sIdx,
        strokeOrder,
        isDot,
        maskId,
        progressClipId,
        medianPath: stroke.medianPath,
        length,
        spacing,
        fixedCount,
        samples,
        brushProfile,
        step,
        continuousMask,
        outlineIds: strokeOutlineIds,
        pathProps,
        maskX,
        maskY,
        maskWidth,
        maskHeight
      })
      strokeIndices.push(strokeGlobalIndex)
    }

    glyphs.push({
      glyphIndex: gIdx,
      glyphId: glyph.glyphId,
      glyphTransform,
      isSupported: true,
      ghostOutlineIds,
      medianPaths,
      strokeIndices
    })
  }

  // Precompute connection ownership
  const connections: PreparedConnection[] = []
  for (let gIdx = 0; gIdx < composed.length - 1; gIdx++) {
    if (composed[gIdx + 1].glyphId === 15) continue // Skip final ب
    const glyph = composed[gIdx]
    const nextGlyph = composed[gIdx + 1]
    const nextBodyStep = timeline?.steps.find((step) => step.glyphIndex === gIdx + 1 && !step.isDot)

    // The animation timeline owns the join decision. Do not pre-reveal a
    // neighboring outline in separated-stroke mode or during a lifted move.
    if (nextBodyStep?.transition?.kind !== 'bridge') continue

    const rawStrokes = glyph.orderedStrokes || glyph.definition?.strokes || []
    const bodyStrokes = rawStrokes.filter(
      (s) => !(s.isCandidateDot === true || s.type === 'dot' || glyph.semanticRole === 'dot')
    )
    const connectingStroke =
      bodyStrokes.length > 0
        ? bodyStrokes[bodyStrokes.length - 1]
        : rawStrokes[rawStrokes.length - 1]
    const nextFirstStroke = nextBodyStep.stroke

    if (connectingStroke && nextFirstStroke) {
      const connectingStep = timeline?.steps.find(
        (step) => step.glyphIndex === gIdx && step.stroke.order === connectingStroke.order
      )
      const endProgress = connectingStep?.endProgress ?? 1
      // A clipped terminal path is used only to hand the cursor to the next
      // stroke. Its outgoing ink now completes against its own outline, so it
      // must not also mask-reveal the next glyph beyond that handoff point.
      let endPt = endProgress < 1 ? undefined : connectingStroke.endPoint
      if (!endPt && connectingStroke.medianPath) {
        try {
          const p = new svgPathProperties(connectingStroke.medianPath)
          endPt = p.getPointAtLength(p.getTotalLength() * endProgress)
        } catch {
          // ignore
        }
      }

      let startPt = nextFirstStroke.startPoint
      if (nextFirstStroke.medianPath) {
        try {
          const p = new svgPathProperties(nextFirstStroke.medianPath)
          startPt = p.getPointAtLength(
            p.getTotalLength() * (nextBodyStep.startProgress ?? 0)
          )
        } catch {
          // ignore
        }
      }

      if (endPt && startPt) {
        const ex = glyph.glyphX + endPt.x
        const ey = glyph.glyphY + endPt.y
        const sx = nextGlyph.glyphX + startPt.x
        const sy = nextGlyph.glyphY + startPt.y
        const dist = Math.hypot(ex - sx, ey - sy)

        if (dist < CONNECTION_THRESHOLD_UNITS) {
          const connStrokeOrder =
            connectingStroke.order ??
            (rawStrokes.indexOf(connectingStroke) >= 0
              ? rawStrokes.indexOf(connectingStroke)
              : rawStrokes.length - 1)
          const useHandoffMask =
            endProgress < 1 && nextBodyStep.transition?.kind === 'bridge'
          const connMaskId = useHandoffMask
            ? `${idPrefix}handoff-g${gIdx}-to-${gIdx + 1}`
            : `${idPrefix}mask-g${gIdx}-s${connStrokeOrder}`
          const nextOutlinePath = nextGlyph.definition?.outlinePath || ''
          if (nextOutlinePath) {
            const nextOutlineId = getOrAddOutline(nextOutlinePath)
            const dx = nextGlyph.glyphX - glyph.glyphX
            const dy = nextGlyph.glyphY - glyph.glyphY
            const bridgePath = nextBodyStep.transition
              ? translateSvgPath(nextBodyStep.transition.path, -glyph.glyphX, -glyph.glyphY)
              : undefined
            const bridgeLength = bridgePath
              ? new svgPathProperties(bridgePath).getTotalLength()
              : undefined
            const bridgeBrushHeight = bridgePath
              ? Math.min(
                  MAX_HANDOFF_BRUSH_HEIGHT,
                  Math.max(
                    getBrushSquareGeometry(
                      {
                        brushProfile: connectingStroke.brushProfile as BrushProfile | undefined,
                        isDot: false
                      },
                      0,
                      strokeWeight
                    ).height,
                    getBrushSquareGeometry(
                      {
                        brushProfile: nextFirstStroke.brushProfile as BrushProfile | undefined,
                        isDot: false
                      },
                      0,
                      strokeWeight
                    ).height
                  ) * HANDOFF_OVERLAP_SCALE
                )
              : undefined
            connections.push({
              fromGlyphIndex: gIdx,
              connMaskId,
              nextOutlineId,
              dx,
              dy,
              mode: useHandoffMask ? 'handoff-mask' : 'outgoing-mask',
              bridgePath,
              bridgeLength,
              bridgeStartMs: nextBodyStep.transition?.startMs,
              bridgeEndMs: nextBodyStep.transition?.endMs,
              bridgeBrushHeight
            })
          }
        }
      }
    }
  }

  let defsOutlinesMarkup = ''
  for (const [path, id] of outlineMap.entries()) {
    defsOutlinesMarkup += `<path id="${id}" d="${path}" />`
  }

  return {
    viewport,
    stageWidth,
    stageHeight,
    showBaseline,
    strokeWeight,
    includeMedianLayer,
    idPrefix,
    weightDelta,
    weightFilterRadius,
    weightFilterId,
    strokeWeightFilter,
    shadowFilterId,
    defsOutlinesMarkup,
    outlineMap,
    glyphs,
    strokes,
    connections
  }
}

/**
 * Renders a single frame from an already prepared scene at a specific timeline progress.
 * Runs in under a millisecond by reading precomputed Float32Array samples without path parsing.
 */
export function renderSvgFrame(scene: PreparedRenderScene, progressMs: number = 0): string {
  let defsContent = `<filter id="${scene.shadowFilterId}" x="-100000" y="-100000" width="200000" height="200000" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feMorphology operator="erode" radius="${SHADOW_NORMALIZE_ERODE_RADIUS}" in="SourceGraphic" result="shadow-eroded" /><feGaussianBlur in="shadow-eroded" stdDeviation="${SHADOW_NORMALIZE_BLUR_RADIUS}" /></filter>`
  let ghostLayerContent = ''
  let inkLayerContent = ''
  let medianLayerContent = ''

  const filterAttr = scene.weightFilterRadius > 0 ? ` filter="url(#${scene.weightFilterId})"` : ''

  for (const stroke of scene.strokes) {
    let progress = 0
    if (stroke.step) {
      progress = getStepInkProgress(stroke.step, progressMs)
    } else if (progressMs > 0) {
      progress = 1
    }
    progress = Math.max(progress, getBridgeHandoffProgress(stroke.step, progressMs))
    if (progress <= 0) {
      defsContent += `
        <mask id="${stroke.maskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="${fmtNum(stroke.maskX)}" y="${fmtNum(stroke.maskY)}" width="${fmtNum(stroke.maskWidth)}" height="${fmtNum(stroke.maskHeight)}">
          <rect class="mask-base" fill="#000" x="${fmtNum(stroke.maskX)}" y="${fmtNum(stroke.maskY)}" width="${fmtNum(stroke.maskWidth)}" height="${fmtNum(stroke.maskHeight)}" />
          <g class="${stroke.isDot ? 'dot-mask-stamps' : 'body-mask-stamps'}" fill="#fff"></g>
        </mask>
      `
      continue
    }

    const length = stroke.length
    const spacing = stroke.spacing
    const isDot = stroke.isDot
    const brushProfile = stroke.brushProfile
    const strokeWeight = scene.strokeWeight
    const startProgress = clamp(stroke.step?.startProgress ?? 0)
    const startLength = length * startProgress

    const progressClipPolygon = isDot
      ? getProgressClipPolygon(stroke.pathProps, length, progress)
      : null
    const startCount = Math.min(stroke.fixedCount, Math.ceil(startLength / spacing))
    const activeCount = Math.min(stroke.fixedCount, Math.floor((length * progress) / spacing))
    let fragments = ''

    for (let i = startCount; i <= activeCount; i++) {
      const offset = i * 4
      const clampedProg = stroke.samples[offset]
      const px = stroke.samples[offset + 1]
      const py = stroke.samples[offset + 2]
      const angle = stroke.samples[offset + 3]

      const { width, height } = getBrushSquareGeometry(stroke, clampedProg, scene.strokeWeight)

      fragments += `<rect x="${fmtNum(-width / 2)}" y="${fmtNum(-height / 2)}" width="${fmtNum(width)}" height="${fmtNum(height)}" transform="translate(${fmtNum(px)} ${fmtNum(py)}) rotate(${fmtNum(angle)})" />`
    }

    const lastFixed = Math.min(1, (activeCount * spacing) / length)
    if (progress > lastFixed && progress > startProgress) {
      const clampedProg = clamp(progress)
      const point = stroke.pathProps.getPointAtLength(length * clampedProg)
      const halfWin = tangentWindow(brushProfile, isDot, length)
      let t0 = clampedProg - halfWin
      let t1 = clampedProg + halfWin
      if (t0 < 0) {
        t1 = Math.min(1, t1 - t0)
        t0 = 0
      } else if (t1 > 1) {
        t0 = Math.max(0, t0 - (t1 - 1))
        t1 = 1
      }
      const before = stroke.pathProps.getPointAtLength(length * t0)
      const after = stroke.pathProps.getPointAtLength(length * t1)
      const angle = Math.atan2(after.y - before.y, after.x - before.x) * (180 / Math.PI)
      const { width, height } = getBrushSquareGeometry(stroke, clampedProg, scene.strokeWeight)

      fragments += `<rect x="${fmtNum(-width / 2)}" y="${fmtNum(-height / 2)}" width="${fmtNum(width)}" height="${fmtNum(height)}" transform="translate(${fmtNum(point.x)} ${fmtNum(point.y)}) rotate(${fmtNum(angle)})" />`
    }

    if (stroke.continuousMask && progress > startProgress) {
      const { height: brushHeight } = getBrushSquareGeometry(stroke, progress, strokeWeight)
      const dashLength = Math.max(length * (progress - startProgress), 0.001)
      fragments += `<path class="continuous-mask-path" d="${stroke.medianPath}" fill="none" stroke="#fff" stroke-width="${fmtNum(brushHeight)}" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="${dashLength} ${Math.max(length - dashLength, 0.001)}" stroke-dashoffset="${fmtNum(-startLength)}"></path>`
    }

    defsContent += `
      ${
        progressClipPolygon
          ? `<clipPath id="${stroke.progressClipId}" clipPathUnits="userSpaceOnUse"><polygon points="${progressClipPolygon}"></polygon></clipPath>`
          : ''
      }
      <mask id="${stroke.maskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="${fmtNum(stroke.maskX)}" y="${fmtNum(stroke.maskY)}" width="${fmtNum(stroke.maskWidth)}" height="${fmtNum(stroke.maskHeight)}">
        <rect class="mask-base" fill="#000" x="${fmtNum(stroke.maskX)}" y="${fmtNum(stroke.maskY)}" width="${fmtNum(stroke.maskWidth)}" height="${fmtNum(stroke.maskHeight)}" />
        <g class="${isDot ? 'dot-mask-stamps' : 'body-mask-stamps'}" fill="#fff"${progressClipPolygon ? ` clip-path="url(#${stroke.progressClipId})"` : ''}>${fragments}</g>
      </mask>
    `
  }

  for (const connection of scene.connections) {
    if (
      !connection.bridgePath ||
      !connection.bridgeLength ||
      connection.bridgeStartMs === undefined ||
      connection.bridgeEndMs === undefined
    ) {
      continue
    }

    const duration = connection.bridgeEndMs - connection.bridgeStartMs
    const transitionProgress =
      duration > 0
        ? progressMs <= connection.bridgeStartMs
          ? 0
          : progressMs >= connection.bridgeEndMs
            ? 1
            : smoothProgress((progressMs - connection.bridgeStartMs) / duration)
        : progressMs >= connection.bridgeEndMs
          ? 1
          : 0
    const maskX = -10000
    const maskY = -10000
    const maskSize = 20000
    const dashLength = Math.max(connection.bridgeLength * transitionProgress, 0.001)
    defsContent += `<mask id="${connection.connMaskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}"><rect fill="#000" x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" /><path class="connection-mask-path" d="${connection.bridgePath}" fill="none" stroke="#fff" stroke-width="${fmtNum(connection.bridgeBrushHeight || DEFAULT_BRUSH_HEIGHT)}" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="${fmtNum(dashLength)} ${fmtNum(Math.max(connection.bridgeLength - dashLength, 0.001))}" /></mask>`
  }

  for (const glyph of scene.glyphs) {
    if (!glyph.isSupported) {
      if (glyph.unsupportedOutlineId) {
        ghostLayerContent += `<g class="glyph-ghost unsupported" data-glyph-id="${glyph.glyphId}" transform="${glyph.glyphTransform}"><use href="#${glyph.unsupportedOutlineId}" xlink:href="#${glyph.unsupportedOutlineId}" class="ghost-outline unsupported" filter="url(#${scene.shadowFilterId})"${filterAttr} /></g>`
      }
      continue
    }

    if (glyph.ghostOutlineIds.length > 0) {
      ghostLayerContent += `<g class="glyph-ghost" data-glyph-id="${glyph.glyphId}" transform="${glyph.glyphTransform}">${glyph.ghostOutlineIds
        .map((id) => `<use href="#${id}" xlink:href="#${id}" class="ghost-outline" filter="url(#${scene.shadowFilterId})"${filterAttr} />`)
        .join('')}</g>`
    }

    let glyphInk = ''
    for (const sIdx of glyph.strokeIndices) {
      const stroke = scene.strokes[sIdx]
      // Keep the masked ink node mounted from the first frame. The live board
      // incrementally fills these masks after mount; omitting the node at
      // progress 0 leaves nothing for later mask stamps to reveal.
      if (stroke.outlineIds.length > 0) {
        glyphInk += stroke.outlineIds
          .map(
            (id) =>
              `<use href="#${id}" xlink:href="#${id}" class="ink-outline" mask="url(#${stroke.maskId})"${filterAttr} />`
          )
          .join('')
      }
    }

    for (const conn of scene.connections) {
      if (conn.fromGlyphIndex === glyph.glyphIndex) {
        if (
          conn.bridgePath &&
          conn.bridgeLength &&
          conn.bridgeStartMs !== undefined &&
          conn.bridgeEndMs !== undefined
        ) {
          const duration = conn.bridgeEndMs - conn.bridgeStartMs
          const progress =
            duration > 0
              ? progressMs <= conn.bridgeStartMs
                ? 0
                : progressMs >= conn.bridgeEndMs
                  ? 1
                  : smoothProgress((progressMs - conn.bridgeStartMs) / duration)
              : progressMs >= conn.bridgeEndMs
                ? 1
                : 0
          const dashLength = progress > 0 ? conn.bridgeLength * progress : 0
          glyphInk += `<path id="${conn.connMaskId}-ink" class="ink-connection-bridge" d="${conn.bridgePath}" fill="none" stroke-width="${fmtNum(conn.bridgeBrushHeight || DEFAULT_BRUSH_HEIGHT)}" stroke-dasharray="${fmtNum(dashLength)} ${fmtNum(Math.max(conn.bridgeLength - dashLength, 0.001))}" />`
        }
        glyphInk += `<g mask="url(#${conn.connMaskId})"><use href="#${conn.nextOutlineId}" xlink:href="#${conn.nextOutlineId}" class="ink-outline" transform="translate(${conn.dx}, ${conn.dy})"${filterAttr} /></g>`
      }
    }

    if (glyphInk) {
      inkLayerContent += `<g class="glyph-ink" data-glyph-id="${glyph.glyphId}" transform="${glyph.glyphTransform}">${glyphInk}</g>`
    }

    if (scene.includeMedianLayer && glyph.medianPaths.length > 0) {
      const medPaths = glyph.medianPaths
        .map((d) => `<path d="${d}" class="median-path" fill="none" />`)
        .join('')
      medianLayerContent += `<g class="glyph-median" data-glyph-id="${glyph.glyphId}" transform="${glyph.glyphTransform}">${medPaths}</g>`
    }
  }

  const { scale, baselineY, tx } = scene.viewport
  return `<svg id="writing-stage" width="100%" height="100%" viewBox="0 0 ${scene.stageWidth} ${scene.stageHeight}" preserveAspectRatio="xMidYMid meet" role="img">
        <defs>
          ${scene.strokeWeightFilter}
          ${scene.defsOutlinesMarkup}
          ${defsContent}
        </defs>

        <!-- Baseline -->
        ${scene.showBaseline ? `<line id="baseline" class="baseline" x1="58" x2="${scene.stageWidth - 58}" y1="${baselineY}" y2="${baselineY}"></line>` : ''}

        <g id="word-group" transform="translate(${tx}, ${baselineY}) scale(${scale})">
        <g id="ghost-layer" class="outline-layer" aria-hidden="true">
          ${ghostLayerContent}
        </g>

        <g id="ink-layer" class="outline-layer" aria-hidden="true">
          ${inkLayerContent}
        </g>

        ${scene.includeMedianLayer ? `<g id="median-layer" aria-hidden="true">${medianLayerContent}</g>` : ''}
        </g>
      </svg>`
}

/**
 * Phase 3 generic SVG renderer (compatibility wrapper).
 * Consumes: ComposedGlyph[], timeline, progressMs, renderId, options, cachedScene.
 * Produces: Generic, centered, layered, animated SVG markup.
 */
export function renderSvg(
  composed: ComposedGlyph[],
  timeline?: AnimationTimeline,
  progressMs: number = 0,
  renderId: string = '',
  options?: RenderOptions,
  cachedScene?: PreparedRenderScene
): string {
  const scene = cachedScene ?? prepareRenderScene(composed, timeline, renderId, options)
  return renderSvgFrame(scene, progressMs)
}
