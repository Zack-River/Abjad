import { canonicalDotOutlineAt } from './canonical-stroke-paths'

export interface Point2D {
  x: number
  y: number
  anchor?: string
  semanticAnchor?: string
}

export interface PointWithWidth {
  x: number
  y: number
  t?: number
  width?: number
}

export interface StrokeItem {
  sourceGlyphId?: number
  order: number
  originalOrder?: number
  priority?: number
  type?: string
  isCandidateDot?: boolean
  direction?: string
  length?: number
  durationMs?: number
  delayMs?: number
  startPoint: Point2D | null
  endPoint: Point2D | null
  medianPath: string
  outlinePath?: string
  outlinePaths?: string[]
  outlineComponentOffset?: Point2D
  brushProfile?: Record<string, unknown>
  points: [number, number][] | number[][]
  pointsWithWidth: PointWithWidth[]
}

/**
 * Order dot marks using the educational sweep: bottom-right, top-center,
 * bottom-left for three dots. Two-dot groups use bottom before top.
 */
export function orderDotItems<T>(items: T[], getPoint: (item: T) => Point2D | null): T[] {
  const positioned = items.map((item, index) => ({ item, index, point: getPoint(item) }))
  const fallbackPoint = { x: 0, y: 0 }
  const pointOf = (entry: (typeof positioned)[number]) => entry.point || fallbackPoint

  if (positioned.length === 3) {
    const centerX = positioned.reduce((sum, entry) => sum + pointOf(entry).x, 0) / 3
    const topIndex = positioned.reduce((best, entry, index, all) => {
      const bestPoint = pointOf(all[best])
      const point = pointOf(entry)
      if (point.y < bestPoint.y) return index
      if (point.y === bestPoint.y) {
        return Math.abs(point.x - centerX) < Math.abs(bestPoint.x - centerX) ? index : best
      }
      return best
    }, 0)
    const top = positioned[topIndex]
    const sides = positioned
      .filter((_, index) => index !== topIndex)
      .sort((a, b) => pointOf(b).x - pointOf(a).x)
    return [sides[0], top, sides[1]].map((entry) => entry.item)
  }

  return positioned
    .sort((a, b) => {
      const pointA = pointOf(a)
      const pointB = pointOf(b)
      return pointB.y - pointA.y || pointB.x - pointA.x || a.index - b.index
    })
    .map((entry) => entry.item)
}

const outlineContourCache = new Map<string, string[]>()

/** Keep independent TrueType contours independent during progressive masking. */
export function splitOutlineContours(outlinePath?: string): string[] {
  if (!outlinePath) return []
  const cached = outlineContourCache.get(outlinePath)
  if (cached) return cached
  const contours = outlinePath.match(/M[^M]*/g) || []
  const result = contours.length > 0 ? contours.map((contour) => contour.trim()) : [outlinePath]
  outlineContourCache.set(outlinePath, result)
  return result
}

export function assignOutlineComponents(strokes: StrokeItem[], outlinePath?: string): StrokeItem[] {
  const contours = splitOutlineContours(outlinePath)

  // A single educational stroke owns every contour of its glyph.
  if (contours.length <= 1 || strokes.length === 1) {
    if (contours.length <= 1 || strokes.length !== 1) return strokes
    return strokes.map((stroke) => ({ ...stroke, outlinePaths: contours }))
  }

  // When the font provides one contour per educational stroke, keep the
  // components independent so a progressive mask cannot reveal a later
  // contour through an earlier movement.
  if (contours.length === strokes.length) {
    return strokes.map((stroke, index) => ({
      ...stroke,
      outlinePath: contours[index],
      outlinePaths: [contours[index]]
    }))
  }

  return strokes
}

export function reverseStroke(s: StrokeItem): StrokeItem {
  if (!s) return s
  const pts = s.pointsWithWidth || []
  if (pts.length < 2) return s
  const revPts = pts
    .slice()
    .reverse()
    .map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
  const pCoords = revPts.map((p) => [p.x, p.y] as [number, number])
  const dx = revPts[revPts.length - 1].x - revPts[0].x
  const dy = revPts[revPts.length - 1].y - revPts[0].y
  let dir = 'right_to_left'
  if (Math.abs(dy) > Math.abs(dx) * 1.5) {
    dir = dy > 0 ? 'top_to_bottom' : 'bottom_to_top'
  } else {
    dir = dx > 0 ? 'left_to_right' : 'right_to_left'
  }
  return {
    ...s,
    startPoint: { x: revPts[0].x, y: revPts[0].y },
    endPoint: { x: revPts[revPts.length - 1].x, y: revPts[revPts.length - 1].y },
    direction: dir,
    points: pCoords,
    pointsWithWidth: revPts,
    medianPath: `M ${revPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
  }
}

function hasDrawableMedianPath(stroke: StrokeItem): boolean {
  return /[LC]/.test(stroke.medianPath || '')
}

function canonicalDotSweep(stroke: StrokeItem): StrokeItem {
  const pathNumbers = [...(stroke.medianPath || '').matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
  const points = stroke.pointsWithWidth || []
  const sourceStart = stroke.startPoint || (points.length > 0 ? points[0] : null)
  const sourceEnd = stroke.endPoint || (points.length > 1 ? points[points.length - 1] : null)
  const hasDistinctEndpoints =
    sourceStart &&
    sourceEnd &&
    (sourceStart.x !== sourceEnd.x || sourceStart.y !== sourceEnd.y)
  const start = hasDistinctEndpoints
    ? sourceStart
    : pathNumbers.length >= 2
      ? { x: pathNumbers[0], y: pathNumbers[1] }
      : sourceStart
  const end = hasDistinctEndpoints
    ? sourceEnd
    : pathNumbers.length >= 4
      ? { x: pathNumbers[pathNumbers.length - 2], y: pathNumbers[pathNumbers.length - 1] }
      : sourceEnd
  if (!start || !end) return { ...stroke, direction: 'bottom_to_top' }

  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  // The verified dot gesture uses a longer diagonal sweep so the dot fills
  // progressively instead of reading as a thin line. Keep each dot centered
  // on its authentic anchor while sharing the same educational motion.
  const halfWidth = 20
  const halfHeight = 41.1
  const sweepStart = { x: center.x + halfWidth, y: center.y - halfHeight }
  const sweepEnd = { x: center.x - halfWidth, y: center.y + halfHeight }
  const width = points[0]?.width || 42
  const sweepPoints: PointWithWidth[] = [
    { ...sweepStart, t: 0, width },
    { ...sweepEnd, t: 1, width }
  ]

  return {
    ...stroke,
    direction: 'bottom_to_top',
    startPoint: sweepStart,
    endPoint: sweepEnd,
    points: [[sweepStart.x, sweepStart.y], [sweepEnd.x, sweepEnd.y]],
    pointsWithWidth: sweepPoints,
    medianPath: `M ${sweepStart.x.toFixed(1)} ${sweepStart.y.toFixed(1)} L ${sweepEnd.x.toFixed(1)} ${sweepEnd.y.toFixed(1)}`
  }
}

function normalizeDotSweep(strokes: StrokeItem[]): StrokeItem[] {
  const drawableStrokes = strokes.filter(hasDrawableMedianPath)
  const dotStrokes = drawableStrokes.filter((stroke) => stroke.isCandidateDot || stroke.type === 'dot')
  if (dotStrokes.length === 0) return drawableStrokes

  const bodyStrokes = drawableStrokes.filter(
    (stroke) => !(stroke.isCandidateDot || stroke.type === 'dot')
  )
  const orderedDots = orderDotItems(dotStrokes, (stroke) => {
    const start = stroke.startPoint || stroke.pointsWithWidth[0]
    const end = stroke.endPoint || stroke.pointsWithWidth[stroke.pointsWithWidth.length - 1]
    if (!start && !end) return null
    const first = start || end!
    const last = end || start!
    return {
      x: (first.x + last.x) / 2,
      y: (first.y + last.y) / 2
    }
  }).map(canonicalDotSweep)

  return [...bodyStrokes, ...orderedDots].map((stroke, index) => ({
    ...stroke,
    order: index
  }))
}

export interface NormalizationContext {
  char?: string
  id?: string
  word?: string
  outlinePath?: string
}

export function normalizeLetterStrokes(
  strokes: StrokeItem[],
  context: NormalizationContext
): StrokeItem[] {
  let sourceStrokes = [...(strokes || [])]
  const char = context.char
  const id = context.id

  if (char === 'ج') {
    const beak = sourceStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 2)
    const belly = sourceStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 1)
    const dot = sourceStrokes.find((s) => s.isCandidateDot || s.originalOrder === 0)
    sourceStrokes = [beak, belly, dot].filter((s): s is StrokeItem => !!s)
  } else if (char === 'ح') {
    const beak = sourceStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 0)
    const belly = sourceStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 1)
    sourceStrokes = [beak, belly].filter((s): s is StrokeItem => !!s)
  } else if (char === 'خ') {
    const beak = sourceStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 0)
    const belly = sourceStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 1)
    const dot = sourceStrokes.find((s) => s.isCandidateDot || s.originalOrder === 2)
    sourceStrokes = [beak, belly, dot].filter((s): s is StrokeItem => !!s)
  } else if (char === 'س' || char === 'ش') {
    const bodyStrokes = sourceStrokes.filter((s) => !s.isCandidateDot)
    const dotStrokes = sourceStrokes
      .filter((s) => s.isCandidateDot)
      .sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
      .map((stroke) => {
        const point = stroke.pointsWithWidth?.[0] || stroke.startPoint || stroke.endPoint
        if (!point) return stroke
        const outlinePath = canonicalDotOutlineAt(point)
        return { ...stroke, outlinePath, outlinePaths: [outlinePath] }
      })
    bodyStrokes.sort((a, b) => {
      const maxA = Math.max(...(a.points || []).map((p) => (Array.isArray(p) ? p[0] : 0)))
      const maxB = Math.max(...(b.points || []).map((p) => (Array.isArray(p) ? p[0] : 0)))
      return maxB - maxA
    })
    sourceStrokes = [...bodyStrokes, ...dotStrokes]
  } else if (char === 'ء' || (id && id.includes('ء'))) {
    if (sourceStrokes.length >= 2) {
      if (sourceStrokes[0]?.pointsWithWidth?.length === 19) {
        const s0 = sourceStrokes[0]
        const s1 = sourceStrokes[1]
        const headPts = s0.pointsWithWidth.slice(0, 15)
        const linePts = [...s0.pointsWithWidth.slice(15).reverse(), ...s1.pointsWithWidth.slice(1)]
        const headStroke: StrokeItem = {
          ...s0,
          order: 0,
          originalOrder: 0,
          startPoint: { x: headPts[0].x, y: headPts[0].y },
          endPoint: { x: headPts[headPts.length - 1].x, y: headPts[headPts.length - 1].y },
          direction: 'right_to_left',
          points: headPts.map((p) => [p.x, p.y] as [number, number]),
          pointsWithWidth: headPts,
          medianPath: `M ${headPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
        }
        const lineStroke: StrokeItem = {
          ...s1,
          order: 1,
          originalOrder: 1,
          startPoint: { x: linePts[0].x, y: linePts[0].y },
          endPoint: { x: linePts[linePts.length - 1].x, y: linePts[linePts.length - 1].y },
          direction: 'right_to_left',
          points: linePts.map((p) => [p.x, p.y] as [number, number]),
          pointsWithWidth: linePts,
          medianPath: `M ${linePts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
        }
        sourceStrokes = [headStroke, lineStroke]
      } else {
        const arc = sourceStrokes.find((s) => s.originalOrder === 0) || sourceStrokes[0]
        let line = sourceStrokes.find((s) => s.originalOrder === 1) || sourceStrokes[1]
        const others = sourceStrokes.filter((s) => s !== arc && s !== line)
        if (line && line.startPoint && line.endPoint && line.startPoint.x < line.endPoint.x) {
          line = reverseStroke(line)
        }
        sourceStrokes = [arc, line, ...others].filter((s): s is StrokeItem => !!s)
      }
    }
  } else if (char === 'ة' || (id && id.includes('ة'))) {
    if (sourceStrokes.length > 0) {
      const body = sourceStrokes.filter((s) => !s.isCandidateDot)
      const dots = sourceStrokes.filter((s) => s.isCandidateDot)
      if (body.length > 0 && body[0]?.pointsWithWidth?.length >= 10) {
        const pts = body[0].pointsWithWidth
        const isAlreadyReversed = pts.length > 2 && pts[2].x < pts[0].x
        if (!isAlreadyReversed) {
          const loopPts = [pts[0], ...pts.slice(1).reverse(), pts[0]].map((p, i, arr) => ({
            ...p,
            t: Math.round((i / (arr.length - 1)) * 1000) / 1000
          }))
          const loopStroke: StrokeItem = {
            ...body[0],
            order: 0,
            originalOrder: 0,
            direction: 'right_to_left',
            startPoint: { x: loopPts[0].x, y: loopPts[0].y },
            endPoint: { x: loopPts[loopPts.length - 1].x, y: loopPts[loopPts.length - 1].y },
            points: loopPts.map((p) => [p.x, p.y] as [number, number]),
            pointsWithWidth: loopPts,
            medianPath: `M ${loopPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
          }
          sourceStrokes = [loopStroke, ...dots]
        }
      }
    }
  } else if (char === 'ع' || char === 'غ') {
    const body = sourceStrokes.filter((s) => !s.isCandidateDot)
    const dots = sourceStrokes.filter((s) => s.isCandidateDot)
    if (body.length >= 2) {
      const head = body[0]
      let belly = body[1]
      if (belly && belly.startPoint && belly.endPoint && belly.startPoint.y > belly.endPoint.y) {
        belly = reverseStroke(belly)
      }
      sourceStrokes = [head, belly, ...dots]
    }
  } else if (char === 'ك') {
    const body = sourceStrokes.filter((s) => !s.isCandidateDot)
    const dots = sourceStrokes.filter((s) => s.isCandidateDot)
    if (body.length >= 2) {
      const hamza = body.find((s) => s.originalOrder === 0) || body[0]
      const kaafBody = body.find((s) => s.originalOrder === 1) || body[1]
      sourceStrokes = [kaafBody, hamza, ...dots]
    }
  } else if ((char || '').includes('0627.fina.rlig.2')) {
    // The final alef in the special للا ligature is stored in HarfBuzz
    // extraction order (1, 2, 0). The verified drawing order is 0, 1, 2;
    // retaining extraction order reveals the connecting mark before the
    // final body stroke and makes the animation disagree with its shadow.
    const byOriginalOrder = new Map(sourceStrokes.map((stroke) => [stroke.originalOrder, stroke]))
    const ordered = [0, 1, 2]
      .map((order) => byOriginalOrder.get(order))
      .filter((stroke): stroke is StrokeItem => !!stroke)
    sourceStrokes = ordered.length === sourceStrokes.length ? ordered : sourceStrokes
  } else if (char === 'أ' || char === 'إ' || char === 'ؤ' || char === 'ئ') {
    if (sourceStrokes.length >= 3) {
      sourceStrokes = sourceStrokes.slice(0, 3)
    }
  } else if (char === 'ه') {
    const body = sourceStrokes.filter((s) => !s.isCandidateDot)
    if (body.length >= 3 && (body[0].pointsWithWidth || []).length === 27) {
      const s0 = body[0]
      const s1 = body[1]
      const s2 = body[2]

      const p1 = s0.pointsWithWidth.slice(0, 22).map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const step1: StrokeItem = {
        ...s0,
        order: 0,
        originalOrder: 0,
        direction: 'right_to_left',
        startPoint: { x: p1[0].x, y: p1[0].y },
        endPoint: { x: p1[p1.length - 1].x, y: p1[p1.length - 1].y },
        points: p1.map((p) => [p.x, p.y] as [number, number]),
        pointsWithWidth: p1,
        medianPath: `M ${p1.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      }

      let step2: StrokeItem = { ...s1, order: 1, originalOrder: 1 }
      if (step2.startPoint && step2.endPoint && step2.startPoint.y < step2.endPoint.y) {
        step2 = reverseStroke(step2)
      }

      const step3: StrokeItem = { ...s2, order: 2, originalOrder: 2 }

      const p4 = s0.pointsWithWidth.slice(21).map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const step4: StrokeItem = {
        ...s0,
        order: 3,
        originalOrder: 0,
        direction: 'right_to_left',
        startPoint: { x: p4[0].x, y: p4[0].y },
        endPoint: { x: p4[p4.length - 1].x, y: p4[p4.length - 1].y },
        points: p4.map((p) => [p.x, p.y] as [number, number]),
        pointsWithWidth: p4,
        medianPath: `M ${p4.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      }

      sourceStrokes = [step1, step2, step3, step4]
    } else if (body.length === 4) {
      sourceStrokes = body
    }
  }

  sourceStrokes = normalizeDotSweep(sourceStrokes)

  return sourceStrokes.map((s, idx) => ({
    ...s,
    order: idx
  }))
}

export function normalizeGlyphStrokes(
  strokes: StrokeItem[],
  context: NormalizationContext
): StrokeItem[] {
  let gStrokes = [...(strokes || [])]
  const char = context.char || ''

  const isSeenGlyph =
    char.includes('0633') ||
    char.includes('0634') ||
    char.includes('seen') ||
    char.includes('sheen') ||
    char === 'س' ||
    char === 'ش'
  const isHamzaMark = char.includes('0654') || char.includes('0655')
  const isHamzaIsolated = char.includes('0621') || char === 'ء'
  const isThreeDotGlyph = char.toLowerCase().includes('threedotsup')

  if (isHamzaMark && gStrokes.length >= 2) {
    const arc = gStrokes.find((s) => s.originalOrder === 1) || gStrokes[0]
    let line = gStrokes.find((s) => s.originalOrder === 0) || gStrokes[1]
    const others = gStrokes.filter((s) => s !== arc && s !== line)
    if (line && line.startPoint && line.endPoint && line.startPoint.x < line.endPoint.x) {
      line = reverseStroke(line)
    }
    gStrokes = [arc, line, ...others].filter((s): s is StrokeItem => !!s)
  } else if (isHamzaIsolated && gStrokes.length >= 2) {
    if (gStrokes[0]?.pointsWithWidth?.length === 19) {
      const s0 = gStrokes[0]
      const s1 = gStrokes[1]
      const headPts = s0.pointsWithWidth.slice(0, 15)
      const linePts = [...s0.pointsWithWidth.slice(15).reverse(), ...s1.pointsWithWidth.slice(1)]
      const headStroke: StrokeItem = {
        ...s0,
        order: 0,
        originalOrder: 0,
        startPoint: { x: headPts[0].x, y: headPts[0].y },
        endPoint: { x: headPts[headPts.length - 1].x, y: headPts[headPts.length - 1].y },
        direction: 'right_to_left',
        points: headPts.map((p) => [p.x, p.y] as [number, number]),
        pointsWithWidth: headPts,
        medianPath: `M ${headPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      }
      const lineStroke: StrokeItem = {
        ...s1,
        order: 1,
        originalOrder: 1,
        startPoint: { x: linePts[0].x, y: linePts[0].y },
        endPoint: { x: linePts[linePts.length - 1].x, y: linePts[linePts.length - 1].y },
        direction: 'right_to_left',
        points: linePts.map((p) => [p.x, p.y] as [number, number]),
        pointsWithWidth: linePts,
        medianPath: `M ${linePts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      }
      gStrokes = [headStroke, lineStroke]
    } else {
      const arc = gStrokes.find((s) => s.originalOrder === 0) || gStrokes[0]
      let line = gStrokes.find((s) => s.originalOrder === 1) || gStrokes[1]
      const others = gStrokes.filter((s) => s !== arc && s !== line)
      if (line && line.startPoint && line.endPoint && line.startPoint.x < line.endPoint.x) {
        line = reverseStroke(line)
      }
      gStrokes = [arc, line, ...others].filter((s): s is StrokeItem => !!s)
    }
  } else if (isThreeDotGlyph) {
    gStrokes = gStrokes.map((stroke) => {
      const point = stroke.pointsWithWidth?.[0] || stroke.startPoint || stroke.endPoint
      if (!point) return stroke
      const outlinePath = canonicalDotOutlineAt(point)
      return { ...stroke, outlinePath, outlinePaths: [outlinePath] }
    })
  } else if (isSeenGlyph) {
    const body = gStrokes.filter((s) => !s.isCandidateDot)
    const dots = gStrokes
      .filter((s) => s.isCandidateDot)
      .sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
    body.sort((a, b) => {
      const maxA = Math.max(...(a.points || []).map((p) => (Array.isArray(p) ? p[0] : 0)))
      const maxB = Math.max(...(b.points || []).map((p) => (Array.isArray(p) ? p[0] : 0)))
      return maxB - maxA
    })
    gStrokes = [...body, ...dots]
  }

  // The contextual lam-alef ligature is taught as three movements: the
  // right-to-left connection, the top-to-bottom body, and the diagonal tail.
  if (char.includes('0644.medi.rlig') && gStrokes.length === 1) {
    const stroke = gStrokes[0]
    const contours = splitOutlineContours(context.outlinePath || stroke.outlinePath)
    const verifiedPoints: PointWithWidth[] = [
      { x: 219.3, y: -40.1, width: 84 },
      { x: 129.2, y: -47, width: 84 },
      { x: 75.2, y: -81.9, width: 84 },
      { x: 61, y: -160.8, width: 84 },
      { x: 52.7, y: -244.7, width: 84 },
      { x: 51.9, y: -400.8, width: 84 },
      { x: 42, y: -675, width: 84 },
      { x: 53.6, y: -243.9, width: 84 },
      { x: -52.7, y: -81.9, width: 84 },
      { x: -185.6, y: -37, width: 84 },
      { x: -295.3, y: -40.4, width: 84 }
    ]
    const makeStroke = (
      points: PointWithWidth[],
      order: number,
      direction: string,
      outlinePath?: string
    ): StrokeItem => {
      const pointsWithWidth = points.map((point, index, all) => ({
        ...point,
        t: all.length > 1 ? index / (all.length - 1) : 0
      }))
      const coordinates = pointsWithWidth.map((point) => [point.x, point.y] as [number, number])
      return {
        ...stroke,
        order,
        originalOrder: order,
        outlinePath: outlinePath || stroke.outlinePath,
        outlinePaths: outlinePath ? [outlinePath] : stroke.outlinePaths,
        direction,
        startPoint: { x: pointsWithWidth[0].x, y: pointsWithWidth[0].y },
        endPoint: {
          x: pointsWithWidth[pointsWithWidth.length - 1].x,
          y: pointsWithWidth[pointsWithWidth.length - 1].y
        },
        points: coordinates,
        pointsWithWidth,
        medianPath: `M ${coordinates.map((point) => `${point[0]} ${point[1]}`).join(' L ')}`
      }
    }
    gStrokes = [
      makeStroke(verifiedPoints.slice(0, 5), 0, 'right_to_left', contours[0]),
      makeStroke(verifiedPoints.slice(4, 7), 1, 'top_to_bottom', contours[0]),
      makeStroke(verifiedPoints.slice(7), 2, 'right_to_left', contours[1])
    ]
  }

  const isLamAlifAlif = char === 'uni0627.fina.rlig'
  if (isLamAlifAlif && gStrokes.length > 0) {
    gStrokes = gStrokes.map((s) => {
      const pts = s.pointsWithWidth || []
      if (pts.length > 1 && pts.length < 10 && pts[0].y < pts[pts.length - 1].y) {
        const revPts = pts
          .slice()
          .reverse()
          .map((p, i, arr) => ({
            ...p,
            t: arr.length > 1 ? i / (arr.length - 1) : 0
          }))
        const pCoords = revPts.map((p) => [p.x, p.y] as [number, number])
        return {
          ...s,
          startPoint: { x: revPts[0].x, y: revPts[0].y },
          endPoint: { x: revPts[revPts.length - 1].x, y: revPts[revPts.length - 1].y },
          direction: revPts[0].x <= revPts[revPts.length - 1].x ? 'left_to_right' : 'right_to_left',
          points: pCoords,
          pointsWithWidth: revPts,
          medianPath: `M ${revPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
        }
      }
      return s
    })
  }

  const isMedialLam =
    (char.includes('0644.medi') || char.includes('lam.medi') || char.includes('lam_medi')) &&
    !char.includes('rlig')
  if (isMedialLam && gStrokes.length === 2 && (gStrokes[0]?.pointsWithWidth || []).length === 7) {
    const s0 =
      (gStrokes[0].startPoint?.y ?? 0) < (gStrokes[0].endPoint?.y ?? 0)
        ? reverseStroke(gStrokes[0])
        : gStrokes[0]
    const s1 = gStrokes[1]
    gStrokes = [
      { ...s0, order: 0, direction: 'bottom_to_top' },
      { ...s1, order: 1, direction: 'right_to_left' }
    ]
  }

  const isAinInitOrMedi =
    char.includes('0639.init') ||
    char.includes('063A.init') ||
    char.includes('0639.medi') ||
    char.includes('063A.medi')
  if (isAinInitOrMedi && gStrokes.length >= 3 && gStrokes[0]?.pointsWithWidth?.length === 10) {
    const s0 = gStrokes[0]
    const s1 = gStrokes[1]
    const s2 = gStrokes[2]
    const beak: StrokeItem = { ...s2, order: 0, originalOrder: 2, direction: 'right_to_left' }
    const eye: StrokeItem = { ...s1, order: 1, originalOrder: 1, direction: 'right_to_left' }
    const baseline: StrokeItem = { ...s0, order: 2, originalOrder: 0, direction: 'right_to_left' }
    gStrokes = [beak, eye, baseline]
  }

  const isHehInit = char.includes('0647.init')
  if (isHehInit && gStrokes.length >= 3 && gStrokes[0]?.pointsWithWidth?.length === 30) {
    const s0 = gStrokes[0]
    const s1 = gStrokes[1]
    const s2 = gStrokes[2]
    const splitIdx = 23
    const envPts = s0.pointsWithWidth.slice(0, splitIdx + 1)
    const tailPts = s0.pointsWithWidth.slice(splitIdx)
    const ascPts = s1.pointsWithWidth
      .slice()
      .reverse()
      .map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
    const eyePts = s2.pointsWithWidth

    const envStroke: StrokeItem = {
      ...s0,
      order: 0,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: envPts[0].x, y: envPts[0].y },
      endPoint: { x: envPts[envPts.length - 1].x, y: envPts[envPts.length - 1].y },
      points: envPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: envPts,
      medianPath: `M ${envPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const ascStroke: StrokeItem = {
      ...s1,
      order: 1,
      originalOrder: 1,
      direction: 'bottom_to_top',
      startPoint: { x: ascPts[0].x, y: ascPts[0].y },
      endPoint: { x: ascPts[ascPts.length - 1].x, y: ascPts[ascPts.length - 1].y },
      points: ascPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: ascPts,
      medianPath: `M ${ascPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const eyeStroke: StrokeItem = {
      ...s2,
      order: 2,
      originalOrder: 2,
      direction: 'right_to_left',
      startPoint: { x: eyePts[0].x, y: eyePts[0].y },
      endPoint: { x: eyePts[eyePts.length - 1].x, y: eyePts[eyePts.length - 1].y },
      points: eyePts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: eyePts,
      medianPath: `M ${eyePts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const tailStroke: StrokeItem = {
      ...s0,
      order: 3,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: tailPts[0].x, y: tailPts[0].y },
      endPoint: { x: tailPts[tailPts.length - 1].x, y: tailPts[tailPts.length - 1].y },
      points: tailPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: tailPts,
      medianPath: `M ${tailPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    gStrokes = [envStroke, ascStroke, eyeStroke, tailStroke]
  }

  const isHahMedi =
    char.includes('062D.medi') || char.includes('062C.medi') || char.includes('062E.medi')
  if (
    isHahMedi &&
    gStrokes.length >= 2 &&
    gStrokes.some((s) => (s.pointsWithWidth || []).length === 1)
  ) {
    const cleanStrokes = gStrokes.filter((s) => (s.pointsWithWidth || []).length > 1)
    if (cleanStrokes.length >= 2) {
      gStrokes = [
        { ...cleanStrokes[0], order: 0, direction: 'right_to_left' },
        { ...cleanStrokes[1], order: 1, direction: 'right_to_left' }
      ]
    }
  }

  const isSukun = char.includes('0652')
  if (isSukun && gStrokes.length > 1) {
    gStrokes = gStrokes.filter((s) => (s.pointsWithWidth || []).length > 1)
  }

  const isFinalMeem = char.includes('0645.fina')
  if (isFinalMeem && gStrokes.length === 2 && gStrokes[0]?.pointsWithWidth?.length === 21) {
    const s0 = gStrokes[0]
    const s1 = gStrokes[1]
    const connectPts = s0.pointsWithWidth.slice(0, 5).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
    const topPts = s0.pointsWithWidth.slice(4, 15).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
    const bottomPts = s1.pointsWithWidth
      .slice()
      .reverse()
      .map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
    const tailPts = s0.pointsWithWidth.slice(14).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))

    const connectStroke: StrokeItem = {
      ...s0,
      order: 0,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: connectPts[0].x, y: connectPts[0].y },
      endPoint: {
        x: connectPts[connectPts.length - 1].x,
        y: connectPts[connectPts.length - 1].y
      },
      points: connectPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: connectPts,
      medianPath: `M ${connectPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const topStroke: StrokeItem = {
      ...s0,
      order: 1,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: topPts[0].x, y: topPts[0].y },
      endPoint: { x: topPts[topPts.length - 1].x, y: topPts[topPts.length - 1].y },
      points: topPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: topPts,
      medianPath: `M ${topPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const bottomStroke: StrokeItem = {
      ...s1,
      order: 2,
      originalOrder: 1,
      direction: 'left_to_right',
      startPoint: { x: bottomPts[0].x, y: bottomPts[0].y },
      endPoint: {
        x: bottomPts[bottomPts.length - 1].x,
        y: bottomPts[bottomPts.length - 1].y
      },
      points: bottomPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: bottomPts,
      medianPath: `M ${bottomPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const tailStroke: StrokeItem = {
      ...s0,
      order: 3,
      originalOrder: 0,
      direction: 'top_to_bottom',
      startPoint: { x: tailPts[0].x, y: tailPts[0].y },
      endPoint: { x: tailPts[tailPts.length - 1].x, y: tailPts[tailPts.length - 1].y },
      points: tailPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: tailPts,
      medianPath: `M ${tailPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }

    gStrokes = [connectStroke, topStroke, bottomStroke, tailStroke]
  } else if (isFinalMeem && gStrokes.length === 4) {
    // Ensure descending tail (top to bottom) is the last step
    const tailIdx = gStrokes.findIndex((s) => (s.endPoint?.y ?? 0) > 200)
    if (tailIdx !== -1 && tailIdx !== 3) {
      const tail = gStrokes.splice(tailIdx, 1)[0]
      tail.direction = 'top_to_bottom'
      gStrokes.push(tail)
    } else if (tailIdx === 3) {
      gStrokes[3] = { ...gStrokes[3], direction: 'top_to_bottom' }
    }
  }

  const isMedialMeem = char.includes('0645.medi')
  if (isMedialMeem && gStrokes.length >= 2 && gStrokes[0]?.pointsWithWidth?.length === 19) {
    const s0 = gStrokes[0]
    const s1 = gStrokes[1]
    const connectPts = s0.pointsWithWidth.slice(0, 5).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
    const topPts = s0.pointsWithWidth.slice(4, 14).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
    const bottomPts = s1.pointsWithWidth
      .slice()
      .reverse()
      .map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
    const exitPts = s0.pointsWithWidth.slice(13).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))

    const connectStroke: StrokeItem = {
      ...s0,
      order: 0,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: connectPts[0].x, y: connectPts[0].y },
      endPoint: {
        x: connectPts[connectPts.length - 1].x,
        y: connectPts[connectPts.length - 1].y
      },
      points: connectPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: connectPts,
      medianPath: `M ${connectPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const topStroke: StrokeItem = {
      ...s0,
      order: 1,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: topPts[0].x, y: topPts[0].y },
      endPoint: { x: topPts[topPts.length - 1].x, y: topPts[topPts.length - 1].y },
      points: topPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: topPts,
      medianPath: `M ${topPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const bottomStroke: StrokeItem = {
      ...s1,
      order: 2,
      originalOrder: 1,
      direction: 'left_to_right',
      startPoint: { x: bottomPts[0].x, y: bottomPts[0].y },
      endPoint: {
        x: bottomPts[bottomPts.length - 1].x,
        y: bottomPts[bottomPts.length - 1].y
      },
      points: bottomPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: bottomPts,
      medianPath: `M ${bottomPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }
    const exitStroke: StrokeItem = {
      ...s0,
      order: 3,
      originalOrder: 0,
      direction: 'right_to_left',
      startPoint: { x: exitPts[0].x, y: exitPts[0].y },
      endPoint: { x: exitPts[exitPts.length - 1].x, y: exitPts[exitPts.length - 1].y },
      points: exitPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: exitPts,
      medianPath: `M ${exitPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }

    gStrokes = [connectStroke, topStroke, bottomStroke, exitStroke]
  }

  const isSingularTaaMarbuta =
    char.includes('06D5') || (char.includes('0629') && !char.includes('fina')) || char === 'ة'
  if (isSingularTaaMarbuta && gStrokes.length > 0) {
    const s0 = gStrokes[0]
    const pts = s0.pointsWithWidth || []
    if (pts.length >= 10) {
      const isAlreadyReversed = pts.length > 2 && pts[2].x < pts[0].x
      if (!isAlreadyReversed) {
        const loopPts = [pts[0], ...pts.slice(1).reverse(), pts[0]].map((p, i, arr) => ({
          ...p,
          t: Math.round((i / (arr.length - 1)) * 1000) / 1000
        }))
        const loopStroke: StrokeItem = {
          ...s0,
          order: 0,
          originalOrder: 0,
          direction: 'right_to_left',
          startPoint: { x: loopPts[0].x, y: loopPts[0].y },
          endPoint: { x: loopPts[loopPts.length - 1].x, y: loopPts[loopPts.length - 1].y },
          points: loopPts.map((p) => [p.x, p.y] as [number, number]),
          pointsWithWidth: loopPts,
          medianPath: `M ${loopPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
        }
        gStrokes = [loopStroke, ...gStrokes.slice(1)]
      }
    }
  }

  const isFinalTaaMarbuta = char.includes('0647.fina') || char.includes('0629.fina')
  if (isFinalTaaMarbuta && gStrokes.length >= 2 && gStrokes[0]?.pointsWithWidth?.length === 27) {
    const s0 = gStrokes[0]
    const s1 = gStrokes[1]
    const basePts = s0.pointsWithWidth.slice(19).reverse()
    const stemMiddlePts = s1.pointsWithWidth.slice().reverse()
    const stemTopPts = s0.pointsWithWidth.slice(0, 3).reverse()
    const linePts = [...basePts, ...stemMiddlePts.slice(1), ...stemTopPts].map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
    const lineStroke: StrokeItem = {
      ...s0,
      order: 0,
      originalOrder: 0,
      direction: 'bottom_to_top',
      startPoint: { x: linePts[0].x, y: linePts[0].y },
      endPoint: { x: linePts[linePts.length - 1].x, y: linePts[linePts.length - 1].y },
      points: linePts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: linePts,
      medianPath: `M ${linePts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }

    const arcPts = s0.pointsWithWidth.slice(3, 20).map((p, i, arr) => ({
      ...p,
      t: Math.round((i / (arr.length - 1)) * 1000) / 1000
    }))
    const arcStroke: StrokeItem = {
      ...s0,
      order: 1,
      originalOrder: 1,
      direction: 'right_to_left',
      startPoint: { x: arcPts[0].x, y: arcPts[0].y },
      endPoint: { x: arcPts[arcPts.length - 1].x, y: arcPts[arcPts.length - 1].y },
      points: arcPts.map((p) => [p.x, p.y] as [number, number]),
      pointsWithWidth: arcPts,
      medianPath: `M ${arcPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    }

    gStrokes = [lineStroke, arcStroke]
  }

  gStrokes = normalizeDotSweep(gStrokes)

  return gStrokes.map((s, idx) => ({
    ...s,
    order: idx
  }))
}

export function normalizeWordStrokes(
  strokes: StrokeItem[],
  context: NormalizationContext
): StrokeItem[] {
  let strokesList = [...(strokes || [])]
  if (context.id === 'special_لآ' || context.word === 'لآ') {
    const byGlyphId = new Map(strokesList.map((stroke) => [stroke.sourceGlyphId, stroke]))
    const ordered = [73, 10, 300]
      .map((glyphId) => byGlyphId.get(glyphId))
      .filter((stroke): stroke is StrokeItem => !!stroke)
    const remaining = strokesList.filter((stroke) => ![73, 10, 300].includes(stroke.sourceGlyphId ?? -1))
    if (ordered.length > 0) {
      strokesList = [...ordered, ...remaining]
    }
  }

  if ((context.id === 'special_للا' || context.word === 'للا') && strokesList.length >= 4) {
    const combinedIdx = strokesList.findIndex((s) => (s.pointsWithWidth || []).length === 15)
    if (combinedIdx !== -1) {
      const combined = strokesList[combinedIdx]
      const pts = combined.pointsWithWidth
      const connectPts = pts.slice(0, 6).map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const arcPts = pts.slice(5).map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const connectStroke: StrokeItem = {
        ...combined,
        startPoint: { x: connectPts[0].x, y: connectPts[0].y },
        endPoint: {
          x: connectPts[connectPts.length - 1].x,
          y: connectPts[connectPts.length - 1].y
        },
        direction: 'right_to_left',
        points: connectPts.map((p) => [p.x, p.y] as [number, number]),
        pointsWithWidth: connectPts,
        medianPath: `M ${connectPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      }
      const arcStroke: StrokeItem = {
        ...combined,
        startPoint: { x: arcPts[0].x, y: arcPts[0].y },
        endPoint: { x: arcPts[arcPts.length - 1].x, y: arcPts[arcPts.length - 1].y },
        direction: 'right_to_left',
        points: arcPts.map((p) => [p.x, p.y] as [number, number]),
        pointsWithWidth: arcPts,
        medianPath: `M ${arcPts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      }
      const otherStrokes = strokesList.filter((_, idx) => idx !== combinedIdx)
      const initLam = otherStrokes[0]
      let stem = otherStrokes[1]
      let alif = otherStrokes[2]

      if (stem && (stem.startPoint?.y ?? 0) < (stem.endPoint?.y ?? 0)) {
        stem = reverseStroke(stem)
      }
      if (alif && (alif.startPoint?.y ?? 0) > (alif.endPoint?.y ?? 0)) {
        alif = reverseStroke(alif)
      }

      strokesList = [initLam, connectStroke, stem, arcStroke, alif].filter(
        (s): s is StrokeItem => !!s
      )
    }
  }

  return strokesList.map((s, idx) => ({
    ...s,
    order: idx
  }))
}
