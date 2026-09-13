import {
  buildTimeline,
  AnimationEngine,
  type AnimationTimeline,
  type SpeedLevel
} from '../animation/animation-engine'
import {
  normalizeGlyphStrokes,
  normalizeLetterStrokes,
  normalizeWordStrokes,
  type StrokeItem
} from '../data/stroke-normalizer'
import type { TrustedStrokeDefinition } from '../data/stroke-registry'
import {
  classifySemanticRole,
  type ComposedGlyph,
  type CompositionResult,
  type SemanticRole
} from './glyph-composer'

interface CandidateLetterFixture {
  id: string
  char?: string
  unicode?: number
  advanceWidth?: number
  boundingBox?: { x1: number; y1: number; x2: number; y2: number }
  outlinePath?: string
  strokes?: StrokeItem[]
}

interface CandidateGlyphFixture {
  glyphId: number
  cluster?: number
  xAdvance?: number
  yAdvance?: number
  xOffset?: number
  yOffset?: number
  xPosition?: number
  yPosition?: number
  char?: string
  outlinePath?: string | null
  strokes?: StrokeItem[]
}

interface CandidateWordFixture {
  id: string
  word?: string
  glyphs?: CandidateGlyphFixture[]
}

export type CandidateFixture = CandidateLetterFixture | CandidateWordFixture

export interface CandidateFixtureSetup {
  glyphs: ComposedGlyph[]
  timeline: AnimationTimeline
  engine: AnimationEngine
  sourceText: string
}

function isWordFixture(fixture: CandidateFixture): fixture is CandidateWordFixture {
  return Array.isArray((fixture as CandidateWordFixture).glyphs)
}

function pathNumberPrecision(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}

export function translatePathData(d: string, dx: number, dy: number): string {
  if (!d || (!dx && !dy)) return d

  const paramKinds: Record<string, string> = {
    M: 'xy',
    L: 'xy',
    T: 'xy',
    H: 'x',
    V: 'y',
    C: 'xyxyxy',
    S: 'xyxy',
    Q: 'xyxy',
    A: 'rrxflagxy',
    Z: ''
  }

  return d.replace(/([A-Za-z])([^A-Za-z]*)/g, (segment, rawCommand: string, rawParams: string) => {
    const command = rawCommand.toUpperCase()
    const kinds = paramKinds[command]
    if (kinds === undefined || command !== rawCommand || !rawParams.trim()) {
      return segment
    }

    let index = 0
    const translated = rawParams.replace(/-?(?:\d*\.\d+|\d+)/g, (rawValue) => {
      const kind = kinds[index % kinds.length]
      index++

      if (kind === 'x') return pathNumberPrecision(Number(rawValue) + dx)
      if (kind === 'y') return pathNumberPrecision(Number(rawValue) + dy)
      return rawValue
    })

    return `${rawCommand}${translated}`
  })
}

function offsetPoint(
  point: StrokeItem['startPoint'],
  dx: number,
  dy: number
): StrokeItem['startPoint'] {
  if (!point) return point
  return {
    ...point,
    x: point.x + dx,
    y: point.y + dy
  }
}

function offsetStroke(stroke: StrokeItem, dx: number, dy: number): StrokeItem {
  if (!dx && !dy) return stroke

  return {
    ...stroke,
    startPoint: offsetPoint(stroke.startPoint, dx, dy),
    endPoint: offsetPoint(stroke.endPoint, dx, dy),
    medianPath: translatePathData(stroke.medianPath, dx, dy),
    outlinePath: stroke.outlinePath
      ? translatePathData(stroke.outlinePath, dx, dy)
      : stroke.outlinePath,
    outlinePaths: stroke.outlinePaths?.map((path) => translatePathData(path, dx, dy)),
    points: (stroke.points || []).map((p) => [p[0] + dx, p[1] + dy] as [number, number]),
    pointsWithWidth: (stroke.pointsWithWidth || []).map((p) => ({
      ...p,
      x: p.x + dx,
      y: p.y + dy
    }))
  }
}

function buildDefinition(params: {
  id: string
  char?: string
  glyphId?: number
  unicode?: number
  glyphName?: string
  isIsolatedLetter: boolean
  isDotOrMark?: boolean
  advanceWidth?: number
  boundingBox?: { x1: number; y1: number; x2: number; y2: number }
  outlinePath?: string
  outlinePaths?: string[]
  strokes: StrokeItem[]
  provenance?: TrustedStrokeDefinition['provenance']
}): TrustedStrokeDefinition {
  return {
    id: params.id,
    glyphId: params.glyphId,
    char: params.char,
    unicode: params.unicode,
    glyphName: params.glyphName,
    isIsolatedLetter: params.isIsolatedLetter,
    isDotOrMark: params.isDotOrMark ?? false,
    advanceWidth: params.advanceWidth,
    boundingBox: params.boundingBox,
    outlinePath: params.outlinePath,
    outlinePaths: params.outlinePaths,
    strokes: params.strokes,
    sourceCategory: params.isIsolatedLetter ? 'letters' : 'contextual',
    provenance: params.provenance ?? 'verified_fixture'
  }
}

function buildSyntheticGlyph(params: {
  sourceText: string
  glyphId: number
  glyphName: string
  definition: TrustedStrokeDefinition
  semanticRole?: SemanticRole
}): ComposedGlyph {
  const clusterEnd = params.sourceText.length || 1

  return {
    cluster: 0,
    clusterStart: 0,
    clusterEnd,
    sourceSpan: params.sourceText,
    baseChar: Array.from(params.sourceText)[0] || params.sourceText,
    glyphId: params.glyphId,
    glyphName: params.glyphName,
    glyphX: 0,
    glyphY: 0,
    isSupported: params.definition.strokes.length > 0,
    definition: params.definition,
    semanticRole: params.semanticRole ?? 'base',
    orderedStrokes: params.definition.strokes,
    hb: {
      glyphId: params.glyphId,
      glyphName: params.glyphName,
      cluster: 0,
      xAdvance: params.definition.advanceWidth ?? 0,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0
    },
    resolved: {
      glyphId: params.glyphId,
      form: {
        strokes: params.definition.strokes,
        dots: [],
        renderSpace: {
          outlineTransform: {
            translate: { x: 0, y: 0 }
          }
        }
      },
      isDot: params.definition.isDotOrMark
    },
    cursorX: 0,
    cursorY: 0
  }
}

function composeLetterFixture(fixture: CandidateLetterFixture): CompositionResult {
  const sourceText = fixture.char || fixture.id
  const strokes = normalizeLetterStrokes(fixture.strokes || [], {
    char: fixture.char,
    id: fixture.id
  })
  const glyphId = fixture.unicode ?? 0
  const glyphName = `fixture_${fixture.id}`
  const definition = buildDefinition({
    id: fixture.id,
    char: fixture.char,
    unicode: fixture.unicode,
    glyphId,
    glyphName,
    isIsolatedLetter: true,
    advanceWidth: fixture.advanceWidth,
    boundingBox: fixture.boundingBox,
    outlinePath: fixture.outlinePath,
    strokes
  })

  const glyph = buildSyntheticGlyph({
    sourceText,
    glyphId,
    glyphName,
    definition
  })

  return {
    glyphs: [glyph],
    unsupportedCount: glyph.isSupported ? 0 : 1,
    supportedCount: glyph.isSupported ? 1 : 0,
    isFullySupported: glyph.isSupported,
    sourceText,
    clusterSpans: [
      {
        cluster: 0,
        clusterStart: 0,
        clusterEnd: sourceText.length || 1,
        sourceSpan: sourceText,
        baseChar: Array.from(sourceText)[0] || sourceText
      }
    ],
    skippedGlyphs: []
  }
}

function composeWordFixture(fixture: CandidateWordFixture): CompositionResult {
  const sourceText = fixture.word || fixture.id
  const strokes: StrokeItem[] = []
  const outlines: string[] = []
  let cursorX = 0
  let firstGlyphId = 0
  let firstGlyphName = `fixture_${fixture.id}`

  for (let index = 0; index < (fixture.glyphs || []).length; index++) {
    const glyph = fixture.glyphs![index]
    if (index === 0) {
      firstGlyphId = glyph.glyphId ?? 0
      firstGlyphName = glyph.char || firstGlyphName
    }

    const glyphX = glyph.xPosition !== undefined ? glyph.xPosition : cursorX + (glyph.xOffset || 0)
    const glyphY = glyph.yPosition !== undefined ? glyph.yPosition : -(glyph.yOffset || 0)
    cursorX += glyph.xAdvance || 0

    const translatedGlyphOutline = glyph.outlinePath
      ? translatePathData(glyph.outlinePath, glyphX, glyphY)
      : undefined

    if (translatedGlyphOutline) {
      outlines.push(translatedGlyphOutline)
    }

    const glyphStrokes = normalizeGlyphStrokes(glyph.strokes || [], {
      char: glyph.char,
      id: fixture.id
    })

    for (const stroke of glyphStrokes) {
      const positionedStroke = offsetStroke(stroke, glyphX, glyphY)

      // Candidate word strokes often carry only the median path. A synthetic
      // word glyph must still reveal the outline belonging to the component
      // that owns the stroke; using the concatenated word outline here makes
      // every animation mask paint all ligature components at once.
      strokes.push({
        ...positionedStroke,
        sourceGlyphId: glyph.glyphId,
        outlinePath: positionedStroke.outlinePath || translatedGlyphOutline
      })
    }
  }

  const normalizedStrokes = normalizeWordStrokes(strokes, {
    id: fixture.id,
    word: fixture.word
  })
  const semanticRole = classifySemanticRole({
    glyphId: firstGlyphId,
    glyphName: firstGlyphName
  })
  const definition = buildDefinition({
    id: fixture.id,
    char: sourceText,
    glyphId: firstGlyphId,
    glyphName: firstGlyphName,
    isIsolatedLetter: false,
    isDotOrMark: semanticRole === 'dot',
    advanceWidth: cursorX,
    outlinePath: outlines.join(' '),
    outlinePaths: outlines,
    strokes: normalizedStrokes
  })

  const glyph = buildSyntheticGlyph({
    sourceText,
    glyphId: firstGlyphId,
    glyphName: firstGlyphName,
    definition,
    semanticRole
  })

  return {
    glyphs: [glyph],
    unsupportedCount: glyph.isSupported ? 0 : 1,
    supportedCount: glyph.isSupported ? 1 : 0,
    isFullySupported: glyph.isSupported,
    sourceText,
    clusterSpans: [
      {
        cluster: 0,
        clusterStart: 0,
        clusterEnd: sourceText.length || 1,
        sourceSpan: sourceText,
        baseChar: Array.from(sourceText)[0] || sourceText
      }
    ],
    skippedGlyphs: []
  }
}

export function composeCandidateFixture(
  fixture: CandidateFixture | null | undefined
): CompositionResult {
  if (!fixture) {
    return {
      glyphs: [],
      unsupportedCount: 0,
      supportedCount: 0,
      isFullySupported: true,
      sourceText: '',
      clusterSpans: [],
      skippedGlyphs: []
    }
  }

  return isWordFixture(fixture) ? composeWordFixture(fixture) : composeLetterFixture(fixture)
}

export function setupCandidateFixture(
  fixture: CandidateFixture | null | undefined,
  options?: { speed?: SpeedLevel | number }
): CandidateFixtureSetup {
  const composition = composeCandidateFixture(fixture)
  const timeline = buildTimeline(composition.glyphs)

  return {
    glyphs: composition.glyphs,
    timeline,
    engine: new AnimationEngine(timeline, options?.speed ?? 'medium'),
    sourceText: composition.sourceText
  }
}
