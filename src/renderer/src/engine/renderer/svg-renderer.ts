import { ComposedGlyph } from '../composition/glyph-composer'
import {
  AnimationTimeline,
  AnimationStep,
  CONNECTION_THRESHOLD_UNITS
} from '../animation/animation-engine'
import { StrokeItem } from '../data/stroke-registry'
import { svgPathProperties } from 'svg-path-properties'

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function smoothstep(progress: number): number {
  const value = clamp(progress)
  return value * value * (3 - 2 * value)
}

const DEFAULT_BODY_BRUSH_RADIUS = 68
const MAX_PROFILE_BODY_BRUSH_RADIUS = 96
const DEFAULT_DOT_BRUSH_RADIUS = 48
const DEFAULT_BODY_MAJOR_SCALE = 1.18
const DEFAULT_BODY_MINOR_SCALE = 0.8
const DEFAULT_DOT_AXIS_SCALE = 1.15
const DEFAULT_BODY_STAMP_SPACING = 2.8
const DEFAULT_DOT_STAMP_SPACING = 1.8
const MIN_DOT_AXIS_RADIUS = 50
const DEFAULT_STROKE_WEIGHT = 102
const MIN_STROKE_WEIGHT = 94
const MAX_STROKE_WEIGHT = 110
const MAX_BODY_TANGENT_WINDOW = 0.014
const MAX_DOT_TANGENT_WINDOW = 0.08
const BODY_TANGENT_WINDOW_UNITS = 9
const DOT_TANGENT_WINDOW_UNITS = 6

function strokeWeightScale(strokeWeight: number): number {
  // Keep the control narrow in font units while making its brush effect
  // perceptible during progressive drawing.
  return Math.pow(strokeWeight / DEFAULT_STROKE_WEIGHT, 2.5)
}

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

function brushRadius(
  profile: BrushProfile | undefined,
  progress: number,
  isDot: boolean = false,
  strokeWeight: number = DEFAULT_STROKE_WEIGHT
): number {
  const weightScale = strokeWeightScale(strokeWeight)
  if (isDot) {
    const dr = profile?.dotRadius
    const dotBase =
      typeof dr === 'number' && dr > 0
        ? Math.min(dr, DEFAULT_DOT_BRUSH_RADIUS)
        : DEFAULT_DOT_BRUSH_RADIUS
    return dotBase * weightScale
  }
  if (!profile) return DEFAULT_BODY_BRUSH_RADIUS * weightScale
  const start = profile.startRampEnd ?? 0.15
  const end = profile.endRampStart ?? 0.8
  const baseRadius = Math.min(
    profile.bodyRadius || DEFAULT_BODY_BRUSH_RADIUS,
    MAX_PROFILE_BODY_BRUSH_RADIUS
  )
  const baseStart = Math.min(profile.startRadius || 10, 15)
  const baseEnd = Math.min(profile.endRadius || 52, 54)
  if (progress < start)
    return lerp(baseStart, baseRadius, smoothstep(progress / start)) * weightScale
  if (progress > end)
    return lerp(baseRadius, baseEnd, smoothstep((progress - end) / (1 - end))) * weightScale
  return baseRadius * weightScale
}

function profileValue(
  profile: BrushProfile | undefined,
  key: string,
  progress: number,
  fallback: number
): number {
  if (!profile) return fallback
  const value = profile[key]
  if (typeof value === 'number') return value
  if (!value || typeof value !== 'object') return fallback
  if (progress < (profile.startRampEnd ?? 0.15)) return value.start ?? fallback
  if (progress > (profile.endRampStart ?? 0.8)) return value.end ?? fallback
  return value.body ?? fallback
}

function stampSpacing(profile: BrushProfile | undefined, isDot: boolean): number {
  const spacing = profile?.stampSpacing
  if (typeof spacing === 'number') return Math.max(1, spacing)
  return isDot ? DEFAULT_DOT_STAMP_SPACING : DEFAULT_BODY_STAMP_SPACING
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
    const outline = glyph.definition?.outlinePath
    if (outline) {
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
export function renderSvg(
  composed: ComposedGlyph[],
  timeline?: AnimationTimeline,
  progressMs: number = 0,
  renderId: string = '',
  options?: RenderOptions
): string {
  const stageWidth = options?.stageWidth ?? 600
  const stageHeight = options?.stageHeight ?? 300
  const showBaseline = options?.showBaseline ?? true
  const strokeWeight = Math.max(
    MIN_STROKE_WEIGHT,
    Math.min(MAX_STROKE_WEIGHT, options?.strokeWeight ?? DEFAULT_STROKE_WEIGHT)
  )

  // 1. Compute exact viewport transform
  const { scale, baselineY, tx } = computeViewportTransform(
    composed,
    stageWidth,
    stageHeight,
    options?.centerVertically ?? false
  )

  let defsContent = ''
  let ghostLayerContent = ''
  let inkLayerContent = ''
  let medianLayerContent = ''

  // Deterministic mask ID prefix (only if explicit custom renderId is provided)
  const idPrefix = renderId && renderId !== 'default' ? `${renderId}-` : ''
  const weightDelta = strokeWeight - DEFAULT_STROKE_WEIGHT
  const weightFilterRadius = Math.min(2.5, Math.abs(weightDelta) * 0.25)
  const weightFilterId = `${idPrefix}stroke-weight`
  const strokeWeightFilter =
    weightFilterRadius > 0
      ? `<filter id="${weightFilterId}" x="-5000" y="-5000" width="10000" height="10000" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feMorphology operator="${weightDelta > 0 ? 'dilate' : 'erode'}" radius="${weightFilterRadius}" in="SourceGraphic" /></filter>`
      : ''

  // 2. Iterate through composed glyphs
  for (let gIdx = 0; gIdx < composed.length; gIdx++) {
    const glyph = composed[gIdx]
    const gx = glyph.glyphX
    const gy = glyph.glyphY

    const glyphTransform = `translate(${gx}, ${gy})`

    // --- UNSUPPORTED GLYPH HANDLING ---
    if (!glyph.isSupported || !glyph.definition) {
      // If unsupported, render ghost outline ONLY if safe font geometry exists.
      // Zero animated strokes, no fabricated medianPath, no fabricated mask stamps.
      const unsupportedOutline = glyph.definition?.outlinePath || ''
      if (unsupportedOutline) {
        ghostLayerContent += `<g class="glyph-ghost unsupported" data-glyph-id="${glyph.glyphId}" transform="${glyphTransform}"><path d="${unsupportedOutline}" class="ghost-outline unsupported"${weightFilterRadius > 0 ? ` filter="url(#${weightFilterId})"` : ''} /></g>`
      }
      continue
    }

    // --- SUPPORTED GLYPH RENDERING ---
    const definition = glyph.definition
    const outlinePath = definition.outlinePath || ''
    const outlinePaths = definition.outlinePaths?.length
      ? definition.outlinePaths
      : outlinePath
        ? [outlinePath]
        : []
    const strokes = glyph.orderedStrokes || definition.strokes || []

    // Layer 1: Ghost outline (always visible in low opacity reference layer)
    if (outlinePaths.length > 0) {
      ghostLayerContent += `<g class="glyph-ghost" data-glyph-id="${glyph.glyphId}" transform="${glyphTransform}">${outlinePaths
        .map(
          (path) =>
            `<path d="${path}" class="ghost-outline"${weightFilterRadius > 0 ? ` filter="url(#${weightFilterId})"` : ''} />`
        )
        .join('')}</g>`
    }

    let glyphInkContent = ''
    let glyphMedianContent = ''

    // Layer 2 & 3: Strokes & Mask Stamps
    for (let sIdx = 0; sIdx < strokes.length; sIdx++) {
      const stroke = strokes[sIdx]
      const strokeOrder = stroke.order ?? sIdx
      const isDot = stroke.isCandidateDot ?? (stroke.type === 'dot' || glyph.semanticRole === 'dot')

      // Find animation step
      const step = findStepForStroke(timeline, gIdx, stroke, sIdx)
      let progress = 0
      if (step) {
        const duration = step.endMs - step.startMs
        const t = progressMs - step.startMs
        const linearT = clamp(duration > 0 ? t / duration : 0)
        // Calligraphic smoothstep easing for silky acceleration and deceleration
        progress = linearT * linearT * (3 - 2 * linearT)
      } else if (progressMs > 0 && (!timeline || timeline.steps.length === 0)) {
        // Full reveal if progress requested without timeline
        progress = 1
      }

      // Median path (for debug / reference layer in local font units)
      if (stroke.medianPath) {
        glyphMedianContent += `<path d="${stroke.medianPath}" class="median-path" fill="none" />`
      }

      if (!stroke.medianPath) continue

      // Deterministic mask ID
      const maskId = `${idPrefix}mask-g${gIdx}-s${strokeOrder}`

      // Preserve verified stamping mathematics with smooth sliding tangent and denser coverage
      const pathProps = new svgPathProperties(stroke.medianPath)
      const length = pathProps.getTotalLength()
      const brushProfile = (stroke as { brushProfile?: BrushProfile }).brushProfile
      const continuousMask = !isDot && brushProfile?.continuousMask === 1
      const progressClipId = `${maskId}-progress-clip`
      // The tangent clip is safe for dots, but not for looping bodies: when a
      // circle revisits an earlier area, the half-plane would erase that area.
      const progressClipPolygon = isDot ? getProgressClipPolygon(pathProps, length, progress) : null

      const spacing = stampSpacing(brushProfile, isDot)
      const fixedCount = Math.floor((length * progress) / spacing)
      let fragments = ''

      const stamp = (pathProgress: number): void => {
        const clampedProg = clamp(pathProgress)
        const point = pathProps.getPointAtLength(length * clampedProg)

        // Continuous sliding window for tangent computation, preventing rotation wobble near endpoints
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
        const radius = brushRadius(brushProfile, clampedProg, isDot, strokeWeight)
        const majorScale = profileValue(
          brushProfile,
          'majorScale',
          clampedProg,
          isDot ? DEFAULT_DOT_AXIS_SCALE : DEFAULT_BODY_MAJOR_SCALE
        )
        const minorScale = profileValue(
          brushProfile,
          'minorScale',
          clampedProg,
          isDot ? DEFAULT_DOT_AXIS_SCALE : DEFAULT_BODY_MINOR_SCALE
        )
        const major = isDot
          ? Math.max(radius * majorScale, MIN_DOT_AXIS_RADIUS * strokeWeightScale(strokeWeight))
          : radius * majorScale
        const minor = isDot
          ? Math.max(radius * minorScale, MIN_DOT_AXIS_RADIUS * strokeWeightScale(strokeWeight))
          : radius * minorScale
        fragments += `<ellipse cx="0" cy="0" rx="${major}" ry="${minor}" transform="translate(${point.x} ${point.y}) rotate(${angle})"></ellipse>`
      }

      for (let index = 0; index <= fixedCount; index++) {
        stamp(Math.min(1, (index * spacing) / length))
      }
      const lastFixed = Math.min(1, (fixedCount * spacing) / length)
      if (progress > lastFixed) stamp(progress)

      if (continuousMask && progress > 0) {
        const maskRadius = brushRadius(brushProfile, progress, false, strokeWeight)
        const maskScale = profileValue(
          brushProfile,
          'minorScale',
          progress,
          DEFAULT_BODY_MINOR_SCALE
        )
        const dashLength = Math.max(length * progress, 0.001)
        fragments += `<path d="${stroke.medianPath}" fill="none" stroke="#fff" stroke-width="${maskRadius * 2 * maskScale}" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="${dashLength} ${Math.max(length - dashLength, 0.001)}"></path>`
      }

      // Build mask in local glyph font units
      // Using generous mask bounds so no glyph portion is clipped
      defsContent += `
        ${
          progressClipPolygon
            ? `<clipPath id="${progressClipId}" clipPathUnits="userSpaceOnUse"><polygon points="${progressClipPolygon}"></polygon></clipPath>`
            : ''
        }
        <mask id="${maskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-5000" y="-5000" width="10000" height="10000">
          <rect class="mask-base" fill="#000" x="-5000" y="-5000" width="10000" height="10000"></rect>
          <g class="${isDot ? 'dot-mask-stamps' : 'body-mask-stamps'}" fill="#fff"${progressClipPolygon ? ` clip-path="url(#${progressClipId})"` : ''}>${fragments}</g>
        </mask>
      `

      // Ink outline (Layer 2) - revealed progressively through the mask
      const strokeOutlines = stroke.outlinePaths?.length
        ? stroke.outlinePaths
        : stroke.outlinePath || outlinePath
          ? [stroke.outlinePath || outlinePath]
          : []
      if (progress > 0 && strokeOutlines.length > 0) {
        glyphInkContent += strokeOutlines
          .map(
            (strokeOutline) =>
              `<path d="${strokeOutline}" class="ink-outline" mask="url(#${maskId})"${weightFilterRadius > 0 ? ` filter="url(#${weightFilterId})"` : ''} />`
          )
          .join('')
      }
    }

    // Shared masking for connected glyphs:
    // If the next glyph touches this one, inject the next glyph's outline into this glyph's
    // connecting stroke ink, masked by that connecting stroke's mask.
    // The brush bleed naturally pre-reveals the overlapping connection zone, eliminating any visual gap/lag.
    // Final ب owns and reveals its complete outline in its own stroke. Do not
    // inject that same outline through the preceding connection mask, or the
    // letter appears twice in connected words such as كب.
    if (gIdx < composed.length - 1 && composed[gIdx + 1].glyphId !== 15) {
      const nextGlyph = composed[gIdx + 1]
      const bodyStrokes = strokes.filter(
        (s) => !(s.isCandidateDot ?? (s.type === 'dot' || glyph.semanticRole === 'dot'))
      )
      const connectingStroke =
        bodyStrokes.length > 0 ? bodyStrokes[bodyStrokes.length - 1] : strokes[strokes.length - 1]
      const nextStrokes = nextGlyph.orderedStrokes || nextGlyph.definition?.strokes || []
      const nextFirstStroke = nextStrokes[0]

      if (connectingStroke && nextFirstStroke) {
        let endPt = connectingStroke.endPoint
        if (!endPt && connectingStroke.medianPath) {
          try {
            const p = new svgPathProperties(connectingStroke.medianPath)
            endPt = p.getPointAtLength(p.getTotalLength())
          } catch (err) {
            throw new Error(
              `[svg-renderer] Failed to calculate endPoint from medianPath for connecting stroke of glyph "${glyph.glyphName || glyph.glyphId}": ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        let startPt = nextFirstStroke.startPoint
        if (!startPt && nextFirstStroke.medianPath) {
          try {
            const p = new svgPathProperties(nextFirstStroke.medianPath)
            startPt = p.getPointAtLength(0)
          } catch (err) {
            throw new Error(
              `[svg-renderer] Failed to calculate startPoint from medianPath for first stroke of glyph "${nextGlyph.glyphName || nextGlyph.glyphId}": ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        if (endPt && startPt) {
          const ex = gx + endPt.x
          const ey = gy + endPt.y
          const sx = nextGlyph.glyphX + startPt.x
          const sy = nextGlyph.glyphY + startPt.y
          const dist = Math.hypot(ex - sx, ey - sy)

          if (dist < CONNECTION_THRESHOLD_UNITS) {
            const connStrokeOrder =
              connectingStroke.order ??
              (strokes.indexOf(connectingStroke) >= 0
                ? strokes.indexOf(connectingStroke)
                : strokes.length - 1)
            const connMaskId = `${idPrefix}mask-g${gIdx}-s${connStrokeOrder}`
            const nextOutlinePath = nextGlyph.definition?.outlinePath || ''

            if (nextOutlinePath) {
              const dx = nextGlyph.glyphX - gx
              const dy = nextGlyph.glyphY - gy
              glyphInkContent += `<g mask="url(#${connMaskId})"><path d="${nextOutlinePath}" class="ink-outline" transform="translate(${dx}, ${dy})"${weightFilterRadius > 0 ? ` filter="url(#${weightFilterId})"` : ''} /></g>`
            }
          }
        }
      }
    }

    if (glyphInkContent) {
      inkLayerContent += `<g class="glyph-ink" data-glyph-id="${glyph.glyphId}" transform="${glyphTransform}">${glyphInkContent}</g>`
    }

    if (glyphMedianContent) {
      medianLayerContent += `<g class="glyph-median" data-glyph-id="${glyph.glyphId}" transform="${glyphTransform}">${glyphMedianContent}</g>`
    }
  }

  return `<svg id="writing-stage" width="100%" height="100%" viewBox="0 0 ${stageWidth} ${stageHeight}" role="img">
        <defs>
          ${strokeWeightFilter}
          ${defsContent}
        </defs>

        <!-- Baseline -->
        ${showBaseline ? `<line id="baseline" class="baseline" x1="58" x2="${stageWidth - 58}" y1="${baselineY}" y2="${baselineY}"></line>` : ''}

        <g id="word-group" transform="translate(${tx}, ${baselineY}) scale(${scale})">
        <g id="ghost-layer" class="outline-layer" aria-hidden="true">
          ${ghostLayerContent}
        </g>

        <g id="ink-layer" class="outline-layer" aria-hidden="true">
          ${inkLayerContent}
        </g>

        <g id="median-layer" aria-hidden="true">
          ${medianLayerContent}
        </g>
        </g>
      </svg>`
}
