export type CanonicalLetterState = {
  isolated: string
  initial: string
  medial: string
  final: string
  isolatedDirection?: string
  initialDirection: string
  dotPaths?: string[]
  dotDirections?: string[]
  preserveAdditionalStrokes?: boolean
  additionalStrokePaths?: string[]
  additionalStrokeDirections?: string[]
}

export type CanonicalStrokePath = {
  medianPath: string
  direction: string
}

export type CanonicalMultiStrokeLetterState = {
  isolated: CanonicalStrokePath[]
  initial: CanonicalStrokePath[]
  medial: CanonicalStrokePath[]
  final: CanonicalStrokePath[]
}

export type CanonicalEditorState = 'isolated' | 'left-connected' | 'right-connected' | 'both-connected'

export type CanonicalPathMetrics = {
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
  points: [number, number][]
  length: number
}

const CANONICAL_PATH_TOKEN = /([MLC])|(-?\d+(?:\.\d+)?)/g

export const CANONICAL_HAMZA_PATH =
  'M 298.8 -305.4 C 19.7 -406.6, 15.8 38.8, 357.7 -87.9 L 26.6 22.6'

export type CanonicalSpecialCasePath = {
  brushSize: number
  /** Optional shaped context used to obtain the authentic editor shadow. */
  shadowSourceText?: string
  /** Glyph IDs that make up the contextual shadow, in drawing order. */
  shadowGlyphIds?: number[]
  strokes: Array<CanonicalStrokePath & { sourceStrokeIndex?: number }>
  outlineStrokeIndexes?: number[][]
}

// Source-of-truth movements for composite entries shown in the glyph editor.
// The protected TrueType outlines remain supplied by the shaped composite.
export const CANONICAL_SPECIAL_CASE_PATHS: Record<string, CanonicalSpecialCasePath> = {
  'ؤ': {
    brushSize: 80,
    strokes: [
      {
        direction: 'right_to_left',
        medianPath:
          'M 343.8 -42.4 C -195.5 71.5, 326.9 -667.3, 355.5 -45.8 C 339.5 43.3, 277.8 174.5, 31.3 188.9'
      },
      {
        direction: 'right_to_left',
        medianPath:
          'M 281.6 -608.3 C 84.5 -666.9, 144.1 -432.2, 324.3 -477.1 L 131.2 -421.8'
      }
    ]
  },
  'ئ': {
    brushSize: 90,
    strokes: [
      {
        direction: 'right_to_left',
        medianPath:
          'M 730.1 -346.2 C 517.5 -477.4, 288 -152.9, 525.3 -101.1 C 524 -73.5, 827.4 -70, 537 144 C 218 264.9, -33.5 133.7, 105.2 -163.2'
      },
      {
        direction: 'right_to_left',
        medianPath:
          'M 267 -413.1 C 78 -470.2, 137.6 -235.4, 298.2 -297.8 L 122.8 -239.3'
      }
    ]
  },
  'لا': {
    brushSize: 80,
    // A right-connected lam-alif is the contextual ligature in للا:
    // medial lam-alif (GID 71) followed by final alif (GID 10). It is a
    // different TrueType outline from the standalone initial ligature (GID 73).
    shadowSourceText: 'للا',
    shadowGlyphIds: [71, 10],
    strokes: [
      {
        direction: 'right_to_left',
        medianPath:
          'M 50.8 -708.7 C 85.8 -508.5, 70.2 -370.4, -12.7 -256.4 C -122.9 -101.1, -122.9 -125.2, -339.4 -45.8 C -506.7 -104.5, -452.2 -7.9, 68.9 -49.3 C 218 -163.2, -1.1 -339.3, -301.8 -556.8'
      }
    ]
  },
  'لأ': {
    brushSize: 80,
    strokes: [
      {
        direction: 'right_to_left',
        medianPath:
          'M 50.8 -708.7 C 85.8 -508.5, 70.2 -370.4, -12.7 -256.4 C -122.9 -101.1, -122.9 -125.2, -339.4 -45.8 C -506.7 -104.5, -452.2 -7.9, 68.9 -49.3 C 218 -163.2, -1.1 -339.3, -301.8 -556.8'
      }
    ]
  },
  'لإ': {
    brushSize: 80,
    strokes: [
      {
        direction: 'right_to_left',
        medianPath:
          'M 50.8 -708.7 C 85.8 -508.5, 70.2 -370.4, -12.7 -256.4 C -122.9 -101.1, -122.9 -125.2, -339.4 -45.8 C -506.7 -104.5, -452.2 -7.9, 68.9 -49.3 C 218 -163.2, -1.1 -339.3, -301.8 -556.8'
      }
    ]
  },
  'لآ': {
    brushSize: 80,
    strokes: [
      {
        direction: 'right_to_left',
        medianPath:
          'M 50.8 -708.7 C 85.8 -508.5, 70.2 -370.4, -12.7 -256.4 C -122.9 -101.1, -122.9 -125.2, -339.4 -45.8 C -506.7 -104.5, -452.2 -7.9, 68.9 -49.3 C 218 -163.2, -1.1 -339.3, -301.8 -556.8'
      }
    ]
  },
  // This composite is three educational movements: the initial lam, the
  // right-connected lam-alif body, then its diagonal alif stroke.
  'للا': {
    brushSize: 92,
    strokes: [
      {
        direction: 'right_to_left',
        medianPath: 'M 136 -719.7 C 136 -239.8, 251.1 -29.2, 4.1 -32.6',
        sourceStrokeIndex: 0
      },
      {
        direction: 'right_to_left',
        medianPath:
          'M 46.9 -28.9 C -206.7 -53.6, -136.6 27.3, -184 -714.9 C -126.7 -104.3, -260.9 -3, -543.1 -41.3',
        sourceStrokeIndex: 1
      },
      {
        direction: 'left_to_right',
        medianPath:
          'M -530.7 -533.9 C -291.3 -293.3, -484.2 -501.2, -211.4 -165'
      }
    ],
    outlineStrokeIndexes: [[0], [1, 2, 3], [6]]
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function cubicPoint(
  start: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const inverse = 1 - t
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * t * c1.x +
      3 * inverse * t ** 2 * c2.x +
      t ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * t * c1.y +
      3 * inverse * t ** 2 * c2.y +
      t ** 3 * end.y
  }
}

/** Derive runtime geometry metadata from the canonical median path. */
export function measureCanonicalPath(medianPath: string): CanonicalPathMetrics {
  const tokens = [...String(medianPath || '').matchAll(CANONICAL_PATH_TOKEN)].map((match) => match[0])
  const points: [number, number][] = []
  let cursor = 0
  let command = ''
  let current: { x: number; y: number } | null = null
  let startPoint: { x: number; y: number } | null = null
  let length = 0

  while (cursor < tokens.length) {
    if (/^[MLC]$/.test(tokens[cursor])) command = tokens[cursor++]
    if (!command) break

    if (command === 'M' || command === 'L') {
      if (cursor + 1 >= tokens.length) break
      const next = { x: Number(tokens[cursor]), y: Number(tokens[cursor + 1]) }
      cursor += 2
      if (command === 'M') {
        current = next
        if (!startPoint) startPoint = next
        points.push([next.x, next.y])
        command = 'L'
        continue
      }
      if (current) length += distance(current, next)
      current = next
      points.push([next.x, next.y])
      continue
    }

    if (command === 'C') {
      if (cursor + 5 >= tokens.length || !current) break
      const c1 = { x: Number(tokens[cursor]), y: Number(tokens[cursor + 1]) }
      const c2 = { x: Number(tokens[cursor + 2]), y: Number(tokens[cursor + 3]) }
      const end = { x: Number(tokens[cursor + 4]), y: Number(tokens[cursor + 5]) }
      cursor += 6
      let previous = current
      for (let step = 1; step <= 16; step++) {
        const sample = cubicPoint(current, c1, c2, end, step / 16)
        length += distance(previous, sample)
        previous = sample
      }
      current = end
      points.push([end.x, end.y])
      continue
    }

    break
  }

  const fallback = { x: 0, y: 0 }
  const start = startPoint || current || fallback
  const end = current || start
  return {
    startPoint: start,
    endPoint: end,
    points: points.length > 0 ? points : [[start.x, start.y]],
    length: Math.max(1, Math.round(length))
  }
}

export const CANONICAL_EDITOR_BRUSH_SIZES: Record<
  string,
  Record<CanonicalEditorState, number>
> = {
  ب: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ت: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ث: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ج: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ح: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  خ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  د: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ذ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ر: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ز: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  س: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ش: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ص: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ض: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ط: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ظ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ن: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ي: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ى: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ئ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ؤ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ك: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ف: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ق: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ع: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  غ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ا: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  أ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  إ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  آ: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  ه: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  },
  م: {
    isolated: 80,
    'left-connected': 80,
    'right-connected': 80,
    'both-connected': 80
  }
}

export type CanonicalMarkStroke = {
  order: number
  type: string
  direction: string
  medianPath: string
  isCandidateDot: boolean
}

export type CanonicalMarkPath = {
  glyphId: number
  glyphName: string
  brushSize: number
  strokes: CanonicalMarkStroke[]
}

export const CANONICAL_MARK_PATHS: Record<string, CanonicalMarkPath> = {
  // Reusable maddah-above movement used by alif-maddah and other bases.
  '\u0653': {
    glyphId: 300,
    glyphName: 'uni0653',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath:
          'M 311.9 -668.7 C 201.5 -552, 114.9 -767.6, 19.1 -630.3',
        isCandidateDot: false
      }
    ]
  },
  'َ': {
    glyphId: 369,
    glyphName: 'uni064E',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath: 'M 279.5 -702.6 L 23 -624.4',
        isCandidateDot: false
      }
    ]
  },
  'ِ': {
    glyphId: 425,
    glyphName: 'uni0650',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath: 'M 279.1 70.7 L 24.5 147.5',
        isCandidateDot: false
      }
    ]
  },
  'ُ': {
    glyphId: 370,
    glyphName: 'uni064F',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath:
          'M 177.5 -689.6 C 62.8 -713.3, 126.6 -834.3, 182.8 -804.8 C 229.7 -815.1, 325.6 -635, 20.2 -604',
        isCandidateDot: false
      }
    ]
  },
  'ْ': {
    glyphId: 377,
    glyphName: 'uni0652',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'left_to_right',
        medianPath:
          'M 120.7 -641.2 C 48.1 -623.5, 11.3 -766.7, 120.7 -781.4 C 204.4 -777, 202.5 -639.7, 120.7 -639.7',
        isCandidateDot: false
      }
    ]
  },
  'ّ': {
    glyphId: 366,
    glyphName: 'uni0651',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath:
          'M 250.8 -793 C 323.4 -655.8, 176.3 -567.2, 159.8 -769.4 C 161.7 -530.3, 18 -605.6, 56.7 -748.8',
        isCandidateDot: false
      }
    ]
  },
  'ً': {
    glyphId: 373,
    glyphName: 'uni064B',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath: 'M 281 -807.4 L 27.9 -730.6',
        isCandidateDot: false
      },
      {
        order: 1,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath: 'M 282 -701.1 L 28.9 -624.3',
        isCandidateDot: false
      }
    ]
  },
  'ٍ': {
    glyphId: 426,
    glyphName: 'uni064D',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath: 'M 282 69.3 L 24.9 147.5',
        isCandidateDot: false
      },
      {
        order: 1,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath: 'M 279.6 171.2 L 22.5 249.4',
        isCandidateDot: false
      }
    ]
  },
  'ٌ': {
    glyphId: 374,
    glyphName: 'uni064C',
    brushSize: 80,
    strokes: [
      {
        order: 0,
        type: 'stroke',
        direction: 'right_to_left',
        medianPath:
          'M 230.5 -705 C 90.6 -762.5, 230 -820.1, 231.4 -820.1 C 289.5 -836.4, 359.2 -676.9, 195.1 -653.3 C -78.8 -449.6, 241.6 -799.4, 18.5 -706.4',
        isCandidateDot: false
      }
    ]
  },
  'ـ': {
    glyphId: 109,
    glyphName: 'uni0640',
    brushSize: 90,
    strokes: [
      {
        order: 0,
        type: 'main_body',
        direction: 'right_to_left',
        medianPath: 'M 319.6 -35.3 L -0.2 -35.3',
        isCandidateDot: false
      }
    ]
  }
}

export const CANONICAL_DOT_OUTLINE =
  'M 76 49 Q 55 49 40.5 34.5 Q 26 20 26 -0 Q 26 -20 40.5 -35 Q 55 -50 76 -50 Q 96 -50 110.5 -35 Q 125 -20 125 -0 Q 125 20 110.5 34.5 Q 96 49 76 49 Z'

export function canonicalDotOutlineAt(center: { x: number; y: number }): string {
  const offsetX = center.x - 76
  const offsetY = center.y
  let coordinateIndex = 0
  return CANONICAL_DOT_OUTLINE.replace(/-?\d+(?:\.\d+)?/g, (token) => {
    const value = Number(token) + (coordinateIndex++ % 2 === 0 ? offsetX : offsetY)
    return String(Number(value.toFixed(3)))
  })
}

const BAA_PATHS: CanonicalLetterState = {
  isolated:
    'M 851.8 -387.7 C 910.3 -186.5, 1027.2 -11.1, 428.5 -22.8 C 70.7 -34.5, 42.7 -60.3, 91.8 -331.5',
  initial: 'M 123.3 -385.3 C 233.3 -64.9, 156.1 -32.2, 8.7 -39.2',
  medial:
    'M 391.8 -38.8 C 136.5 5.6, 189.7 -167.6, 192 -278.6 C 165.3 -16.6, 105.4 -54.4, 5.5 -41',
  final:
    'M 1142.2 -36.6 C 867.1 -16.1, 917.6 -154.2, 951.3 -226.7 C 716.2 80.9, -118.7 66.9, 92.1 -325.2',
  initialDirection: 'bottom_to_top',
  dotPaths: ['M 504.0 120.3 L 464.0 202.4'],
  dotDirections: ['bottom_to_top']
}

const TAA_PATHS: CanonicalLetterState = {
  isolated:
    'M 851.8 -387.7 C 910.3 -186.5, 1027.2 -11.1, 428.5 -22.8 C 70.7 -34.5, 42.7 -60.3, 91.8 -331.5',
  initial: 'M 144.5 -388.2 C 276.4 -49.9, 156.1 -32.2, 8.7 -39.2',
  medial:
    'M 422.3 -40 C 119.2 -2, 206.2 -229.8, 217.4 -278.2 C 178.1 -67.6, 141.6 -43.4, 5.5 -41',
  final:
    'M 1142.2 -36.6 C 923.2 -19.2, 889.5 -112.5, 948.5 -229.8 C 914.8 -22.7, -123.6 163.7, 95.3 -333.4',
  initialDirection: 'bottom_to_top',
  dotPaths: ['M 574.3 -491.8 L 534.3 -409.6', 'M 438.7 -491.8 L 398.7 -409.6'],
  dotDirections: ['bottom_to_top', 'bottom_to_top']
}

const THAA_PATHS: CanonicalLetterState = {
  ...TAA_PATHS,
  dotPaths: undefined,
  dotDirections: undefined
}

const NOON_PATHS: CanonicalLetterState = {
  isolated: 'M 519.7 -296.4 C 840.1 342.1, -123.4 332.7, 101.1 -163.1',
  initial: 'M 123.3 -385.3 C 240.3 -67.2, 156.1 -32.2, 8.7 -39.2',
  medial:
    'M 391.8 -38.8 C 136.5 5.6, 189.7 -167.6, 192 -278.6 C 163.1 -28.9, 105.4 -54.4, 5.5 -41',
  final:
    'M 781.7 -38.2 C 594.9 -9.2, 566.8 -188.7, 547.8 -272.1 C 816.6 380.9, -148.8 294.6, 109.4 -157.7',
  initialDirection: 'bottom_to_top',
  dotPaths: ['M 349.6 -488.5 L 309.6 -406.3'],
  dotDirections: ['bottom_to_top']
}

const FAA_PATHS: CanonicalLetterState = {
  isolated:
    'M 867.1 -212.2 C 342.3 -101.7, 896.5 -854.3, 904.9 -167.2 C 867.1 19.2, 687.5 -25.7, 331.1 -25.7 C 129 -53.3, 30.8 -43, 89.7 -329.5',
  initial:
    'M 329.7 -215.6 C -197.9 -77.5, 354.9 -871.6, 363.3 -184.5 C 369 -177.6, 326.9 5.3, 9.7 -36.1',
  medial:
    'M 537.3 -36.8 C 402.2 -39.5, 317.2 -45.5, 239.9 -74.8 C 187.2 -91.5, 127.2 -153.5, 127.2 -233.5 C 127.2 -308.5, 187.2 -375.5, 260.2 -375.5 C 332.2 -375.5, 377.2 -308.5, 377.2 -233.5 C 377.2 -158.5, 322.2 -98.5, 239.9 -74.8 C 172.2 -38.5, 42.2 -25.5, 12.6 -40.3',
  final:
    'M 1147.7 -36.8 C 1000 -39.5, 915 -45.5, 850 -68.5 C 785 -91.5, 725 -153.5, 725 -233.5 C 725 -308.5, 785 -375.5, 858 -375.5 C 930 -375.5, 975 -308.5, 975 -233.5 C 975 -158.5, 920 -98.5, 850 -68.5 C 770 -38.5, 640 -25.5, 500 -25.5 L 360 -25.5 C 240 -25.5, 130 -43.5, 95 -93.5 C 65 -138.5, 65 -213.5, 89.7 -333.7',
  isolatedDirection: 'right_to_left',
  initialDirection: 'right_to_left',
  dotPaths: ['M 782.9 -702.1 L 732.4 -608.9'],
  dotDirections: ['bottom_to_top']
}

export const CANONICAL_STATIC_LETTER_PATHS: Record<string, string[]> = {
  ء: [CANONICAL_HAMZA_PATH]
}

const TAH_ZAH_PATHS: CanonicalMultiStrokeLetterState = {
  isolated: [
    {
      medianPath:
        'M 154.3 15.7 C 409.7 -412.4, 681.9 -402, 698.7 -208.8 C 712.7 22.6, 171.1 -15.4, 14 -46.4',
      direction: 'right_to_left'
    },
    { medianPath: 'M 228.7 -715.9 L 242.9 -120', direction: 'top_to_bottom' }
  ],
  initial: [
    {
      medianPath:
        'M 57.5 12.3 C 276.4 -367.5, 587.9 -426.2, 592.1 -205.3 C 596.3 -8.5, 117.8 -29.3, 4.1 -36.1',
      direction: 'right_to_left'
    },
    { medianPath: 'M 110.8 -715.9 L 125 -120', direction: 'top_to_bottom' }
  ],
  medial: [
    {
      medianPath:
        'M 747.8 -29.9 C 742.2 -26.5, 568.2 -16.1, 534.5 -95.5 C 484 -81.7, 397 1.1, 82.7 -40.3 C 122 -116.2, 411.1 -458, 562.6 -275 C 590.7 -254.3, 719.8 25.3, 6.9 -36.8',
      direction: 'right_to_left'
    },
    { medianPath: 'M 116.4 -716.6 L 133.4 -120', direction: 'top_to_bottom' }
  ],
  final: [
    {
      medianPath:
        'M 879.7 -33.4 C 874.1 -30, 700.1 -19.6, 666.4 -99 C 615.9 -85.2, 528.9 -2.4, 188 -36.8 C 253.9 -119.7, 496.7 -468.4, 694.5 -278.5 C 722.6 -257.8, 851.7 21.8, 19.6 -43.7',
      direction: 'right_to_left'
    },
    { medianPath: 'M 228.7 -720.1 L 255.3 -115.9', direction: 'top_to_bottom' }
  ]
}

export const CANONICAL_MULTI_STROKE_LETTER_PATHS: Record<
  string,
  CanonicalMultiStrokeLetterState
> = {
  ط: TAH_ZAH_PATHS,
  ظ: TAH_ZAH_PATHS
}

CANONICAL_STATIC_LETTER_PATHS.ط = TAH_ZAH_PATHS.isolated.map((stroke) => stroke.medianPath)
CANONICAL_STATIC_LETTER_PATHS.ظ = TAH_ZAH_PATHS.isolated.map((stroke) => stroke.medianPath)

export const CANONICAL_STATIC_LETTER_DIRECTIONS: Record<string, string[]> = {
  ط: TAH_ZAH_PATHS.isolated.map((stroke) => stroke.direction),
  ظ: TAH_ZAH_PATHS.isolated.map((stroke) => stroke.direction)
}

const CANONICAL_KAF_FINAL_MARK =
  'M 520.6 -515.6 C 199.2 -340.6, 752 -382.1, 363.4 -229.1'

export const CANONICAL_KAF_PATHS = {
  isolated: [
    'M 766 -712.7 L 780.1 -181.1 C 780.1 -153.5, 777.3 -22.3, 429.3 -25.7 C 84.1 -32.6, 36.4 -84.4, 86.9 -329.5',
    CANONICAL_KAF_FINAL_MARK
  ],
  initial:
    'M 399.8 -674.8 L 88.3 -498.7 C -43.6 -429.7, 352.1 -322.6, 310 -125.8 C 307.2 -94.8, 296 -22.3, 6.9 -39.5',
  medial:
    'M 559.8 -29.9 C 276.4 -33.4, 397 -226.7, 60.3 -440.8 C 82.7 -554.7, 369 -620.3, 402.6 -682.4 C -548.7 -485.6, 927.4 -88.6, -1.5 -29.9',
  final: CANONICAL_KAF_FINAL_MARK,
  finalBody:
    'M 970.9 -36.8 C 830.6 -29.9, 802.5 -92.1, 777.3 -247.4 L 760.4 -710 L 780.1 -181.1 C 780.1 -153.5, 777.3 -22.3, 429.3 -25.7 C 84.1 -32.6, 36.4 -84.4, 86.9 -329.5',
  finalMark: CANONICAL_KAF_FINAL_MARK
} as const

const JHEEM_FAMILY_PATHS: CanonicalLetterState = {
  initial:
    'M 60.3 -298.5 C 335.3 -346.8, 349.3 -205.2, 549.4 -193.2 C 391.4 -201.8, 251.1 -18.8, 3.2 -37.7',
  isolated:
    'M 38.3 -357.2 C 227.2 -419.3, 323.4 -312.3, 568.5 -291.6 C -20.3 -291.6, -214.8 543.9, 584.5 305.7',
  medial:
    'M 688.9 -40.3 C 537.3 -26.5, 489.6 -67.9, 447.5 -130\nM 63.1 -302.3 C 296.8 -371.1, 427.9 -167.7, 559.8 -191.9 C 366.2 -188.4, 180.9 -8.9, 6.9 -40',
  final:
    'M 699.1 -33.1 C 533.1 -36.8, 429.3 -71.4, 440.5 -223.3\nM 36.4 -354.1 C 185.1 -419.7, 364.8 -292, 578 -295.4 C -258.3 -150.4, 8.3 550.4, 581.9 302.1',
  isolatedDirection: 'left_to_right',
  initialDirection: 'right_to_left'
}

const SEEN_FAMILY_PATHS: CanonicalLetterState = {
  initial:
    'M 635.6 -391.7 C 868.5 60.6, 332.5 77.8, 453.2 -284.7 C 461.6 91.7, 79.9 19.2, 189.4 -270.8 C 175.3 -177.6, 164.1 -49.9, 9.7 -39.5',
  isolated:
    'M 1060.7 -388.2 C 1310.5 81.3, 715.5 57.1, 867.1 -274.3 C 830.6 143.4, 538.7 -74.1, 538.7 -270.8 C 819.4 278.1, -84.3 395.5, 106.6 -167.3',
  medial:
    'M 907.8 -40.6 C 663.6 7.7, 677.7 -320.3, 686.1 -350.7 C 787 80.2, 332.5 31.9, 447.5 -278.2 C 492.4 52.6, 54.6 31.9, 200.6 -264.4 C 169.7 -182.2, 139.6 4.3, 6.9 -46.9',
  final:
    'M 1321.7 -40 C 1119.7 -9.5, 1114.1 -154.5, 1108.4 -350.7 C 1178.6 149.3, 743.6 -30.3, 869.9 -274.7 C 856.3 -2.6, 651.1 94, 538.7 -271.9 C 816.6 404.7, -143.2 263.2, 106.6 -164.2',
  initialDirection: 'right_to_left'
}

const SAD_FAMILY_PATHS: CanonicalLetterState = {
  isolated:
    'M 690.1 -1.5 C 825 -336.4, 1234.7 -433.1, 1217.9 -191.4 C 1198.2 22.6, 743.6 -15.4, 676.3 -67.2 C 569.6 -118.9, 592.1 -118.9, 547.2 -277.7 C 811 367.8, -132 295.3, 109.4 -160.4',
  initial:
    'M 293.2 8.8 C 420.9 -336.4, 830.6 -433.1, 813.8 -191.4 C 794.1 22.6, 339.5 -15.4, 234.3 -53.3 C 130.4 -118.9, 192.2 -153.5, 189.4 -270.8 C 180.9 -81, 96.7 -39.5, 6.9 -43',
  medial:
    'M 997.6 -36.8 C 910.6 -33.4, 860.1 -33.4, 806.8 -64.5 C 719.8 -126.6, 691.7 46, 307.2 -43.7 C 773.1 -754.9, 1210.9 115.1, 301.6 -33.4 C 127.6 -74.8, 169.7 -137, 186.5 -264.7 C 192.2 -268.1, 172.5 -9.2, 4.1 -36.8',
  final:
    'M 1401.7 -36.8 C 1314.7 -33.4, 1264.2 -33.4, 1210.9 -64.5 C 1123.9 -126.6, 1095.8 46, 711.3 -43.7 C 1177.2 -754.9, 1615 115.1, 705.7 -33.4 C 591.1 -106.2, 582.7 -95.8, 551.8 -268.5 C 801.6 339.2, -99.3 328.8, 102.8 -158',
  initialDirection: 'right_to_left'
}

const AIN_FAMILY_PATHS: CanonicalLetterState = {
  initial:
    'M 377.4 -388.2 C -96.9 -450.4, 150.1 84.8, 461.6 -122.4 C 329.7 -67.2, 178.1 -29.2, 6.9 -39.5',
  isolated:
    'M 328.3 -453.8 C -36.6 -533.2, -14.1 -22.3, 418.1 -226 C -92.7 -146.6, -89.9 523.2, 566.8 305.7',
  medial:
    'M 568.2 -36.5 C 262.3 -12.3, 161.3 -216, 79.9 -274.7 C 178.1 -409.4, 349.3 -381.7, 394.2 -312.7 C 411.1 -278.2, 413.9 -74.5, 1.3 -40',
  final:
    'M 579.4 -43.4 C 322.7 4.9, 230 -157.3, 95.3 -278.2 C 189.3 -416.3, 353.5 -374.8, 392.8 -319.6 C 454.6 -126.3, 112.2 -129.7, 53.2 163.7 C 53.2 136.1, -8.5 484.8, 541.6 298.4',
  isolatedDirection: 'left_to_right',
  initialDirection: 'right_to_left'
}

const YAA_PATHS: CanonicalLetterState = {
  isolated:
    'M 729.6 -353.7 C 569.6 -457.3, 232.9 -184.5, 558.4 -87.9 C 996.2 77.8, -92.7 505.9, 103.8 -156.9',
  initial: 'M 147.3 -388.2 C 175.3 -329.5, 315.6 -1.6, 9.7 -36.1',
  medial:
    'M 422.3 -40 C 200.6 -2, 178.1 -122.8, 223 -278.2 C 186.5 -60.7, 169.7 -46.9, 5.5 -41',
  final:
    'M 788.5 -43.4 C 687.5 -8.9, 656.6 -67.6, 488.2 -102.1 C 1114.1 108.5, -134.8 474.4, 103.8 -160.8',
  isolatedDirection: 'right_to_left',
  initialDirection: 'right_to_left',
  dotPaths: ['M 446.3 329.5 L 406.3 411.7', 'M 307.7 329.5 L 267.7 411.7'],
  dotDirections: ['bottom_to_top', 'bottom_to_top']
}

// Dotless Yaa keeps the verified Yaa body but intentionally owns no dot
// strokes. Hamza-Yaa uses that same body and replaces its legacy mark with
// the shared canonical Hamza movement.
const YAA_WITHOUT_DOTS_PATHS: CanonicalLetterState = {
  ...YAA_PATHS,
  dotPaths: undefined,
  dotDirections: undefined
}

const YAA_WITH_HAMZA_PATHS: CanonicalLetterState = {
  ...YAA_WITHOUT_DOTS_PATHS,
  preserveAdditionalStrokes: true,
  additionalStrokePaths: [CANONICAL_HAMZA_PATH],
  additionalStrokeDirections: ['right_to_left']
}

// These letters cannot connect on their left side. Their right-connected form
// is therefore represented as a short connection stroke followed by the body.
export type CanonicalRightJoiningLetterState = {
  isolated: string
  final: string
  isolatedDirection?: string
  finalDirection: string
}

const DAL_FAMILY_PATHS: CanonicalRightJoiningLetterState = {
  isolated: 'M 241.3 -443.5 C 448.9 -263.9, 485.4 95.1, 49 -77.5',
  final: 'M 579.4 -32.6 C 369 -22.3, 444.7 -184.5, 248.3 -446.9 C 646.8 95.1, 74.3 -43, 57.5 -74.1',
  finalDirection: 'right_to_left'
}

const RAA_FAMILY_PATHS: CanonicalRightJoiningLetterState = {
  isolated: 'M 188 -322.6 C 238.5 -274.3, 399.8 74.4, -7.1 188.3',
  final:
    'M 444.7 -32.6 C 259.5 -32.6, 293.2 -115.5, 192.2 -322.6 C 318.4 -101.7, 293.2 77.8, -9.9 191.8',
  finalDirection: 'right_to_left'
}

const LAM_PATHS: CanonicalLetterState = {
  initial: 'M 136 -719.7 C 136 -239.8, 251.1 -29.2, 4.1 -32.6',
  isolated: 'M 571 -712.8 L 592.1 -150 C 634.2 350.6, -103.9 274.6, 109.4 -160.4',
  medial:
    'M 352.1 -37.2 C 124.8 -47.5, 164.1 -95.8, 138.8 -713.8 C 141.6 -185.6, 237.1 -30.3, 1.3 -33.7',
  final:
    'M 784.3 -37.2 C 557 -47.5, 600.5 -106.2, 571 -713.8 C 558.4 -175.3, 669.3 -30.3, 496.7 135.5 C 328.3 263.2, -39.4 183.8, 109.4 -161.4',
  initialDirection: 'right_to_left'
}

const MEEM_PATHS: CanonicalLetterState = {
  initial:
    'M 161.3 -87.9 C 672 150.3, 335.3 -709.3, 110.8 -70.6 C 77.1 -105.1, 124.8 -32.6, 4.1 -43',
  isolated:
    'M 101 -222.5 C 129 -360.6, 463 -440, 392.8 -67.2 C 112.2 -150, -14.1 -98.2, 115 378.2',
  medial:
    'M 627.1 -33.7 C 377.4 -16.4, 475.6 -271.9, 304.4 -323.7 C -43.6 -199.4, 377.4 142.4, 461.6 -123.5 C 225.8 -672.4, 197.8 7.7, -1.5 -44.1',
  final:
    'M 615.9 -33.7 C 387.2 -2.6, 451.7 -251.2, 342.3 -313.3 C -103.9 -261.6, 406.8 159.6, 450.4 -123.5 C 241.3 -548.1, -81.5 -113.1, 115 370.2',
  initialDirection: 'right_to_left'
}

const HAA_PATHS: CanonicalLetterState = {
  initial:
    'M 161.3 -474.5 C 722.6 -98.2, 436.3 53.7, 217.4 -81 C 4.1 -250.1, 169.7 -374.4, 241 -378.4 C 414.5 -293.7, 377.4 -49.9, 4.1 -32.6',
  isolated:
    'M 259.5 -467.6 C 822.2 -94.8, 533.1 53.7, 325.5 -77.5 C 102.3 -243.2, 267.9 -367.5, 339.2 -371.5 C 561.2 -305.4, 376 64, 28 -53.3',
  medial:
    'M 559.8 -39.6 C 456 -29.3, 284.8 -77.6, 116.4 -60.4 C 251.1 -764.6, 613.1 -98.3, 124.8 -46.5 C 124.8 298.7, 593.5 202, 360.5 -53.4 L 1.3 -39.6',
  final:
    'M 530.7 -30.2 C 322.7 -36.2, 336.7 -56.9, 319.9 -516.1 L 308.6 -402.1 C -64.6 -346.9, 33.6 -67.3, 331.1 -143.2',
  initialDirection: 'right_to_left'
}

const ALIF_PATHS: CanonicalLetterState = {
  isolated: 'M 113.6 -712.7 L 136 -1.6',
  initial: 'M 113.6 -712.7 L 136 -1.6',
  medial: 'M 346.5 -30.3 C 60.3 -33.7, 158.5 -71.7, 110.8 -717.3',
  final: 'M 346.5 -30.3 C 60.3 -33.7, 158.5 -71.7, 110.8 -717.3',
  isolatedDirection: 'left_to_right',
  initialDirection: 'left_to_right'
}

const ALIF_VARIANT_PATHS: CanonicalLetterState = {
  ...ALIF_PATHS,
  preserveAdditionalStrokes: true,
  additionalStrokePaths: ['M 256 -791 C 129.4 -688.4, 62 -898.8, -43 -761'],
  additionalStrokeDirections: ['right_to_left']
}

const ALIF_HAMZA_ABOVE_PATHS: CanonicalLetterState = {
  isolated: 'M 111.5 -646.3 L 127.7 0',
  initial: 'M 111.5 -646.3 L 127.7 0',
  medial: ALIF_PATHS.final,
  final: ALIF_PATHS.final,
  isolatedDirection: 'left_to_right',
  initialDirection: 'left_to_right',
  additionalStrokePaths: ['M 162.5 -903 C 14.6 -956.6, -40.7 -773.1, 197.7 -781.4 L 18.3 -729.2'],
  additionalStrokeDirections: ['right_to_left']
}

const ALIF_HAMZA_BELOW_PATHS: CanonicalLetterState = {
  ...ALIF_PATHS,
  additionalStrokePaths: ['M 201.6 101.3 C 53.7 47.7, -1.6 231.2, 236.8 222.9 L 57.4 275.1'],
  additionalStrokeDirections: ['right_to_left']
}

// These letters share the same body movement. Their dot strokes remain owned
// by the individual verified definitions and canonical dot normalizer.
export const CANONICAL_LETTER_PATHS: Record<string, CanonicalLetterState> = {
  ب: BAA_PATHS,
  ت: TAA_PATHS,
  ث: THAA_PATHS,
  ن: NOON_PATHS,
  ج: JHEEM_FAMILY_PATHS,
  ح: JHEEM_FAMILY_PATHS,
  خ: JHEEM_FAMILY_PATHS,
  س: SEEN_FAMILY_PATHS,
  ش: SEEN_FAMILY_PATHS,
  ص: SAD_FAMILY_PATHS,
  ض: SAD_FAMILY_PATHS,
  ي: YAA_PATHS,
  ى: YAA_WITHOUT_DOTS_PATHS,
  ئ: YAA_WITH_HAMZA_PATHS,
  ف: FAA_PATHS,
  ع: AIN_FAMILY_PATHS,
  غ: AIN_FAMILY_PATHS,
  ا: ALIF_PATHS,
  أ: ALIF_HAMZA_ABOVE_PATHS,
  إ: ALIF_HAMZA_BELOW_PATHS,
  آ: ALIF_VARIANT_PATHS,
  ه: HAA_PATHS,
  ل: LAM_PATHS,
  م: MEEM_PATHS
}

export const CANONICAL_RIGHT_JOINING_PATHS: Record<string, CanonicalRightJoiningLetterState> = {
  د: DAL_FAMILY_PATHS,
  ذ: DAL_FAMILY_PATHS,
  ر: RAA_FAMILY_PATHS,
  ز: RAA_FAMILY_PATHS,
  و: {
    isolated: 'M 345.1 -53.3 C -199.3 95.1, 345.1 -685.1, 347.9 -25.7 C 339.5 43.3, 277.8 174.5, 53.2 188.3',
    final:
      'M 527.5 -37.2 L 182.3 -44.1 C 36.4 -64.8, 106.6 -296.1, 227.2 -296.1 C 347.9 -323.7, 513.5 132, 50.4 187.2',
    finalDirection: 'right_to_left'
  }
}

export const CANONICAL_CONTEXTUAL_GLYPHS = {
  shortAlif: 13,
  initial: 19,
  wideInitial: 21,
  medial: 16,
  wideMedial: 18,
  final: 15,
  noonFinal: 81,
  jeemInitial: 27,
  jeemMedial: 26,
  jeemFinal: 24,
  sadInitial: 41,
  sadMedial: 40,
  sadFinal: 39,
  tahInitial: 45,
  tahMedial: 44,
  tahFinal: 43,
  faaInitial: 53,
  faaMedial: 52,
  faaFinal: 51,
  ainInitial: 49,
  ainMedial: 48,
  ainFinal: 47,
  lamInitial: 72,
  lamMedial: 70,
  lamFinal: 69,
  meemInitial: 79,
  meemMedial: 78,
  meemFinal: 77,
  haaInitial: 85,
  haaMedial: 84,
  haaFinal: 83
} as const
