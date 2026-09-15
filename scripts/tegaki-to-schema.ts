import fs from 'node:fs'
import path from 'node:path'
import { svgPathProperties } from 'svg-path-properties'
import type {
  ArabicStrokeDataset,
  CleanupLogItem,
  ConversionReport,
  GlyphInstance,
  LetterEntry,
  Point2D,
  PointWithWidth,
  RawHarfbuzzGlyph,
  RawPoint,
  RawStroke,
  RawTegakiDataset,
  SourceMetadata,
  StrokeItem,
  WordCleanupItem,
  ValidationStatus,
  VerifiedInventory
} from './types'
import { canonicalDotOutlineAt } from '../src/renderer/src/engine/data/canonical-stroke-paths'

const MICRO_SPUR_THRESHOLD = 25 // in font units

function pointsToSvgPath(points: (Point2D | PointWithWidth | RawPoint)[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`
  }
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  return d
}

const TASHKEEL_UNICODE_CODES = [
  '064B',
  '064C',
  '064D',
  '064E',
  '064F',
  '0650',
  '0651',
  '0652',
  '0653',
  '0654',
  '0655',
  '0670'
]
function isTashkeelGlyph(charName: string): boolean {
  return TASHKEEL_UNICODE_CODES.some((c) => (charName || '').includes(c))
}
function isDotGlyph(charName: string): boolean {
  const name = charName || ''
  return name.includes('dot') || name.includes('two') || name.includes('three')
}

function rawStrokeToStrokeItem(
  s: RawStroke,
  order: number,
  originalOrder: number,
  preferredDir?: string
): StrokeItem {
  const pts = s.points.map((p, i, arr) => ({
    x: p.x,
    y: p.y,
    width: p.width,
    t: arr.length > 1 ? Math.round((i / (arr.length - 1)) * 1000) / 1000 : 0
  }))
  const medianPath = pointsToSvgPath(pts)
  const startPoint = pts[0] ? { x: pts[0].x, y: pts[0].y } : null
  const endPoint = pts[pts.length - 1]
    ? { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }
    : null
  let direction = preferredDir || 'right_to_left'
  if (!preferredDir && startPoint && endPoint) {
    const dy = endPoint.y - startPoint.y
    const dx = endPoint.x - startPoint.x
    if (Math.abs(dy) > Math.abs(dx)) {
      direction = dy < 0 ? 'bottom_to_top' : 'top_to_bottom'
    } else {
      direction = dx >= 0 ? 'left_to_right' : 'right_to_left'
    }
  }
  const length = Math.round(new svgPathProperties(medianPath).getTotalLength())
  return {
    order,
    originalOrder,
    priority: s.priority ?? 0,
    isCandidateDot: false,
    direction,
    length,
    durationMs: Math.max(150, Math.round(s.animationDuration * 1000)),
    delayMs: 0,
    startPoint,
    endPoint,
    medianPath,
    points: pts.map((p) => [p.x, p.y]),
    pointsWithWidth: pts
  }
}

function buildHamzaStrokes(
  arcRawPts: RawPoint[],
  baseRawPts: RawPoint[],
  startOrder: number
): [StrokeItem, StrokeItem] {
  const arcPts = arcRawPts.map((p, i, arr) => ({
    x: p.x,
    y: p.y,
    width: p.width,
    t: arr.length > 1 ? Math.round((i / (arr.length - 1)) * 1000) / 1000 : 0
  }))
  const arcPath = pointsToSvgPath(arcPts)
  const arcLen = Math.round(new svgPathProperties(arcPath).getTotalLength())
  const arcStroke: StrokeItem = {
    order: startOrder,
    originalOrder: 0,
    priority: 0,
    isCandidateDot: false,
    direction: 'right_to_left',
    length: arcLen,
    durationMs: Math.max(150, Math.round(arcLen / 2 / 10) * 10),
    delayMs: 0,
    startPoint: { x: arcPts[0].x, y: arcPts[0].y },
    endPoint: { x: arcPts[arcPts.length - 1].x, y: arcPts[arcPts.length - 1].y },
    medianPath: arcPath,
    points: arcPts.map((p) => [p.x, p.y]),
    pointsWithWidth: arcPts
  }

  const basePts = baseRawPts.map((p, i, arr) => ({
    x: p.x,
    y: p.y,
    width: p.width,
    t: arr.length > 1 ? Math.round((i / (arr.length - 1)) * 1000) / 1000 : 0
  }))
  const basePath = pointsToSvgPath(basePts)
  const baseLen = Math.round(new svgPathProperties(basePath).getTotalLength())
  const baseStroke: StrokeItem = {
    order: startOrder + 1,
    originalOrder: 1,
    priority: 0,
    isCandidateDot: false,
    direction: 'right_to_left',
    length: baseLen,
    durationMs: Math.max(120, Math.round(baseLen / 2 / 10) * 10),
    delayMs: 0,
    startPoint: { x: basePts[0].x, y: basePts[0].y },
    endPoint: { x: basePts[basePts.length - 1].x, y: basePts[basePts.length - 1].y },
    medianPath: basePath,
    points: basePts.map((p) => [p.x, p.y]),
    pointsWithWidth: basePts
  }

  return [arcStroke, baseStroke]
}

function buildSingleStrokeItem(
  rawPts: (Point2D | PointWithWidth | RawPoint)[],
  order: number,
  originalOrder: number,
  preferredDir: string,
  durationMs?: number
): StrokeItem {
  const pts: PointWithWidth[] = rawPts.map((p, i, arr) => ({
    x: p.x,
    y: p.y,
    width: 'width' in p && typeof p.width === 'number' ? p.width : 65,
    t: arr.length > 1 ? Math.round((i / (arr.length - 1)) * 1000) / 1000 : 0
  }))
  const medianPath = pointsToSvgPath(pts)
  const length = Math.round(new svgPathProperties(medianPath).getTotalLength())
  return {
    order,
    originalOrder,
    priority: 0,
    isCandidateDot: false,
    direction: preferredDir,
    length,
    durationMs: durationMs || Math.max(150, Math.round(length / 2 / 10) * 10),
    delayMs: 0,
    startPoint: pts[0] ? { x: pts[0].x, y: pts[0].y } : null,
    endPoint: pts[pts.length - 1] ? { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y } : null,
    medianPath,
    points: pts.map((p) => [p.x, p.y]),
    pointsWithWidth: pts
  }
}

function finalizeHamzaLetterStrokes(strokes: StrokeItem[]): StrokeItem[] {
  let curDelay = 0
  strokes.forEach((s, idx) => {
    s.order = idx
    s.delayMs = curDelay
    curDelay += (s.durationMs ?? 400) + 70
  })
  return strokes
}

function convertStrokes(
  rawStrokes: RawStroke[],
  cleanupLog: CleanupLogItem[],
  char?: string
): StrokeItem[] {
  // Special calligraphic handling for isolated Hamza (uni0621 / ء in special_ء and extended_قراءة):
  // 1. Upper arc (head): drawn from right to left (pts 0..14)
  // 2. Base line: unified into ONE single step from right to left (pts 15..18 reversed + s1 pts 1..3)
  if (char && (char.includes('0621') || char === 'ء') && rawStrokes.length >= 2) {
    const s0 = rawStrokes[0]
    const s1 = rawStrokes[1]
    if (s0.points.length === 19) {
      const headPts = s0.points.slice(0, 15).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const headPath = pointsToSvgPath(headPts)
      const headStroke = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(headPath).getTotalLength()),
        durationMs: 350,
        delayMs: 0,
        startPoint: { x: headPts[0].x, y: headPts[0].y },
        endPoint: { x: headPts[headPts.length - 1].x, y: headPts[headPts.length - 1].y },
        medianPath: headPath,
        points: headPts.map((p) => [p.x, p.y]),
        pointsWithWidth: headPts
      }

      const linePts = [...s0.points.slice(15).reverse(), ...s1.points.slice(1)].map(
        (p, i, arr) => ({
          x: p.x,
          y: p.y,
          width: p.width,
          t: Math.round((i / (arr.length - 1)) * 1000) / 1000
        })
      )
      const linePath = pointsToSvgPath(linePts)
      const lineStroke = {
        order: 1,
        originalOrder: 1,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(linePath).getTotalLength()),
        durationMs: 250,
        delayMs: 0,
        startPoint: { x: linePts[0].x, y: linePts[0].y },
        endPoint: { x: linePts[linePts.length - 1].x, y: linePts[linePts.length - 1].y },
        medianPath: linePath,
        points: linePts.map((p) => [p.x, p.y]),
        pointsWithWidth: linePts
      }

      return [headStroke, lineStroke]
    }
  }

  // Calligraphic handling for letters with Hamza (أ, إ, ؤ, ئ):
  // User instructions: "in group e you have many letters with the hamza so i want specify each of them just use the hamza engine we made for them with the same steps and directions"
  // For each:
  // Step 1: Base letter body (Alif shaft for أ and إ, Waw body for ؤ, Ya body for ئ)
  // Step 2: Hamza arc (head) drawn from right to left
  // Step 3: Hamza base line drawn from right to left
  if (char === 'أ' && rawStrokes.length >= 2) {
    const shaft = rawStrokeToStrokeItem(rawStrokes[0], 0, 0, 'top_to_bottom')
    const hamzaRaw = rawStrokes[1]
    const arcPts = hamzaRaw.points.slice(0, 7)
    const basePts = hamzaRaw.points.slice(7).reverse()
    const [hamzaArc, hamzaBase] = buildHamzaStrokes(arcPts, basePts, 1)
    return finalizeHamzaLetterStrokes([shaft, hamzaArc, hamzaBase])
  }

  if (char === 'إ' && rawStrokes.length >= 2) {
    const shaft = rawStrokeToStrokeItem(rawStrokes[0], 0, 0, 'top_to_bottom')
    const hamzaRaw = rawStrokes[1]
    const arcPts = hamzaRaw.points.slice(5).reverse()
    const basePts = hamzaRaw.points.slice(0, 5)
    const [hamzaArc, hamzaBase] = buildHamzaStrokes(arcPts, basePts, 1)
    return finalizeHamzaLetterStrokes([shaft, hamzaArc, hamzaBase])
  }

  if (char === 'ؤ' && rawStrokes.length >= 2) {
    const wawBody = rawStrokeToStrokeItem(rawStrokes[1], 0, 1, 'right_to_left')
    const hamzaRaw = rawStrokes[0]
    const arcPts = hamzaRaw.points.slice(0, 8)
    const basePts = hamzaRaw.points.slice(9).reverse()
    const [hamzaArc, hamzaBase] = buildHamzaStrokes(arcPts, basePts, 1)
    return finalizeHamzaLetterStrokes([wawBody, hamzaArc, hamzaBase])
  }

  if (char === 'ئ' && rawStrokes.length >= 2) {
    const yaBody = rawStrokeToStrokeItem(rawStrokes[0], 0, 0, 'right_to_left')
    const hamzaRaw = rawStrokes[1]
    const arcPts = hamzaRaw.points.slice(0, 8)
    const basePts = hamzaRaw.points.slice(8).reverse()
    const [hamzaArc, hamzaBase] = buildHamzaStrokes(arcPts, basePts, 1)
    return finalizeHamzaLetterStrokes([yaBody, hamzaArc, hamzaBase])
  }

  // Calligraphic handling for initial & medial Ain / Ghain (uni0639.init, uni063A.init, uni0639.medi, uni063A.medi in علم, على):
  // User instructions from Group D: eyebrow beak first, curved eye second, forward baseline connection third. Micro-spur discarded.
  if (
    char &&
    (char.includes('0639.init') ||
      char.includes('063A.init') ||
      char.includes('0639.medi') ||
      char.includes('063A.medi')) &&
    rawStrokes.length >= 3
  ) {
    if (rawStrokes.length > 3) {
      for (let i = 3; i < rawStrokes.length; i++) {
        if (rawStrokes[i].length < MICRO_SPUR_THRESHOLD) {
          cleanupLog.push({
            reason: 'micro-spur',
            originalOrder: i,
            length: rawStrokes[i].length
          })
        }
      }
    }
    const s0 = rawStrokes[0] // baseline forward
    const s1 = rawStrokes[1] // eye curve
    const s2 = rawStrokes[2] // top eyebrow beak
    const beak = rawStrokeToStrokeItem(s2, 0, 2, 'right_to_left')
    const eye = rawStrokeToStrokeItem(s1, 1, 1, 'right_to_left')
    const baseline = rawStrokeToStrokeItem(s0, 2, 0, 'right_to_left')
    return finalizeHamzaLetterStrokes([beak, eye, baseline])
  }

  // Special calligraphic handling for initial Heh (uni0647.init in words like هوي):
  // User instructions from Group D (ه):
  // Step 1: Outer envelope down to junction (s0 pts 0..23)
  // Step 2: Inner ascending curve (s1 reversed, bottom_to_top, starting at junction)
  // Step 3: Inner eye curve (s2)
  // Step 4: Final forward exit tail (s0 pts 23..29 from junction connecting to next letter)
  if (char && char.includes('0647.init') && rawStrokes.length >= 3) {
    const s0 = rawStrokes[0]
    const s1 = rawStrokes[1]
    const s2 = rawStrokes[2]
    if (s0.points.length >= 25 && s1.points.length >= 8 && s2.points.length >= 6) {
      const splitIdx = 23
      const envRawPts = s0.points.slice(0, splitIdx + 1)
      const tailRawPts = s0.points.slice(splitIdx)
      const ascRawPts = s1.points.slice().reverse()
      const eyeRawPts = s2.points

      const envStroke = buildSingleStrokeItem(envRawPts, 0, 0, 'right_to_left', 300)
      const ascStroke = buildSingleStrokeItem(ascRawPts, 1, 1, 'bottom_to_top', 180)
      const eyeStroke = buildSingleStrokeItem(eyeRawPts, 2, 2, 'right_to_left', 150)
      const tailStroke = buildSingleStrokeItem(tailRawPts, 3, 0, 'right_to_left', 150)

      return finalizeHamzaLetterStrokes([envStroke, ascStroke, eyeStroke, tailStroke])
    }
  }

  // Special calligraphic handling for medial Hah / Jeem / Khaa (uni062D.medi in words like مُحَمَّد):
  // Step 1: Ascending entry from baseline up to beak
  // Step 2: Beak curving back down to baseline forward
  // Phantom 1-point micro-spur discarded.
  if (
    char &&
    (char.includes('062D.medi') || char.includes('062C.medi') || char.includes('062E.medi')) &&
    rawStrokes.length >= 2
  ) {
    if (rawStrokes.length > 2) {
      for (let i = 2; i < rawStrokes.length; i++) {
        if (rawStrokes[i].length < MICRO_SPUR_THRESHOLD) {
          cleanupLog.push({
            reason: 'micro-spur',
            originalOrder: i,
            length: rawStrokes[i].length
          })
        }
      }
    }
    const s0 = rawStrokes[0] // entry ascending to beak
    const s1 = rawStrokes[1] // beak curving back down to baseline forward
    const step1 = rawStrokeToStrokeItem(s0, 0, 0, 'right_to_left')
    const step2 = rawStrokeToStrokeItem(s1, 1, 1, 'right_to_left')
    return finalizeHamzaLetterStrokes([step1, step2])
  }

  // Special calligraphic handling for Sukun (uni0652 in words like بِسْمِ):
  // Sukun is a circular stroke (stroke 0). Discard 0-length phantom artifact (stroke 1).
  if (char && char.includes('0652') && rawStrokes.length >= 1) {
    if (rawStrokes.length > 1) {
      for (let i = 1; i < rawStrokes.length; i++) {
        if (rawStrokes[i].length < MICRO_SPUR_THRESHOLD) {
          cleanupLog.push({
            reason: 'micro-spur',
            originalOrder: i,
            length: rawStrokes[i].length
          })
        }
      }
    }
    const circle = rawStrokeToStrokeItem(rawStrokes[0], 0, 0, 'right_to_left')
    return finalizeHamzaLetterStrokes([circle])
  }

  // Special calligraphic handling for medial Lam (uni0644.medi in words like سلم, علم, على):
  // User instructions: reverse the direction of the first step of the letter ل in all words and in the main json as this will be the default for the median
  // 1. Step 1 (s0 reversed): starts at right baseline entry (294.91, -40.12), continues along baseline to junction (160.45, -107.34), and ascends up the vertical shaft to top apex (140.68, -674.81)
  // 2. Step 2 (s1): baseline connection from junction (160.45, -107.34) to left forward (27.98, -20.34) connecting to next letter
  if (
    char &&
    (char.includes('0644.medi') || char.includes('lam.medi') || char.includes('lam_medi')) &&
    !char.includes('rlig') &&
    rawStrokes.length >= 2
  ) {
    const s0 = rawStrokes[0] // original raw step 1 (top down to right)
    const s1 = rawStrokes[1] // original raw step 2 (junction to left)

    // Step 1: Reversed direction - ascending from right baseline to top apex
    const step1 = buildSingleStrokeItem(s0.points.slice().reverse(), 0, 0, 'bottom_to_top')
    const step2 = rawStrokeToStrokeItem(s1, 1, 1, 'right_to_left')

    return finalizeHamzaLetterStrokes([step1, step2])
  }

  // Special calligraphic handling for final Meem (uni0645.fina in extended_بِسْمِ):
  // User instructions: "the م in the بسم reverse the direction of step 4 then make step 4 before step 3"
  // 1 (connect): baseline entry (s0 pts 0..4)
  // 2 (top arch): top loop of Meem head (s0 pts 4..14)
  // 3 (bottom arc): reversed direction (s1 reversed, from left junction at pt 9 back to right at pt 0, closing the head before the tail)
  // 4 (tail): descending tail of Meem (s0 pts 14..20, finishing the letter)
  if (char && char.includes('0645.fina') && rawStrokes.length >= 2) {
    const s0 = rawStrokes[0]
    const s1 = rawStrokes[1]
    if (s0.points.length === 21 && s1.points.length === 10) {
      // 1. Connect stroke: s0 pts 0..4
      const connectPts = s0.points.slice(0, 5).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const connectPath = pointsToSvgPath(connectPts)
      const connectStroke = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(connectPath).getTotalLength()),
        durationMs: 150,
        delayMs: 0,
        startPoint: { x: connectPts[0].x, y: connectPts[0].y },
        endPoint: {
          x: connectPts[connectPts.length - 1].x,
          y: connectPts[connectPts.length - 1].y
        },
        medianPath: connectPath,
        points: connectPts.map((p) => [p.x, p.y]),
        pointsWithWidth: connectPts
      }

      // 2. Top loop/arch: s0 pts 4..14
      const topPts = s0.points.slice(4, 15).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const topPath = pointsToSvgPath(topPts)
      const topStroke = {
        order: 1,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(topPath).getTotalLength()),
        durationMs: 250,
        delayMs: 0,
        startPoint: { x: topPts[0].x, y: topPts[0].y },
        endPoint: { x: topPts[topPts.length - 1].x, y: topPts[topPts.length - 1].y },
        medianPath: topPath,
        points: topPts.map((p) => [p.x, p.y]),
        pointsWithWidth: topPts
      }

      // 3. Bottom curve (step 4 reversed, placed before step 3): s1 reversed from left to right
      const bottomPts = s1.points
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          x: p.x,
          y: p.y,
          width: p.width,
          t: Math.round((i / (arr.length - 1)) * 1000) / 1000
        }))
      const bottomPath = pointsToSvgPath(bottomPts)
      const bottomStroke = {
        order: 2,
        originalOrder: 1,
        priority: 0,
        isCandidateDot: false,
        direction: 'left_to_right',
        length: Math.round(new svgPathProperties(bottomPath).getTotalLength()),
        durationMs: 200,
        delayMs: 0,
        startPoint: { x: bottomPts[0].x, y: bottomPts[0].y },
        endPoint: { x: bottomPts[bottomPts.length - 1].x, y: bottomPts[bottomPts.length - 1].y },
        medianPath: bottomPath,
        points: bottomPts.map((p) => [p.x, p.y]),
        pointsWithWidth: bottomPts
      }

      // 4. Descending tail (step 3 now step 4): s0 pts 14..20
      const tailPts = s0.points.slice(14).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const tailPath = pointsToSvgPath(tailPts)
      const tailStroke = {
        order: 3,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(tailPath).getTotalLength()),
        durationMs: 250,
        delayMs: 0,
        startPoint: { x: tailPts[0].x, y: tailPts[0].y },
        endPoint: { x: tailPts[tailPts.length - 1].x, y: tailPts[tailPts.length - 1].y },
        medianPath: tailPath,
        points: tailPts.map((p) => [p.x, p.y]),
        pointsWithWidth: tailPts
      }

      return [connectStroke, topStroke, bottomStroke, tailStroke]
    }
  }

  // Special calligraphic handling for medial Meem (uni0645.medi in words like مُحَمَّد):
  // User instructions: "apply the same change we did for the final م to the median م"
  // 1 (connect): baseline entry from previous letter into Meem head (s0 pts 0..4)
  // 2 (top arch): top loop of Meem head (s0 pts 4..13)
  // 3 (bottom arc): reversed direction (s1 reversed, from left junction at pt 9 back to right at pt 0, closing the head before the exit!)
  // 4 (exit): baseline connector to next letter (s0 pts 13..18)
  if (char && char.includes('0645.medi') && rawStrokes.length >= 2) {
    const s0 = rawStrokes[0]
    const s1 = rawStrokes[1]
    if (s0.points.length === 19 && s1.points.length === 10) {
      // 1. Connect stroke: s0 pts 0..4
      const connectPts = s0.points.slice(0, 5).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const connectPath = pointsToSvgPath(connectPts)
      const connectStroke = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(connectPath).getTotalLength()),
        durationMs: 150,
        delayMs: 0,
        startPoint: { x: connectPts[0].x, y: connectPts[0].y },
        endPoint: {
          x: connectPts[connectPts.length - 1].x,
          y: connectPts[connectPts.length - 1].y
        },
        medianPath: connectPath,
        points: connectPts.map((p) => [p.x, p.y]),
        pointsWithWidth: connectPts
      }

      // 2. Top loop/arch: s0 pts 4..13
      const topPts = s0.points.slice(4, 14).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const topPath = pointsToSvgPath(topPts)
      const topStroke = {
        order: 1,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(topPath).getTotalLength()),
        durationMs: 250,
        delayMs: 0,
        startPoint: { x: topPts[0].x, y: topPts[0].y },
        endPoint: { x: topPts[topPts.length - 1].x, y: topPts[topPts.length - 1].y },
        medianPath: topPath,
        points: topPts.map((p) => [p.x, p.y]),
        pointsWithWidth: topPts
      }

      // 3. Bottom curve (step 4 reversed, placed before exit connector): s1 reversed from left to right
      const bottomPts = s1.points
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          x: p.x,
          y: p.y,
          width: p.width,
          t: Math.round((i / (arr.length - 1)) * 1000) / 1000
        }))
      const bottomPath = pointsToSvgPath(bottomPts)
      const bottomStroke = {
        order: 2,
        originalOrder: 1,
        priority: 0,
        isCandidateDot: false,
        direction: 'left_to_right',
        length: Math.round(new svgPathProperties(bottomPath).getTotalLength()),
        durationMs: 200,
        delayMs: 0,
        startPoint: { x: bottomPts[0].x, y: bottomPts[0].y },
        endPoint: { x: bottomPts[bottomPts.length - 1].x, y: bottomPts[bottomPts.length - 1].y },
        medianPath: bottomPath,
        points: bottomPts.map((p) => [p.x, p.y]),
        pointsWithWidth: bottomPts
      }

      // 4. Exit connector to next letter (step 4): s0 pts 13..18
      const exitPts = s0.points.slice(13).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const exitPath = pointsToSvgPath(exitPts)
      const exitStroke = {
        order: 3,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(exitPath).getTotalLength()),
        durationMs: 150,
        delayMs: 0,
        startPoint: { x: exitPts[0].x, y: exitPts[0].y },
        endPoint: { x: exitPts[exitPts.length - 1].x, y: exitPts[exitPts.length - 1].y },
        medianPath: exitPath,
        points: exitPts.map((p) => [p.x, p.y]),
        pointsWithWidth: exitPts
      }

      return [connectStroke, topStroke, bottomStroke, exitStroke]
    }
  }

  // Special calligraphic handling for singular Taa Marbuta (uni06D5 / uni0629 in extended_قراءة / isolated ة):
  // User instructions: "the ة also in the singular is drawn from the top moving to the arc on the left down then back again to the start button"
  // Counter-clockwise loop: starts at top, moves left and down, across bottom, and returns to start
  if (
    char &&
    (char.includes('06D5') || (char.includes('0629') && !char.includes('fina')) || char === 'ة') &&
    rawStrokes.length >= 1
  ) {
    const s0 = rawStrokes[0]
    if (s0.points.length >= 10) {
      const rawPts = s0.points
      const loopPts = [rawPts[0], ...rawPts.slice(1).reverse(), rawPts[0]].map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const loopPath = pointsToSvgPath(loopPts)
      const loopStroke: StrokeItem = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(loopPath).getTotalLength()),
        durationMs: 400,
        delayMs: 0,
        startPoint: { x: loopPts[0].x, y: loopPts[0].y },
        endPoint: { x: loopPts[loopPts.length - 1].x, y: loopPts[loopPts.length - 1].y },
        medianPath: loopPath,
        points: loopPts.map((p) => [p.x, p.y]),
        pointsWithWidth: loopPts
      }

      // Convert any candidate dots (e.g. for isolated ة)
      const convertedDots: StrokeItem[] = []
      let curDelay = 470
      for (let dIdx = 1; dIdx < rawStrokes.length; dIdx++) {
        const sDot = rawStrokes[dIdx]
        const pts = sDot.points
        const cx = pts[0].x
        const cy = pts[0].y
        const dotDelta = 18
        convertedDots.push({
          order: dIdx,
          originalOrder: sDot.order,
          priority: sDot.priority ?? -1,
          isCandidateDot: true,
          direction: 'upper_left_to_lower_right',
          length: sDot.length,
          durationMs: Math.max(Math.round(sDot.animationDuration * 1000), 1),
          delayMs: curDelay,
          startPoint: { x: cx - dotDelta, y: cy - dotDelta, anchor: 'dot_candidate_upper_left' },
          endPoint: { x: cx + dotDelta, y: cy + dotDelta, anchor: 'dot_candidate_lower_right' },
          medianPath: `M ${Math.round((cx - dotDelta) * 10) / 10} ${Math.round((cy - dotDelta) * 10) / 10} L ${Math.round((cx + dotDelta) * 10) / 10} ${Math.round((cy + dotDelta) * 10) / 10}`,
          points: [[cx, cy]],
          pointsWithWidth: [{ x: cx, y: cy, t: 0, width: pts[0].width || 79 }]
        })
        curDelay += Math.max(Math.round(sDot.animationDuration * 1000), 1) + 70
      }

      // Sort dots horizontally from left to right
      convertedDots.sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
      convertedDots.forEach((d, idx) => {
        d.order = idx + 1
      })

      return [loopStroke, ...convertedDots]
    }
  }

  // Special calligraphic handling for final Taa Marbuta (uni0647.fina / uni0629.fina in extended_بيئة):
  // User instructions: "in the final the arc is the last drawing step before the dots also the line of the ة in the finale is drawn bottom to up"
  // 1 (line of ة): baseline entry from preceding letter ascending all the way up the stem to the top tip (drawn bottom to up!)
  // 2 (arc of ة): loops around from top junction down the left arc to the bottom junction (last drawing step before dots!)
  if (
    char &&
    (char.includes('0647.fina') || char.includes('0629.fina')) &&
    rawStrokes.length >= 2
  ) {
    const s0 = rawStrokes[0]
    const s1 = rawStrokes[1]
    if (s0.points.length === 27 && s1.points.length === 3) {
      // 1. Line of the ة (bottom to up):
      // basePts (pt 26..19 reversed) + stemMiddlePts (s1 pt 2..0 reversed) + stemTopPts (s0 pt 2..0 reversed)
      const basePts = s0.points.slice(19).reverse()
      const stemMiddlePts = s1.points.slice().reverse()
      const stemTopPts = s0.points.slice(0, 3).reverse()
      const linePts = [...basePts, ...stemMiddlePts.slice(1), ...stemTopPts].map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const linePath = pointsToSvgPath(linePts)
      const lineStroke = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'bottom_to_top',
        length: Math.round(new svgPathProperties(linePath).getTotalLength()),
        durationMs: 300,
        delayMs: 0,
        startPoint: { x: linePts[0].x, y: linePts[0].y },
        endPoint: { x: linePts[linePts.length - 1].x, y: linePts[linePts.length - 1].y },
        medianPath: linePath,
        points: linePts.map((p) => [p.x, p.y]),
        pointsWithWidth: linePts
      }

      // 2. Arc of the ة (last drawing step before dots):
      // s0 pt 3..19 from junction curving left down to bottom junction
      const arcPts = s0.points.slice(3, 20).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const arcPath = pointsToSvgPath(arcPts)
      const arcStroke = {
        order: 1,
        originalOrder: 1,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(arcPath).getTotalLength()),
        durationMs: 300,
        delayMs: 0,
        startPoint: { x: arcPts[0].x, y: arcPts[0].y },
        endPoint: { x: arcPts[arcPts.length - 1].x, y: arcPts[arcPts.length - 1].y },
        medianPath: arcPath,
        points: arcPts.map((p) => [p.x, p.y]),
        pointsWithWidth: arcPts
      }

      return [lineStroke, arcStroke]
    }
  }

  // Special calligraphic handling for Tah and Zah (ط, ظ, uni0637, uni0638):
  // User instructions: "in ط and ظ the first step and 3rd step are 1 step not 2 while the 2nd step must be the last step"
  // 1 (Loop/Body): The ascending curve (reversed short stroke from baseline (211, -38) up to (259, -184))
  //   and the loop/baseline of the long stroke (from (261, -186) around head to (43, -26)) UNIFY into ONE single continuous step!
  // 2 (Vertical Stick): The vertical alif of Tah (from top (233, -676) down to junction (249, -194)), which was step 2, is the last body step!
  // 3 (Dot on Zah): The upper dot placed last.
  const isTahOrZah =
    char &&
    (char === 'ط' ||
      char === 'ظ' ||
      char.includes('0637') ||
      char.includes('0638') ||
      char.includes('tah') ||
      char.includes('zah'))

  if (isTahOrZah && rawStrokes.length >= 2) {
    const shortStroke = rawStrokes.find((s) => s.points.length === 4)
    const longStroke = rawStrokes.find((s) => s.points.length === 27)
    const dotRaw = rawStrokes.find((s) => s.points.length === 1)

    if (shortStroke && longStroke) {
      // 1. Unified Loop Stroke (1st and 3rd step unified into 1 continuous step):
      const reversedShortPts = shortStroke.points.slice().reverse()
      const loopRawPts = [...reversedShortPts, ...longStroke.points.slice(2)]
      const loopPts: PointWithWidth[] = loopRawPts.map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const loopPath = pointsToSvgPath(loopPts)
      const loopLength = Math.round(new svgPathProperties(loopPath).getTotalLength())
      const loopStroke: StrokeItem = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: loopLength,
        durationMs: 480,
        delayMs: 0,
        startPoint: { x: loopPts[0].x, y: loopPts[0].y },
        endPoint: { x: loopPts[loopPts.length - 1].x, y: loopPts[loopPts.length - 1].y },
        medianPath: loopPath,
        points: loopPts.map((p) => [p.x, p.y]),
        pointsWithWidth: loopPts
      }

      // 2. Vertical Stick Stroke (previously step 2; now the last body step):
      const p0 = longStroke.points[0]
      const p1 = longStroke.points[1]
      const stickPts: PointWithWidth[] = []
      const numStickSteps = 10
      for (let i = 0; i <= numStickSteps; i++) {
        const fraction = i / numStickSteps
        stickPts.push({
          x: Math.round((p0.x + fraction * (p1.x - p0.x)) * 100) / 100,
          y: Math.round((p0.y + fraction * (p1.y - p0.y)) * 100) / 100,
          width: Math.round((p0.width + fraction * (p1.width - p0.width)) * 100) / 100,
          t: Math.round(fraction * 1000) / 1000
        })
      }
      const stickPath = pointsToSvgPath(stickPts)
      const stickLength = Math.round(new svgPathProperties(stickPath).getTotalLength())
      const stickStroke: StrokeItem = {
        order: 1,
        originalOrder: 1,
        priority: 0,
        isCandidateDot: false,
        direction: 'top_to_bottom',
        length: stickLength,
        durationMs: 220,
        delayMs: (loopStroke.durationMs ?? 400) + 70,
        startPoint: { x: stickPts[0].x, y: stickPts[0].y },
        endPoint: { x: stickPts[stickPts.length - 1].x, y: stickPts[stickPts.length - 1].y },
        medianPath: stickPath,
        points: stickPts.map((p) => [p.x, p.y]),
        pointsWithWidth: stickPts
      }

      if (dotRaw) {
        const cx = dotRaw.points[0].x
        const cy = dotRaw.points[0].y
        const dotDelta = 18
        const dotPath = `M ${Math.round((cx - dotDelta) * 10) / 10} ${Math.round((cy - dotDelta) * 10) / 10} L ${Math.round((cx + dotDelta) * 10) / 10} ${Math.round((cy + dotDelta) * 10) / 10}`
        const dotStroke: StrokeItem = {
          order: 2,
          originalOrder: 2,
          priority: 0,
          isCandidateDot: true,
          direction: 'upper_left_to_lower_right',
          length: 0,
          durationMs: 1,
          delayMs: (loopStroke.durationMs ?? 400) + 70 + (stickStroke.durationMs ?? 220) + 70,
          startPoint: { x: cx - dotDelta, y: cy - dotDelta, anchor: 'dot_candidate_upper_left' },
          endPoint: { x: cx + dotDelta, y: cy + dotDelta, anchor: 'dot_candidate_lower_right' },
          medianPath: dotPath,
          points: [[cx, cy]],
          pointsWithWidth: [{ x: cx, y: cy, t: 0, width: dotRaw.points[0].width || 84.77 }]
        }
        return [loopStroke, stickStroke, dotStroke]
      }

      return [loopStroke, stickStroke]
    }
  }

  // Special calligraphic handling for isolated Heh (ه, uni0647):
  // User instructions:
  // "ok now this small final part of the first step i want it as seperate step and make it the final step while you are have a point to stop on it and start at the end"
  // "step 2 is reversed and 3 leave it as it is"
  // 1. Step 1 (outer curve): s0 pts 0..21 from apex (265.46, -441.88) curving down/around to junction (289.02, -80.04)
  // 2. Step 2 (inner ascending): s1 reversed from junction (289.02, -80.04) ascending up to (332.78, -381.29)
  // 3. Step 3 (inner eye curve): s2 as is from (443.86, -288.73) down to (366.44, -58.16)
  // 4. Step 4 (final tail): s0 pts 21..26 from junction (289.02, -80.04) extending along baseline to terminal (23.11, -27.86)
  const isIsolatedHeh =
    char &&
    (char === 'ه' || char.includes('0647') || char.includes('heh')) &&
    !char.includes('init') &&
    !char.includes('medi') &&
    !char.includes('fina')

  if (isIsolatedHeh && rawStrokes.length >= 3) {
    const s0 = rawStrokes.find((s) => s.points.length === 27)
    const s1 = rawStrokes.find((s) => s.points.length === 12)
    const s2 = rawStrokes.find((s) => s.points.length === 9)

    if (s0 && s1 && s2) {
      // 1. Step 1: s0 pts 0..21
      const p1: PointWithWidth[] = s0.points.slice(0, 22).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const path1 = pointsToSvgPath(p1)
      const step1: StrokeItem = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(path1).getTotalLength()),
        durationMs: 300,
        delayMs: 0,
        startPoint: { x: p1[0].x, y: p1[0].y },
        endPoint: { x: p1[p1.length - 1].x, y: p1[p1.length - 1].y },
        medianPath: path1,
        points: p1.map((p) => [p.x, p.y]),
        pointsWithWidth: p1
      }

      // 2. Step 2: s1 reversed
      const p2: PointWithWidth[] = s1.points
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          x: p.x,
          y: p.y,
          width: p.width,
          t: Math.round((i / (arr.length - 1)) * 1000) / 1000
        }))
      const path2 = pointsToSvgPath(p2)
      const step2: StrokeItem = {
        order: 1,
        originalOrder: 1,
        priority: 0,
        isCandidateDot: false,
        direction: 'bottom_to_top',
        length: Math.round(new svgPathProperties(path2).getTotalLength()),
        durationMs: 180,
        delayMs: (step1.durationMs ?? 300) + 70,
        startPoint: { x: p2[0].x, y: p2[0].y },
        endPoint: { x: p2[p2.length - 1].x, y: p2[p2.length - 1].y },
        medianPath: path2,
        points: p2.map((p) => [p.x, p.y]),
        pointsWithWidth: p2
      }

      // 3. Step 3: s2 as is
      const p3: PointWithWidth[] = s2.points.slice().map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const path3 = pointsToSvgPath(p3)
      const step3: StrokeItem = {
        order: 2,
        originalOrder: 2,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(path3).getTotalLength()),
        durationMs: 150,
        delayMs: (step1.durationMs ?? 300) + 70 + (step2.durationMs ?? 180) + 70,
        startPoint: { x: p3[0].x, y: p3[0].y },
        endPoint: { x: p3[p3.length - 1].x, y: p3[p3.length - 1].y },
        medianPath: path3,
        points: p3.map((p) => [p.x, p.y]),
        pointsWithWidth: p3
      }

      // 4. Step 4 (final tail): s0 pts 21..26
      const p4: PointWithWidth[] = s0.points.slice(21).map((p, i, arr) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const path4 = pointsToSvgPath(p4)
      const step4: StrokeItem = {
        order: 3,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(path4).getTotalLength()),
        durationMs: 150,
        delayMs:
          (step1.durationMs ?? 300) +
          70 +
          (step2.durationMs ?? 180) +
          70 +
          (step3.durationMs ?? 150) +
          70,
        startPoint: { x: p4[0].x, y: p4[0].y },
        endPoint: { x: p4[p4.length - 1].x, y: p4[p4.length - 1].y },
        medianPath: path4,
        points: p4.map((p) => [p.x, p.y]),
        pointsWithWidth: p4
      }

      return [step1, step2, step3, step4]
    }
  }

  const convertedStrokes: StrokeItem[] = []

  for (let idx = 0; idx < rawStrokes.length; idx++) {
    const s = rawStrokes[idx]

    // Check for micro-spurs on multi-point strokes
    if (s.points.length > 1 && s.length < MICRO_SPUR_THRESHOLD) {
      cleanupLog.push({
        reason: 'micro-spur',
        originalOrder: idx,
        length: s.length
      })
      // Do not include this phantom spur in the clean candidate strokes
      continue
    }

    let pts = s.points
    // 1a. For connected Alif (uni0627.fina in words like باب, NOT rlig):
    // Stroke must be written from the small bottom line on the right moving to the left, then moving top
    if (
      char &&
      char.includes('0627.fina') &&
      !char.includes('rlig') &&
      pts.length > 1 &&
      pts[0].y < pts[pts.length - 1].y
    ) {
      pts = pts
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          ...p,
          t: arr.length > 1 ? i / (arr.length - 1) : 0
        }))
    }

    // 1b. For all Lam-Alif Alif strokes (singular لا, لال, للا, and any form/word with prefixed or isolated لا):
    // uni0627.fina.rlig and uni0627.fina.rlig.2 must always be drawn ascending from the bottom-center crossing point up to top-left
    const isLamAlifAlif = char && (char.includes('fina.rlig') || char.includes('fina.rlig.2'))
    if (isLamAlifAlif && pts.length > 1 && pts[0].y < pts[pts.length - 1].y) {
      pts = pts
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          ...p,
          t: arr.length > 1 ? i / (arr.length - 1) : 0
        }))
    }

    // 2. For Jim / Haa / Khaa crown beak:
    // Crown beak must be drawn from LEFT to RIGHT
    const isJimFamilyBeak =
      (char === 'ج' && s.order === 2) || ((char === 'ح' || char === 'خ') && s.order === 0)
    if (isJimFamilyBeak && pts.length > 1 && pts[0].x > pts[pts.length - 1].x) {
      pts = pts
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          ...p,
          t: arr.length > 1 ? i / (arr.length - 1) : 0
        }))
    }

    // 3. For Hamza mark base stroke (uni0654, uni0655):
    // Must be drawn in one step from RIGHT to LEFT.
    const isHamzaMarkLine =
      char && (char.includes('0654') || char.includes('0655')) && s.order === 0
    if (isHamzaMarkLine && pts.length > 1 && pts[0].x < pts[pts.length - 1].x) {
      pts = pts
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          ...p,
          t: arr.length > 1 ? i / (arr.length - 1) : 0
        }))
    }

    const isDot = (s.priority && s.priority < 0) || pts.length === 1

    let medianPath = ''
    let startPoint: Point2D | null = null
    let endPoint: Point2D | null = null
    let direction = 'right_to_left'

    if (isDot && pts.length === 1) {
      // Candidate dot: synthesize a candidate diagonal stroke (upper-left to lower-right)
      const cx = pts[0].x
      const cy = pts[0].y
      const dotDelta = 18
      medianPath = `M ${Math.round((cx - dotDelta) * 10) / 10} ${Math.round((cy - dotDelta) * 10) / 10} L ${Math.round((cx + dotDelta) * 10) / 10} ${Math.round((cy + dotDelta) * 10) / 10}`
      startPoint = { x: cx - dotDelta, y: cy - dotDelta, anchor: 'dot_candidate_upper_left' }
      endPoint = { x: cx + dotDelta, y: cy + dotDelta, anchor: 'dot_candidate_lower_right' }
      direction = 'upper_left_to_lower_right'
    } else {
      medianPath = pointsToSvgPath(pts)
      startPoint = pts[0] ? { x: pts[0].x, y: pts[0].y } : null
      endPoint = pts[pts.length - 1] ? { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y } : null
      if (startPoint && endPoint) {
        direction = startPoint.x <= endPoint.x ? 'left_to_right' : 'right_to_left'
      }
    }

    convertedStrokes.push({
      order: convertedStrokes.length,
      originalOrder: s.order,
      priority: s.priority ?? 0,
      isCandidateDot: isDot,
      direction,
      length: s.length,
      durationMs: Math.round(s.animationDuration * 1000),
      delayMs: Math.round(s.delay * 1000),
      startPoint,
      endPoint,
      medianPath,
      points: pts.map((p) => [p.x, p.y]),
      pointsWithWidth: pts.map((p) => ({ x: p.x, y: p.y, t: p.t, width: p.width }))
    })
  }

  function reverseStrokeItem(s: StrokeItem): StrokeItem {
    const ptsWithWidth = (s.pointsWithWidth || [])
      .slice()
      .reverse()
      .map((p, i, arr) => ({
        ...p,
        t: arr.length > 1 ? Math.round((i / (arr.length - 1)) * 1000) / 1000 : 0
      }))
    const points = ptsWithWidth.map((p) => [p.x, p.y] as [number, number])
    const medianPath = pointsToSvgPath(ptsWithWidth)
    const startPoint = ptsWithWidth[0] ? { x: ptsWithWidth[0].x, y: ptsWithWidth[0].y } : null
    const endPoint =
      ptsWithWidth.length > 0
        ? {
            x: ptsWithWidth[ptsWithWidth.length - 1].x,
            y: ptsWithWidth[ptsWithWidth.length - 1].y
          }
        : null

    let direction = s.direction
    if (startPoint && endPoint) {
      const dy = endPoint.y - startPoint.y
      const dx = endPoint.x - startPoint.x
      if (Math.abs(dy) > Math.abs(dx)) {
        direction = dy < 0 ? 'bottom_to_top' : 'top_to_bottom'
      } else {
        direction = dx >= 0 ? 'left_to_right' : 'right_to_left'
      }
    }

    return {
      ...s,
      direction,
      startPoint,
      endPoint,
      medianPath,
      points,
      pointsWithWidth: ptsWithWidth
    }
  }

  // Real-life handwriting flow ordering:
  // 1. For Jeem / Haa / Khaa: Crown beak (left-to-right) first, Belly second, Dot last (if present)!
  // 2. For Hamza marks (uni0654, uni0655): Upper arc (like small ain) first, bottom line second (left to right)!
  // 3. For Seen / Sheen (س, ش, uni0633, uni0634): First arc (right), Middle arc (middle), Big final arc (left), then dots!
  // 4. For Saad / Daad (ص, ض): Loop (head) first, Tail (bowl) last (first step goes last), then dot!
  // 5. For Tah / Zah (ط, ظ): Reversed last step first (bottom-to-top), then body/stick, then dot!
  // 6. For general letters: Base body strokes first, then dots (leftmost dot first).
  let sortedStrokes: StrokeItem[] = []
  const isSeenOrSheen =
    char &&
    (char.includes('0633') ||
      char.includes('0634') ||
      char.includes('seen') ||
      char.includes('sheen') ||
      char === 'س' ||
      char === 'ش')

  if (char === 'ج') {
    const beak = convertedStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 2)
    const belly = convertedStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 1)
    const dot = convertedStrokes.find((s) => s.isCandidateDot || s.originalOrder === 0)
    const others = convertedStrokes.filter((s) => s !== beak && s !== belly && s !== dot)
    sortedStrokes = [beak, belly, ...others, dot].filter((s): s is StrokeItem => Boolean(s))
  } else if (char === 'ح') {
    const beak = convertedStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 0)
    const belly = convertedStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 1)
    const others = convertedStrokes.filter((s) => s !== beak && s !== belly)
    sortedStrokes = [beak, belly, ...others].filter((s): s is StrokeItem => Boolean(s))
  } else if (char === 'خ') {
    const beak = convertedStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 0)
    const belly = convertedStrokes.find((s) => !s.isCandidateDot && s.originalOrder === 1)
    const dot = convertedStrokes.find((s) => s.isCandidateDot || s.originalOrder === 2)
    const others = convertedStrokes.filter((s) => s !== beak && s !== belly && s !== dot)
    sortedStrokes = [beak, belly, ...others, dot].filter((s): s is StrokeItem => Boolean(s))
  } else if (char && (char.includes('0654') || char.includes('0655'))) {
    // Hamza mark on Alif, under Alif, on Waw, on Yeh:
    // Upper arc (like small ain) drawn first (right to left), bottom line drawn second (in one step from right to left)
    const arc = convertedStrokes.find((s) => s.originalOrder === 1) || convertedStrokes[1]
    const line = convertedStrokes.find((s) => s.originalOrder === 0) || convertedStrokes[0]
    const others = convertedStrokes.filter((s) => s !== arc && s !== line)
    sortedStrokes = [arc, line, ...others].filter((s): s is StrokeItem => Boolean(s))
  } else if (isSeenOrSheen) {
    const bodyStrokes = convertedStrokes.filter((s) => !s.isCandidateDot)
    const dotStrokes = convertedStrokes
      .filter((s) => s.isCandidateDot)
      .sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
    // Sort arcs from right to left (largest X first: first arc -> middle arc -> big final arc)
    bodyStrokes.sort((a, b) => {
      const maxXA = Math.max(...a.points.map((p) => p[0]))
      const maxXB = Math.max(...b.points.map((p) => p[0]))
      return maxXB - maxXA
    })
    sortedStrokes = [...bodyStrokes, ...dotStrokes]
  } else if (char === 'ص' || (char && (char.includes('0635') || char.includes('saad')))) {
    // In ص: the first step must be the last step (Loop first, Tail last)
    const body = convertedStrokes.filter((s) => !s.isCandidateDot)
    const dots = convertedStrokes.filter((s) => s.isCandidateDot)
    if (body.length >= 2) {
      const firstStep = body[0]
      const otherSteps = body.slice(1)
      sortedStrokes = [...otherSteps, firstStep, ...dots]
    } else {
      sortedStrokes = [...body, ...dots]
    }
  } else if (char === 'ض' || (char && (char.includes('0636') || char.includes('daad')))) {
    // In ض: the first step must be the last step (Loop first, Tail second, Dot last)
    const body = convertedStrokes.filter((s) => !s.isCandidateDot)
    const dots = convertedStrokes
      .filter((s) => s.isCandidateDot)
      .sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
    if (body.length >= 2) {
      const firstStep = body[0]
      const otherSteps = body.slice(1)
      sortedStrokes = [...otherSteps, firstStep, ...dots]
    } else {
      sortedStrokes = [...body, ...dots]
    }
  } else if (
    char &&
    (char === 'ع' ||
      char === 'غ' ||
      char.includes('0639') ||
      char.includes('063A') ||
      char.includes('ain') ||
      char.includes('ghain')) &&
    !char.includes('init') &&
    !char.includes('medi') &&
    !char.includes('fina')
  ) {
    // For isolated Ain (ع) and Ghain (غ):
    // 1. Head/eyebrow is step 1 (order 0)
    // 2. The crescent belly (step 2) is exactly 1 step, drawn reversed from neck (190, -160) down to bottom tip
    // 3. For Ghain (غ): Dot on top is the last step (order 2)
    const body = convertedStrokes.filter((s) => !s.isCandidateDot)
    const dots = convertedStrokes
      .filter((s) => s.isCandidateDot)
      .sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
    if (body.length >= 2) {
      const head = body[0]
      const belly = reverseStrokeItem(body[1])
      sortedStrokes = [head, belly, ...dots]
    } else {
      sortedStrokes = [...body, ...dots]
    }
  } else if (
    char &&
    (char === 'ك' || char.includes('0643') || char.includes('kaf')) &&
    !char.includes('init') &&
    !char.includes('medi') &&
    !char.includes('fina')
  ) {
    // For isolated Kaf (ك):
    // Inside it is a mini-hamza, so the Kaaf body is drawn first, and the hamza is the last thing to draw!
    const body = convertedStrokes.filter((s) => !s.isCandidateDot)
    const dots = convertedStrokes.filter((s) => s.isCandidateDot)
    if (body.length >= 2) {
      const hamza = body.find((s) => s.originalOrder === 0) || body[0]
      const kaafBody = body.find((s) => s.originalOrder === 1) || body[1]
      sortedStrokes = [kaafBody, hamza, ...dots]
    } else {
      sortedStrokes = [...body, ...dots]
    }
  } else {
    const body = convertedStrokes.filter((s) => !s.isCandidateDot)
    const dots = convertedStrokes
      .filter((s) => s.isCandidateDot)
      .sort((a, b) => (a.startPoint?.x ?? 0) - (b.startPoint?.x ?? 0))
    sortedStrokes = [...body, ...dots]
  }

  // Re-index order property sequentially (0, 1, 2...) and re-align delays
  let curDelay = 0
  sortedStrokes.forEach((s, idx) => {
    s.order = idx
    s.delayMs = curDelay
    curDelay += (s.durationMs ?? 400) + 70
  })

  return sortedStrokes
}

function convertGlyphs(
  rawGlyphs: RawHarfbuzzGlyph[],
  wordCleanup: WordCleanupItem[],
  defaultSource: SourceMetadata
): GlyphInstance[] {
  // Pass 1: Compute HarfBuzz visual layout positions
  let curX = 0
  const positionedGlyphs: GlyphInstance[] = rawGlyphs.map((g) => {
    const gCleanup: CleanupLogItem[] = []
    const strokes = g.glyphData ? convertStrokes(g.glyphData.strokes, gCleanup, g.char) : []
    if (gCleanup.length > 0) wordCleanup.push({ gid: g.codepoint, removed: gCleanup })
    const gx = curX + (g.xOffset || 0)
    const gy = -(g.yOffset || 0)
    curX += g.xAdvance || 0
    return {
      glyphId: g.codepoint,
      cluster: g.cluster,
      xAdvance: g.xAdvance,
      yAdvance: g.yAdvance,
      xOffset: g.xOffset,
      yOffset: g.yOffset,
      xPosition: gx,
      yPosition: gy,
      char: g.char,
      outlinePath: g.glyphData?.pathString ?? null,
      strokes,
      validation: { status: 'needs-review', notes: 'Glyph candidate shaped via HarfBuzz' },
      animation: { capability: 'animated', notes: 'Candidate stroke sequence' },
      source: defaultSource
    }
  })

  // Pass 2: Sort into true calligraphic sequence:
  // "the order of drawing is the letter then all his dots then all his diaritics then the next letter and so on"
  // Group by cluster (letter by letter in Arabic right-to-left order):
  const clustersMap = new Map<number, GlyphInstance[]>()
  for (const g of positionedGlyphs) {
    const c = g.cluster ?? 0
    if (!clustersMap.has(c)) clustersMap.set(c, [])
    clustersMap.get(c)!.push(g)
  }

  const sortedClusterIds = Array.from(clustersMap.keys()).sort((a, b) => a - b)
  const sorted: GlyphInstance[] = []

  for (const cid of sortedClusterIds) {
    const clusterGlyphs = clustersMap.get(cid)!
    const base = clusterGlyphs.filter(
      (g) => !isTashkeelGlyph(g.char || '') && !isDotGlyph(g.char || '')
    )
    const dots = clusterGlyphs.filter((g) => isDotGlyph(g.char || ''))
    const tashkeel = clusterGlyphs.filter((g) => isTashkeelGlyph(g.char || ''))

    // Sort dots leftmost first
    dots.sort((a, b) => (a.xPosition ?? 0) - (b.xPosition ?? 0))

    // Sort tashkeel on this letter: bottom line right to left, then top line level 1 -> level 2 right to left
    interface TashkeelPositioned {
      g: GlyphInstance
      avgX: number
      avgY: number
      isBottom: boolean
    }

    const tashkeelWithPos: TashkeelPositioned[] = tashkeel.map((g) => {
      const s0 = g.strokes?.[0]
      const avgY =
        s0?.startPoint && s0?.endPoint
          ? (s0.startPoint.y + s0.endPoint.y) / 2 + (g.yPosition || 0)
          : g.yPosition || 0
      const avgX =
        s0?.startPoint && s0?.endPoint
          ? (s0.startPoint.x + s0.endPoint.x) / 2 + (g.xPosition || 0)
          : g.xPosition || 0
      const isBottom = avgY > -200
      return { g, avgX, avgY, isBottom }
    })

    const bottomTashkeel = tashkeelWithPos.filter((t) => t.isBottom)
    bottomTashkeel.sort((a, b) => b.avgX - a.avgX)

    const topTashkeel = tashkeelWithPos.filter((t) => !t.isBottom)
    topTashkeel.sort((a, b) => {
      if (Math.abs(a.avgY - b.avgY) > 100) {
        return b.avgY - a.avgY // closer to baseline first (level 1 before level 2)
      }
      return b.avgX - a.avgX // right to left
    })

    sorted.push(...base, ...dots, ...bottomTashkeel.map((t) => t.g), ...topTashkeel.map((t) => t.g))
  }

  // Special handwriting sequence calibration for word "للا":
  // Requested Order: 1 (initLam), 2 (connect), 3 (stem), 4 (arc), 5 (alif, last step)
  // 1: Initial Lam (top down to baseline)
  // 2: Connect (right baseline to junction)
  // 3: Middle vertical stem (junction moving up to top)
  // 4: Small half-arc (junction down-left to baseline)
  // 5: Diagonal Alif (top-left down towards junction, ending the word)
  const mediGlyph = sorted.find((g) => g.char === 'uni0644.medi.rlig')
  const finaGlyph = sorted.find((g) => g.char === 'uni0627.fina.rlig.2')

  if (mediGlyph && finaGlyph && (mediGlyph.strokes?.length ?? 0) >= 2) {
    const rawS0 = mediGlyph.strokes![0]
    const stemStroke = mediGlyph.strokes![1]
    const pts = rawS0.pointsWithWidth || []

    if (pts.length === 15) {
      // 2. Connect from right baseline to junction
      const connectPts: PointWithWidth[] = pts.slice(0, 6).map((p, i, arr) => ({
        ...p,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const connectPath = pointsToSvgPath(connectPts)
      const connectStroke: StrokeItem = {
        order: 0,
        originalOrder: 0,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(connectPath).getTotalLength()),
        durationMs: 200,
        delayMs: 0,
        startPoint: { x: connectPts[0].x, y: connectPts[0].y },
        endPoint: {
          x: connectPts[connectPts.length - 1].x,
          y: connectPts[connectPts.length - 1].y
        },
        medianPath: connectPath,
        points: connectPts.map((p) => [p.x, p.y]),
        pointsWithWidth: connectPts
      }

      // mediGlyph keeps stroke 2 (connect)
      mediGlyph.strokes = [connectStroke]

      // 3 (word stroke 3): Middle vertical stem (from junction moving up towards top)
      const rawStemPts: PointWithWidth[] = (stemStroke.pointsWithWidth || []).map((p) => ({
        ...p,
        x: Math.round((p.x + (mediGlyph.xPosition || 379)) * 100) / 100
      }))
      const stemPts: PointWithWidth[] = rawStemPts
        .slice()
        .reverse()
        .map((p, i, arr) => ({
          ...p,
          t: Math.round((i / (arr.length - 1)) * 1000) / 1000
        }))
      const stemPath = pointsToSvgPath(stemPts)
      const calibratedStem: StrokeItem = {
        ...stemStroke,
        order: 0,
        direction: 'bottom_to_top',
        length: Math.round(new svgPathProperties(stemPath).getTotalLength()),
        startPoint: { x: stemPts[0].x, y: stemPts[0].y },
        endPoint: { x: stemPts[stemPts.length - 1].x, y: stemPts[stemPts.length - 1].y },
        medianPath: stemPath,
        points: stemPts.map((p) => [p.x, p.y]),
        pointsWithWidth: stemPts
      }

      // 4 (word stroke 4): Small half-arc (from junction to left baseline)
      const arcPts: PointWithWidth[] = pts.slice(5).map((p, i, arr) => ({
        x: Math.round((p.x + (mediGlyph.xPosition || 379)) * 100) / 100,
        y: p.y,
        width: p.width,
        t: Math.round((i / (arr.length - 1)) * 1000) / 1000
      }))
      const arcPath = pointsToSvgPath(arcPts)
      const arcStroke: StrokeItem = {
        order: 1,
        originalOrder: 2,
        priority: 0,
        isCandidateDot: false,
        direction: 'right_to_left',
        length: Math.round(new svgPathProperties(arcPath).getTotalLength()),
        durationMs: 250,
        delayMs: 0,
        startPoint: { x: arcPts[0].x, y: arcPts[0].y },
        endPoint: { x: arcPts[arcPts.length - 1].x, y: arcPts[arcPts.length - 1].y },
        medianPath: arcPath,
        points: arcPts.map((p) => [p.x, p.y]),
        pointsWithWidth: arcPts
      }

      // 5 (word stroke 5, LAST STEP): Diagonal Alif (from top-left down towards junction)
      const alifStroke = finaGlyph.strokes?.[0]
      if (alifStroke) {
        alifStroke.order = 2
        const aPts: PointWithWidth[] = (alifStroke.pointsWithWidth || [])
          .slice()
          .reverse()
          .map((p, i, arr) => ({
            ...p,
            t: Math.round((i / (arr.length - 1)) * 1000) / 1000
          }))
        const aPath = pointsToSvgPath(aPts)
        alifStroke.startPoint = { x: aPts[0].x, y: aPts[0].y }
        alifStroke.endPoint = { x: aPts[aPts.length - 1].x, y: aPts[aPts.length - 1].y }
        alifStroke.medianPath = aPath
        alifStroke.points = aPts.map((p) => [p.x, p.y])
        alifStroke.pointsWithWidth = aPts
        alifStroke.direction = 'left_to_right'
      }

      // finaGlyph has: 0: stem (word stroke 3), 1: arc (word stroke 4), 2: alif (word stroke 5, last step)
      // Combined sequence across word: 1 (initLam), 2 (connect), 3 (stem), 4 (arc), 5 (alif, last step)
      finaGlyph.strokes = [calibratedStem, arcStroke, alifStroke].filter((s): s is StrokeItem =>
        Boolean(s)
      )
    }
  }

  return sorted
}

function pointsToSplinePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${Math.round(cp1x * 10) / 10} ${Math.round(cp1y * 10) / 10}, ${Math.round(cp2x * 10) / 10} ${Math.round(cp2y * 10) / 10}, ${p2.x} ${p2.y}`
  }
  return path
}

function samplePathInFontUnits(pathStr: string, numSamples: number, strokeWidth = 65): RawPoint[] {
  const props = new svgPathProperties(pathStr)
  const totalLen = props.getTotalLength()
  const pts: RawPoint[] = []
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples
    const pt = props.getPointAtLength(t * totalLen)
    pts.push({
      x: Math.round(pt.x * 100) / 100,
      y: Math.round(pt.y * 100) / 100,
      t: Math.round(t * 1000) / 1000,
      width: strokeWidth
    })
  }
  return pts
}

export function generateIsolatedSeen(defaultSource: SourceMetadata): LetterEntry {
  // Centerline waypoints calibrated directly to font outline geometry:
  // Tooth 1 (right): Wide U-trough across baseline, curves smoothly up to peak 1/2
  const s1Waypoints: Point2D[] = [
    { x: 1110, y: -395 },
    { x: 1118, y: -290 },
    { x: 1105, y: -190 },
    { x: 1075, y: -110 },
    { x: 1035, y: -50 },
    { x: 980, y: -36 },
    { x: 925, y: -50 },
    { x: 895, y: -110 },
    { x: 880, y: -190 },
    { x: 875, y: -275 }
  ]

  // Tooth 2 (middle): Wide U-trough across baseline, curves smoothly up to peak 2/3
  const s2Waypoints: Point2D[] = [
    { x: 875, y: -275 },
    { x: 865, y: -190 },
    { x: 840, y: -110 },
    { x: 800, y: -50 },
    { x: 745, y: -36 },
    { x: 690, y: -45 },
    { x: 645, y: -110 },
    { x: 610, y: -190 },
    { x: 575, y: -275 }
  ]

  // Tooth 3 & Bowl (left): Vertical stem descending into deep, wide calligraphic bowl with open degree
  const s3Waypoints: Point2D[] = [
    { x: 575, y: -275 },
    { x: 575, y: -175 },
    { x: 570, y: -90 },
    { x: 565, y: 0 },
    { x: 550, y: 75 },
    { x: 490, y: 140 },
    { x: 400, y: 180 },
    { x: 315, y: 191 },
    { x: 200, y: 168 },
    { x: 115, y: 105 },
    { x: 72, y: 10 },
    { x: 75, y: -75 },
    { x: 105, y: -160 }
  ]

  const p1 = pointsToSplinePath(s1Waypoints)
  const p2 = pointsToSplinePath(s2Waypoints)
  const p3 = pointsToSplinePath(s3Waypoints)

  const s1Pts = samplePathInFontUnits(p1, 25)
  const s2Pts = samplePathInFontUnits(p2, 25)
  const s3Pts = samplePathInFontUnits(p3, 40)

  const s1Path = pointsToSvgPath(s1Pts)
  const s2Path = pointsToSvgPath(s2Pts)
  const s3Path = pointsToSvgPath(s3Pts)

  const strokes: StrokeItem[] = [
    {
      order: 0,
      originalOrder: 0,
      priority: 0,
      isCandidateDot: false,
      direction: 'right_to_left',
      length: Math.round(new svgPathProperties(s1Path).getTotalLength()),
      durationMs: 800,
      delayMs: 0,
      startPoint: { x: s1Pts[0].x, y: s1Pts[0].y },
      endPoint: { x: s1Pts[s1Pts.length - 1].x, y: s1Pts[s1Pts.length - 1].y },
      medianPath: s1Path,
      points: s1Pts.map((p) => [p.x, p.y]),
      pointsWithWidth: s1Pts
    },
    {
      order: 1,
      originalOrder: 1,
      priority: 0,
      isCandidateDot: false,
      direction: 'right_to_left',
      length: Math.round(new svgPathProperties(s2Path).getTotalLength()),
      durationMs: 800,
      delayMs: 0,
      startPoint: { x: s2Pts[0].x, y: s2Pts[0].y },
      endPoint: { x: s2Pts[s2Pts.length - 1].x, y: s2Pts[s2Pts.length - 1].y },
      medianPath: s2Path,
      points: s2Pts.map((p) => [p.x, p.y]),
      pointsWithWidth: s2Pts
    },
    {
      order: 2,
      originalOrder: 2,
      priority: 0,
      isCandidateDot: false,
      direction: 'right_to_left',
      length: Math.round(new svgPathProperties(s3Path).getTotalLength()),
      durationMs: 1200,
      delayMs: 0,
      startPoint: { x: s3Pts[0].x, y: s3Pts[0].y },
      endPoint: { x: s3Pts[s3Pts.length - 1].x, y: s3Pts[s3Pts.length - 1].y },
      medianPath: s3Path,
      points: s3Pts.map((p) => [p.x, p.y]),
      pointsWithWidth: s3Pts
    }
  ]

  const seenOutline =
    'M313 232Q238 232 173.5 204.5Q109 177 69.5 125.5Q30 74 30 1Q30 -35 40.0 -79.0Q50 -123 72 -176L144 -148Q128 -106 120.0 -71.0Q112 -36 112 -6Q112 45 139.5 80.0Q167 115 213.5 132.5Q260 150 316 150Q407 150 458.5 123.5Q510 97 531.5 56.5Q553 16 553 -26Q553 -92 538.5 -147.5Q524 -203 507 -262L588 -284Q604 -227 610.5 -201.5Q617 -176 621 -160Q632 -123 646.5 -105.5Q661 -88 680.5 -82.5Q700 -77 725 -77Q745 -77 760.5 -82.0Q776 -87 789.5 -106.0Q803 -125 813.5 -167.0Q824 -209 833 -282L909 -268Q906 -250 902.0 -224.0Q898 -198 894.5 -172.5Q891 -147 891 -130Q891 -116 897.5 -103.5Q904 -91 923.5 -84.0Q943 -77 982 -77Q1013 -77 1035.5 -81.5Q1058 -86 1070.5 -104.5Q1083 -123 1083 -163Q1083 -201 1065.5 -258.5Q1048 -316 1026 -373L1107 -403Q1120 -371 1131.5 -330.0Q1143 -289 1151.0 -249.0Q1159 -209 1159 -179Q1159 -111 1136.0 -70.5Q1113 -30 1072.5 -12.5Q1032 5 981 5Q926 5 894.5 -9.5Q863 -24 849 -55Q827 -23 797.0 -9.0Q767 5 720 5Q691 5 670.0 -2.5Q649 -10 635 -22Q628 24 610.0 69.0Q592 114 556.0 151.0Q520 188 460.5 210.0Q401 232 313 232Z'

  return {
    id: 'letter_س',
    char: 'س',
    unicode: 1587,
    advanceWidth: 1209,
    boundingBox: { x1: 30, y1: -232, x2: 1159, y2: 403 },
    outlinePath: seenOutline,
    validation: {
      status: 'verified',
      notes:
        'Isolated Seen synthesized from 3-arc calligraphic blueprint (First arc -> Middle arc -> Big final arc)'
    },
    animation: {
      capability: 'animated',
      notes: 'Verified sequence'
    },
    source: defaultSource,
    cleanup: { removedSegments: [] },
    strokes
  }
}

export function generateIsolatedSheen(defaultSource: SourceMetadata): LetterEntry {
  const seen = generateIsolatedSeen(defaultSource)
  const delta = 18
  const dotCoords = [
    { cx: 779.5, cy: -475 }, // Left dot
    { cx: 847.5, cy: -585 }, // Top / middle dot
    { cx: 915.5, cy: -475 } // Right dot
  ]

  const dotStrokes: StrokeItem[] = dotCoords.map((d, i) => ({
    order: 3 + i,
    originalOrder: 3 + i,
    priority: -1,
    isCandidateDot: true,
    direction: 'upper_left_to_lower_right',
    length: 1,
    durationMs: 1,
    delayMs: 600,
    startPoint: {
      x: Math.round((d.cx - delta) * 10) / 10,
      y: Math.round((d.cy - delta) * 10) / 10,
      anchor: 'dot_candidate_upper_left'
    },
    endPoint: {
      x: Math.round((d.cx + delta) * 10) / 10,
      y: Math.round((d.cy + delta) * 10) / 10,
      anchor: 'dot_candidate_lower_right'
    },
    medianPath: `M ${Math.round((d.cx - delta) * 10) / 10} ${Math.round((d.cy - delta) * 10) / 10} L ${Math.round((d.cx + delta) * 10) / 10} ${Math.round((d.cy + delta) * 10) / 10}`,
    points: [[d.cx, d.cy]],
    pointsWithWidth: [{ x: d.cx, y: d.cy, t: 0, width: 77.16 }]
  }))

  const dotsOutline = dotCoords.map(({ cx, cy }) => ` ${canonicalDotOutlineAt({ x: cx, y: cy })}`).join('')

  return {
    id: 'letter_ش',
    char: 'ش',
    unicode: 1588,
    advanceWidth: 1209,
    boundingBox: { x1: 30, y1: -232, x2: 1159, y2: 617 },
    outlinePath: seen.outlinePath + dotsOutline,
    validation: {
      status: 'verified',
      notes: 'Isolated Sheen synthesized from 3-arc calligraphic blueprint + 3 upper dots'
    },
    animation: {
      capability: 'animated',
      notes: 'Verified sequence'
    },
    source: defaultSource,
    cleanup: { removedSegments: [] },
    strokes: [...seen.strokes, ...dotStrokes]
  }
}

export function convertRawTegakiToCandidates(
  rawPath: string,
  outPath: string,
  reportPath: string
): void {
  console.log(`Reading raw Tegaki dataset from: ${rawPath}`)
  const rawData: RawTegakiDataset = JSON.parse(fs.readFileSync(rawPath, 'utf8'))

  const candidateDataset: ArabicStrokeDataset = {
    meta: {
      schemaVersion: '1.0.0-candidate',
      datasetVersion: '0.2.0',
      language: 'ar',
      script: 'arab',
      generator: 'tegaki-adapter',
      coordinateSpace: 'font-units',
      coordinateSystem: 'font-units',
      unitsPerEm: rawData.metadata.font.unitsPerEm || 1000,
      ascender: rawData.metadata.font.ascender,
      descender: rawData.metadata.font.descender,
      fontFamily: rawData.metadata.font.family,
      fontVersion: rawData.metadata.font.version,
      fontSha256: rawData.metadata.font.sha256,
      generatedAt: new Date().toISOString()
    },
    letters: [],
    contextual: [],
    diacritics: [],
    special: [],
    extended: []
  }

  const auditReport: ConversionReport = {
    generatedAt: new Date().toISOString(),
    generator: 'tegaki-adapter',
    stats: {
      totalEntries: 0,
      verifiedCount: 0,
      needsReviewCount: 0,
      rejectedCount: 0,
      incompleteCount: 0,
      animatedCount: 0,
      totalStrokes: 0,
      removedSpursCount: 0
    },
    cleanupLog: {
      isolated: {},
      contextual: [],
      diacritics: [],
      special: [],
      extended: []
    },
    knownFailures: []
  }

  const defaultSource: SourceMetadata = {
    generator: 'tegaki',
    font: rawData.metadata.font.family,
    fontVersion: rawData.metadata.font.version,
    fontSha256: rawData.metadata.font.sha256
  }

  // Load Frozen Verified Inventory
  const verifiedRefPath = path.resolve('data/golden/verified-reference.json')
  const verifiedRef: VerifiedInventory = fs.existsSync(verifiedRefPath)
    ? JSON.parse(fs.readFileSync(verifiedRefPath, 'utf8'))
    : { letters: [], contextual: [], diacritics: [], special: [], extended: [] }

  const verifiedLetterMap = new Map(verifiedRef.letters.map((l) => [l.char, l]))
  const verifiedContextualMap = new Map(verifiedRef.contextual.map((w) => [w.word, w]))
  const verifiedDiacriticsMap = new Map(verifiedRef.diacritics.map((w) => [w.word, w]))
  const verifiedSpecialMap = new Map(verifiedRef.special.map((w) => [w.word, w]))
  const verifiedExtendedMap = new Map(verifiedRef.extended.map((w) => [w.word, w]))

  // Convert Isolated Letters
  for (const [char, item] of Object.entries(rawData.fixtures.isolated)) {
    if (!item) continue

    // 1. Check if frozen verified
    const frozenLetter = verifiedLetterMap.get(char)
    if (frozenLetter) {
      candidateDataset.letters!.push(JSON.parse(JSON.stringify(frozenLetter)))
      auditReport.stats.totalEntries++
      auditReport.stats.verifiedCount++
      auditReport.stats.animatedCount++
      auditReport.stats.totalStrokes += frozenLetter.strokes.length
      continue
    }

    // 2. New candidate from Tegaki extraction
    const itemCleanup: CleanupLogItem[] = []
    const strokes = convertStrokes(item.strokes, itemCleanup, char)
    if (itemCleanup.length > 0) {
      auditReport.cleanupLog.isolated[char] = itemCleanup
      auditReport.stats.removedSpursCount += itemCleanup.length
    }

    const hasStrokes = strokes.length > 0
    const status: ValidationStatus = hasStrokes ? 'needs-review' : 'rejected'
    const capability = hasStrokes ? 'animated' : 'unsupported'

    candidateDataset.letters!.push({
      id: `letter_${char}`,
      char,
      unicode: item.unicode,
      advanceWidth: item.advanceWidth,
      boundingBox: item.boundingBox,
      outlinePath: item.pathString,
      validation: {
        status,
        notes: hasStrokes
          ? 'Candidate generated via Tegaki; requires human review'
          : 'Failed skeletonization; no usable strokes extracted'
      },
      animation: {
        capability,
        notes: hasStrokes ? 'Candidate sequence' : 'Unsupported geometry'
      },
      source: defaultSource,
      cleanup: {
        removedSegments: itemCleanup
      },
      strokes
    })
    auditReport.stats.totalEntries++
    if (status === 'needs-review') {
      auditReport.stats.needsReviewCount++
    } else {
      auditReport.stats.rejectedCount++
    }
    if (capability === 'animated') {
      auditReport.stats.animatedCount++
    }
    auditReport.stats.totalStrokes += strokes.length
  }

  // Convert Contextual Words
  for (const [word, item] of Object.entries(rawData.fixtures.contextual)) {
    if (!item) continue

    const wordCleanup: WordCleanupItem[] = []
    const glyphs = convertGlyphs(item.glyphs, wordCleanup, defaultSource)

    if (wordCleanup.length > 0) {
      auditReport.cleanupLog.contextual.push(...wordCleanup)
    }

    const frozenWord = verifiedContextualMap.get(word)
    const isVerified = Boolean(frozenWord && frozenWord.validation?.status === 'verified')

    glyphs.forEach((g) => {
      g.validation = {
        status: isVerified ? 'verified' : 'needs-review',
        notes: isVerified
          ? 'Contextual fixture with verified letter engines applied'
          : 'Contextual candidate shaped via HarfBuzz; requires human review'
      }
      g.animation = {
        capability: 'animated',
        notes: 'Candidate sequence'
      }
      auditReport.stats.totalStrokes += g.strokes?.length ?? 0
    })

    candidateDataset.contextual!.push({
      id: `contextual_${word}`,
      word,
      glyphCount: item.glyphCount,
      glyphs,
      validation: {
        status: isVerified ? 'verified' : 'needs-review',
        notes: isVerified
          ? 'Contextual fixture with verified letter engines applied'
          : 'Contextual candidate shaped via HarfBuzz; requires human review'
      },
      animation: {
        capability: 'animated',
        notes: 'Candidate sequence'
      },
      source: defaultSource,
      cleanup: {
        removedSegments: wordCleanup.flatMap((c) => c.removed)
      }
    })
    auditReport.stats.totalEntries++
    if (isVerified) {
      auditReport.stats.verifiedCount++
    } else {
      auditReport.stats.needsReviewCount++
    }
    auditReport.stats.animatedCount++
  }

  // Convert Diacritics
  for (const [word, item] of Object.entries(rawData.fixtures.diacritics)) {
    if (!item) continue

    // 1. Check if frozen verified
    const frozenWord = verifiedDiacriticsMap.get(word)
    if (frozenWord) {
      candidateDataset.diacritics!.push(JSON.parse(JSON.stringify(frozenWord)))
      auditReport.stats.totalEntries++
      auditReport.stats.verifiedCount++
      auditReport.stats.animatedCount++
      auditReport.stats.totalStrokes += frozenWord.glyphs.reduce(
        (sum, g) => sum + (g.strokes?.length ?? 0),
        0
      )
      continue
    }

    // 2. New diacritic candidate
    const wordCleanup: WordCleanupItem[] = []
    const glyphs = convertGlyphs(item.glyphs, wordCleanup, defaultSource)

    if (wordCleanup.length > 0) {
      auditReport.cleanupLog.diacritics.push(...wordCleanup)
    }

    glyphs.forEach((g) => {
      g.validation = {
        status: 'needs-review',
        notes: 'Diacritic candidate shaped via HarfBuzz; requires human review'
      }
      g.animation = {
        capability: 'animated',
        notes: 'Candidate sequence'
      }
      auditReport.stats.totalStrokes += g.strokes?.length ?? 0
    })

    candidateDataset.diacritics!.push({
      id: `diacritic_${word}`,
      word,
      glyphCount: item.glyphCount,
      glyphs,
      validation: {
        status: 'needs-review',
        notes: 'Diacritic candidate; requires human review'
      },
      animation: {
        capability: 'animated',
        notes: 'Candidate sequence'
      },
      source: defaultSource,
      cleanup: {
        removedSegments: wordCleanup.flatMap((c) => c.removed)
      }
    })
    auditReport.stats.totalEntries++
    auditReport.stats.needsReviewCount++
    auditReport.stats.animatedCount++
  }

  // Convert Special Cases
  for (const [word, item] of Object.entries(rawData.fixtures.special)) {
    if (!item) continue

    // 1. Check if frozen verified
    const frozenWord = verifiedSpecialMap.get(word)
    if (frozenWord) {
      candidateDataset.special!.push(JSON.parse(JSON.stringify(frozenWord)))
      auditReport.stats.totalEntries++
      auditReport.stats.verifiedCount++
      auditReport.stats.animatedCount++
      auditReport.stats.totalStrokes += frozenWord.glyphs.reduce(
        (sum, g) => sum + (g.strokes?.length ?? 0),
        0
      )
      continue
    }

    // 2. New special candidate
    const wordCleanup: WordCleanupItem[] = []
    const glyphs = convertGlyphs(item.glyphs, wordCleanup, defaultSource)
    if (wordCleanup.length > 0) {
      auditReport.cleanupLog.special.push(...wordCleanup)
    }
    glyphs.forEach((g) => {
      g.validation = {
        status: 'needs-review',
        notes: 'Special candidate shaped via HarfBuzz; requires human review'
      }
      g.animation = {
        capability: 'animated',
        notes: 'Candidate sequence'
      }
      auditReport.stats.totalStrokes += g.strokes?.length ?? 0
    })

    candidateDataset.special!.push({
      id: `special_${word}`,
      word,
      glyphCount: item.glyphCount,
      glyphs,
      validation: {
        status: 'needs-review',
        notes: 'Special candidate; requires human review'
      },
      animation: {
        capability: 'animated',
        notes: 'Candidate sequence'
      },
      source: defaultSource,
      cleanup: {
        removedSegments: wordCleanup.flatMap((c) => c.removed)
      }
    })
    auditReport.stats.totalEntries++
    auditReport.stats.needsReviewCount++
    auditReport.stats.animatedCount++
  }

  // Convert Extended Fixtures
  for (const [word, item] of Object.entries(rawData.fixtures.extended)) {
    if (!item) continue

    const wordCleanup: WordCleanupItem[] = []
    const glyphs = convertGlyphs(item.glyphs, wordCleanup, defaultSource)
    if (wordCleanup.length > 0) {
      auditReport.cleanupLog.extended.push(...wordCleanup)
    }

    const frozenWord = verifiedExtendedMap.get(word)
    const isVerified = Boolean(frozenWord && frozenWord.validation?.status === 'verified')

    glyphs.forEach((g) => {
      g.validation = {
        status: isVerified ? 'verified' : 'needs-review',
        notes: isVerified
          ? 'Extended fixture with verified letter engines applied'
          : 'Extended candidate; requires human review'
      }
      g.animation = {
        capability: 'animated',
        notes: 'Candidate sequence'
      }
      auditReport.stats.totalStrokes += g.strokes?.length ?? 0
    })

    candidateDataset.extended!.push({
      id: `extended_${word}`,
      word,
      glyphCount: item.glyphCount,
      glyphs,
      validation: {
        status: isVerified ? 'verified' : 'needs-review',
        notes: isVerified
          ? 'Extended fixture with verified letter engines applied'
          : 'Extended candidate; requires human review'
      },
      animation: {
        capability: 'animated',
        notes: 'Candidate sequence'
      },
      source: defaultSource,
      cleanup: {
        removedSegments: wordCleanup.flatMap((c) => c.removed)
      }
    })
    auditReport.stats.totalEntries++
    if (isVerified) {
      auditReport.stats.verifiedCount++
    } else {
      auditReport.stats.needsReviewCount++
    }
    auditReport.stats.animatedCount++
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(candidateDataset, null, 2))
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2))

  // Sync candidate files to renderer assets directory
  const rendererCandidatePath = path.resolve(
    'src/renderer/src/assets/candidates/arabic-strokes.candidates.json'
  )
  const rendererReportPath = path.resolve(
    'src/renderer/src/assets/candidates/conversion-report.json'
  )
  fs.mkdirSync(path.dirname(rendererCandidatePath), { recursive: true })
  fs.writeFileSync(rendererCandidatePath, JSON.stringify(candidateDataset, null, 2))
  fs.writeFileSync(rendererReportPath, JSON.stringify(auditReport, null, 2))

  console.log(`Saved Candidate Dataset to: ${outPath} & ${rendererCandidatePath}`)
  console.log(`Saved Conversion Audit Report to: ${reportPath} & ${rendererReportPath}`)
}

const rawPath = path.resolve('data/tegaki/raw/fixture_experiment.json')
const outPath = path.resolve('data/tegaki/candidates/arabic-strokes.candidates.json')
const reportPath = path.resolve('data/tegaki/candidates/conversion-report.json')

convertRawTegakiToCandidates(rawPath, outPath, reportPath)
