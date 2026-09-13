import { HbGlyph, shapeText } from '../shaping/harfbuzz'
import { strokeRegistry, TrustedStrokeDefinition, StrokeItem } from '../data/stroke-registry'

/**
 * Semantic roles used for calligraphic animation sequencing within an Arabic cluster.
 *
 * Order within each cluster:
 * 1. Base/body strokes
 * 2. Dots belonging to that letter
 * 3. Hamza marks
 * 4. Bottom-line tashkeel (e.g. kasra, kasratan)
 * 5. Top-line tashkeel level 1 (e.g. shadda)
 * 6. Top-line tashkeel level 2 (e.g. fatha, damma, sukun)
 */
export type SemanticRole =
  'base' | 'dot' | 'hamza' | 'tashkeel_bottom' | 'tashkeel_top_1' | 'tashkeel_top_2'

export const ROLE_ORDER: Record<SemanticRole, number> = {
  base: 1,
  dot: 2,
  hamza: 3,
  tashkeel_bottom: 4,
  tashkeel_top_1: 5,
  tashkeel_top_2: 6
}

/** Keep Allah educationally decomposed instead of receiving the single FDF2 ligature. */
export function normalizeEducationalText(text: string): string {
  // Preserve U+0671 so the canonical wasla glyph remains visible. The ZWNJ
  // still prevents the Allah ligature (U+FDF2) while retaining its exact base.
  return text.replace(/([اأإآٱ])ل(?=ل)/gu, '$1\u200Cل')
}

/**
 * Classifies a glyph into its calligraphic semantic role based on glyph name, GID,
 * and positioning.
 */
export function classifySemanticRole(glyph: {
  glyphId: number
  glyphName?: string
  yPosition?: number
  yOffset?: number
}): SemanticRole {
  const name = glyph.glyphName || ''
  const gid = glyph.glyphId

  // 1. Dots
  if (
    name.includes('dot') ||
    gid === 315 || // dotbelowar
    gid === 286 || // twodotshorizontalabovear
    gid === 317 || // twodotshorizontalbelowar
    gid === 291 || // threedotsupabovear
    gid === 326 || // threedotsdownbelowar
    gid === 281 || // dotabovear
    gid === 332 // dotcenterar
  ) {
    return 'dot'
  }

  // 2. Hamza marks
  if (
    name.includes('0654') || // hamza above mark
    name.includes('0655') || // hamza below mark
    name.includes('0621') || // isolated hamza
    name.includes('hamza') ||
    gid === 296 || // uni0654
    gid === 297 || // uni0655
    gid === 4 // uni0621
  ) {
    return 'hamza'
  }

  // 3. Tashkeel
  // Bottom-line tashkeel (kasra, kasratan)
  if (name.includes('0650') || name.includes('064D') || gid === 425 || gid === 426) {
    return 'tashkeel_bottom'
  }

  // Top-line tashkeel level 1: shadda
  if (name.includes('0651') || gid === 366) {
    return 'tashkeel_top_1'
  }

  // U+0671 is a base glyph in the pinned Noto Sans Arabic font. Its optional
  // zero-width wasla component is handled separately as a registered mark.
  if (gid === 580 || name === 'uni0671') {
    return 'base'
  }

  // Top-line tashkeel level 2: fatha, fathatan, damma, dammatan, sukun
  if (
    name.includes('064E') ||
    name.includes('064B') ||
    name.includes('064F') ||
    name.includes('064C') ||
    name.includes('0652') ||
    name.includes('0653') || // maddah above
    name.toLowerCase().includes('wasla') ||
    gid === 369 || // fatha
    gid === 370 || // damma
    gid === 377 || // sukun
    gid === 367 || // fathatan
    gid === 368 // dammatan
  ) {
    return 'tashkeel_top_2'
  }

  // Additional Quranic/extended marks used by common Arabic text, including
  // superscript alef in "اللّٰه". These are often absent from the verified
  // fixture inventory but must still be treated as marks in free text.
  if (
    name.includes('0670') ||
    name.toLowerCase().includes('alefsuperscript') ||
    name.toLowerCase().includes('maddah') ||
    name.match(/06(?:d[6-9a-f]|e[0-9a-f])/i)
  ) {
    return 'tashkeel_top_2'
  }

  // Positional fallback for marks below baseline
  if (glyph.yPosition !== undefined && glyph.yPosition > 100) {
    return 'tashkeel_bottom'
  }

  return 'base'
}

/**
 * Explicit cluster span representation.
 * HarfBuzz cluster values are offsets into the source JavaScript string.
 */
export interface ClusterSpan {
  cluster: number
  clusterStart: number
  clusterEnd: number
  sourceSpan: string
  baseChar: string
}

function getFirstCodePoint(str: string): string {
  if (!str) return ''
  const cp = str.codePointAt(0)
  return cp !== undefined ? String.fromCodePoint(cp) : ''
}

function normalizeArabicBaseChar(char: string): string {
  const aliases: Record<string, string> = {
    ٲ: 'أ',
    ٳ: 'إ',
    ٵ: 'آ'
  }
  return aliases[char] || char
}

/**
 * Builds explicit cluster spans from sorted HarfBuzz cluster offsets.
 *
 * clusterStart = current cluster offset
 * clusterEnd = next cluster offset, or sourceText.length
 * sourceSpan = sourceText.slice(clusterStart, clusterEnd)
 * baseChar = first Unicode code point represented by the source span.
 */
export function computeClusterSpans(
  hbGlyphs: HbGlyph[],
  sourceText: string
): Map<number, ClusterSpan> {
  const clusterSpans = new Map<number, ClusterSpan>()
  if (!hbGlyphs.length) return clusterSpans

  const uniqueClusters = Array.from(
    new Set(hbGlyphs.map((g) => g.cluster).filter((c): c is number => typeof c === 'number'))
  ).sort((a, b) => a - b)

  for (let i = 0; i < uniqueClusters.length; i++) {
    const cluster = uniqueClusters[i]
    const clusterStart = cluster
    const clusterEnd = i + 1 < uniqueClusters.length ? uniqueClusters[i + 1] : sourceText.length
    const sourceSpan = sourceText.slice(clusterStart, clusterEnd)
    const baseChar = getFirstCodePoint(sourceSpan)

    clusterSpans.set(cluster, {
      cluster,
      clusterStart,
      clusterEnd,
      sourceSpan,
      baseChar
    })
  }

  return clusterSpans
}

/**
 * Clean generic ComposedGlyph model.
 * Holds exact positioning in font space, source tracking, trusted geometry,
 * and calligraphic animation sequencing.
 */
export interface ComposedGlyph {
  cluster: number
  clusterStart: number
  clusterEnd: number
  sourceSpan: string
  baseChar: string
  glyphId: number
  glyphName: string
  glyphX: number
  glyphY: number
  isSupported: boolean
  definition: TrustedStrokeDefinition | null
  semanticRole: SemanticRole
  orderedStrokes: StrokeItem[]

  // Backward compatibility fields for legacy callers
  hb: HbGlyph
  resolved?: unknown
  cursorX: number
  cursorY: number
}

export interface CompositionResult {
  glyphs: ComposedGlyph[]
  unsupportedCount: number
  supportedCount: number
  isFullySupported: boolean
  sourceText: string
  clusterSpans: ClusterSpan[]
  skippedGlyphs: Array<{
    glyphId: number
    glyphName: string
    sourceSpan: string
    baseChar: string
    semanticRole: SemanticRole
  }>
}

function markAnchor(glyph: ComposedGlyph): { x: number; y: number } {
  const stroke = glyph.orderedStrokes[0]
  const start = stroke?.startPoint
  const end = stroke?.endPoint
  return {
    x: glyph.glyphX + (start && end ? (start.x + end.x) / 2 : start?.x || 0),
    y: glyph.glyphY + (start && end ? (start.y + end.y) / 2 : start?.y || 0)
  }
}

function markQuadrant(glyph: ComposedGlyph, centerX: number): number {
  const anchor = markAnchor(glyph)
  const isRight = anchor.x >= centerX
  const isBottom = anchor.y >= 0

  // Educational mark order: bottom-right, top-right, top-left, bottom-left.
  if (isBottom && isRight) return 0
  if (!isBottom && isRight) return 1
  if (!isBottom && !isRight) return 2
  return 3
}

export type AnimationPhase = 'base' | 'dots' | 'marks'

/**
 * Composes HarfBuzz shaped glyphs into positioned, validated, calligraphically ordered
 * ComposedGlyph instances.
 *
 * Positioning model:
 *   glyphX = cursorX + xOffset
 *   glyphY = -yOffset
 *   cursorX += xAdvance
 *
 * Animation sequencing:
 *   Groups glyphs by logical cluster (reading order right-to-left: cluster 0, 1, 2...)
 *   Within each cluster: Base -> Dots -> Hamza -> Bottom Tashkeel -> Top Tashkeel Level 1 -> Level 2.
 *   Within each glyph: Preserves the trusted definition's verified stroke.order verbatim.
 */
export function composeGlyphs(
  hbGlyphs: HbGlyph[],
  sourceTextOrStartX: string | number = '',
  startXOrStartY: number = 0,
  maybeStartY: number = 0,
  isIsolatedOverride?: boolean,
  options: {
    allowUnverifiedFallback?: boolean
    animationPhase?: AnimationPhase
    targetCluster?: number
    targetGlyphIndex?: number
  } = {}
): CompositionResult {
  let sourceText = ''
  let startX = 0
  let startY = 0

  if (typeof sourceTextOrStartX === 'string') {
    sourceText = sourceTextOrStartX
    startX = typeof startXOrStartY === 'number' ? startXOrStartY : 0
    startY = typeof maybeStartY === 'number' ? maybeStartY : 0
  } else {
    startX = sourceTextOrStartX
    startY = typeof startXOrStartY === 'number' ? startXOrStartY : 0
    sourceText = ''
  }

  if (hbGlyphs.length === 0) {
    return {
      glyphs: [],
      unsupportedCount: 0,
      supportedCount: 0,
      isFullySupported: true,
      sourceText,
      clusterSpans: [],
      skippedGlyphs: []
    }
  }

  // 1. Determine whether this is an isolated single-letter context
  const trimmed = sourceText.trim()
  const isLigature =
    trimmed === 'لا' ||
    trimmed === 'لأ' ||
    trimmed === 'لإ' ||
    trimmed === 'لآ' ||
    hbGlyphs.some((g) => g.glyphName?.includes('.rlig'))
  const isIsolated =
    !isLigature &&
    (isIsolatedOverride !== undefined
      ? isIsolatedOverride
      : trimmed.length === 1 || (trimmed.length > 0 && Array.from(trimmed).length === 1))

  // 2. Compute explicit cluster spans
  const spansMap = computeClusterSpans(hbGlyphs, sourceText)

  // 3. Compute HarfBuzz positions in visual buffer order
  let cursorX = startX
  interface PositionedGlyph {
    hb: HbGlyph
    glyphX: number
    glyphY: number
    cluster: number
    span: ClusterSpan | null
    semanticRole: SemanticRole
  }

  const positionedList: PositionedGlyph[] = hbGlyphs
    .filter((hb) => hb.glyphId !== 3 && hb.glyphName !== 'space' && hb.glyphName !== 'uni200C')
    .map((hb) => {
    const gx = cursorX + (hb.xOffset || 0)
    const gy = -(hb.yOffset || 0) + startY
    cursorX += hb.xAdvance || 0

    const cluster = typeof hb.cluster === 'number' ? hb.cluster : 0
    const span = spansMap.get(cluster) || null
    const semanticRole = classifySemanticRole({
      glyphId: hb.glyphId,
      glyphName: hb.glyphName,
      yPosition: gy,
      yOffset: hb.yOffset
    })

    return {
      hb,
      glyphX: gx,
      glyphY: gy,
      cluster,
      span,
      semanticRole
    }
    })

  // 4. Resolve stroke definitions for each glyph
  // In isolated mode, the base glyph holds the full composite letter definition (including dots).
  let unsupportedCount = 0
  const composedGlyphs: ComposedGlyph[] = []
  const skippedGlyphs: CompositionResult['skippedGlyphs'] = []

  // Check if an isolated letter definition was resolved to avoid duplicate dot strokes
  let isolatedCompositeResolved = false

  for (const item of positionedList) {
    const { hb, glyphX, glyphY, cluster, span, semanticRole } = item
    const sourceSpan = span ? span.sourceSpan : ''
    const baseChar = normalizeArabicBaseChar(
      span ? span.baseChar : sourceText ? getFirstCodePoint(sourceText) : ''
    )

    let definition: TrustedStrokeDefinition | null = null
    let isSupported = false
    let orderedStrokes: StrokeItem[] = []
    const isolatedCompositeDefinition =
      isIsolated &&
      strokeRegistry.resolve({
        glyphId: hb.glyphId,
        sourceChar: baseChar || normalizeArabicBaseChar(trimmed),
        isIsolated: true
      })

    if (isIsolated) {
      const isStandaloneHamza = baseChar === 'ء' || trimmed === 'ء'
      if (semanticRole === 'dot' && isolatedCompositeDefinition) {
        // Isolated verified letter fixtures already own their dot strokes.
        // HarfBuzz may emit an additional dot glyph before the base glyph;
        // keep that shaped glyph empty so the composite is rendered once.
        isSupported = true
        definition = null
        orderedStrokes = []
      } else if (
        (semanticRole === 'base' || (isStandaloneHamza && semanticRole === 'hamza')) &&
        !isolatedCompositeResolved
      ) {
        // Resolve isolated composite letter through source character
        definition = strokeRegistry.resolve({
          glyphId: hb.glyphId,
          sourceChar: baseChar || normalizeArabicBaseChar(trimmed),
          isIsolated: true
        })

        if (definition) {
          isSupported = true
          isolatedCompositeResolved = true
          orderedStrokes = [...definition.strokes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        } else {
          isSupported = false
          definition = null
          orderedStrokes = []
          unsupportedCount++
        }
      } else if (
        (semanticRole === 'dot' || semanticRole === 'hamza' || semanticRole === 'tashkeel_top_2') &&
        ['أ', 'إ', 'آ', 'ؤ', 'ئ', 'ء'].includes(baseChar)
      ) {
        // Composite letter fixtures already contain their own hamza/maddah
        // component. Do not add the shaped combining mark a second time.
        isSupported = true
        definition = null
        orderedStrokes = []
      } else {
        // Other isolated glyphs
        definition = strokeRegistry.resolve({
          glyphId: hb.glyphId,
          sourceChar: baseChar || normalizeArabicBaseChar(trimmed),
          isIsolated: true
        })
        if (definition) {
          isSupported = true
          orderedStrokes = [...definition.strokes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        } else {
          isSupported = false
          definition = null
          orderedStrokes = []
          unsupportedCount++
        }
      }
    } else {
      // Contextual / word glyph lookup strictly by glyphId
      definition = strokeRegistry.resolve({
        glyphId: hb.glyphId,
        isIsolated: false
      })

      if (!definition && options.allowUnverifiedFallback) {
        if (semanticRole === 'base') {
          definition = strokeRegistry.getCompatibleContextualGlyph(hb.glyphName, hb.glyphId)
        }
        if (!definition && semanticRole === 'base') {
          const isolatedFallback = strokeRegistry.resolve({
            glyphId: hb.glyphId,
            sourceChar: baseChar,
            isIsolated: true
          })
            definition = isolatedFallback
            ? {
                ...isolatedFallback,
                id: `unverified_contextual_${isolatedFallback.id}`,
                isIsolatedLetter: false,
                provenance: 'unverified_fallback'
              }
            : null
        }
        if (!definition && semanticRole !== 'base') {
          // Unknown marks are intentionally ignored. Only registered geometry
          // is allowed to affect the shadow, ink, or animation timeline.
          definition = strokeRegistry.getGlyph(hb.glyphId)
        }
      }

      if (definition) {
        isSupported = true
        orderedStrokes = [...definition.strokes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      } else {
        // Explicitly unsupported; NEVER fabricate geometry
        isSupported = false
        definition = null
        orderedStrokes = []
        unsupportedCount++
      }
    }

    if (!isSupported) {
      // Unknown letters and marks are skipped completely instead of creating
      // warnings, fallback strokes, shadows, or animation steps.
      skippedGlyphs.push({
        glyphId: hb.glyphId,
        glyphName: hb.glyphName,
        sourceSpan,
        baseChar,
        semanticRole
      })
      continue
    }

    // Backward-compatible form structure for legacy SVG renderer / AnimationEngine
    const legacyResolved = {
      glyphId: hb.glyphId,
      form: {
        strokes: definition ? definition.strokes : [],
        dots: [],
        renderSpace: {
          outlineTransform: {
            translate: { x: glyphX, y: glyphY }
          }
        }
      },
      isDot: semanticRole === 'dot'
    }

    composedGlyphs.push({
      cluster,
      clusterStart: span?.clusterStart ?? cluster,
      clusterEnd: span?.clusterEnd ?? cluster + 1,
      sourceSpan,
      baseChar,
      glyphId: hb.glyphId,
      glyphName: hb.glyphName,
      glyphX,
      glyphY,
      isSupported,
      definition,
      semanticRole,
      orderedStrokes,
      hb,
      resolved: legacyResolved,
      cursorX: glyphX,
      cursorY: glyphY
    })
  }

  let targetCluster = options.targetCluster
  if (options.targetGlyphIndex !== undefined) {
    const logicalBaseGlyphs = composedGlyphs
      .filter((glyph) => glyph.semanticRole === 'base')
      .sort((a, b) => a.cluster - b.cluster)
    targetCluster = logicalBaseGlyphs[options.targetGlyphIndex]?.cluster
  }

  const targetedGlyphs =
    targetCluster === undefined
      ? composedGlyphs
      : composedGlyphs.filter((glyph) => glyph.cluster === targetCluster)

  // 5. Sort into global calligraphic animation phases:
  // Draw every letter body first, then marks using their spatial priority.
  // This makes an upper-right hamza precede a lower-left dot in "أب".
  const markGlyphs = targetedGlyphs.filter((glyph) => glyph.semanticRole !== 'base')
  const markAnchors = markGlyphs.map(markAnchor)
  const markCenterX =
    markAnchors.length > 0
      ? (Math.min(...markAnchors.map((anchor) => anchor.x)) +
          Math.max(...markAnchors.map((anchor) => anchor.x))) /
        2
      : 0
  const sorted = [...targetedGlyphs].sort((a, b) => {
    const aIsBase = a.semanticRole === 'base'
    const bIsBase = b.semanticRole === 'base'
    if (aIsBase !== bIsBase) {
      return aIsBase ? -1 : 1
    }
    if (!aIsBase && !bIsBase) {
      const quadrantDiff = markQuadrant(a, markCenterX) - markQuadrant(b, markCenterX)
      if (quadrantDiff !== 0) return quadrantDiff
    }
    if (a.cluster !== b.cluster) {
      return a.cluster - b.cluster
    }
    // Stable tie-breaker: preserve right-to-left positioning.
    return a.glyphX - b.glyphX
  })

  // Letter mode can render a single contextual item in multiple passes while
  // preserving its original shaping context. This keeps body strokes ahead of
  // attached dots, and dots ahead of combining marks, without changing outlines.
  const phase = options.animationPhase
  if (phase) {
    for (const glyph of sorted) {
      if (phase === 'base') {
        glyph.orderedStrokes =
          glyph.semanticRole === 'base'
            ? glyph.orderedStrokes.filter(
                (stroke) => !(stroke.isCandidateDot || stroke.type === 'dot')
              )
            : []
      } else if (phase === 'dots') {
        glyph.orderedStrokes =
          glyph.semanticRole === 'dot'
            ? glyph.orderedStrokes
            : glyph.semanticRole === 'base'
              ? glyph.orderedStrokes.filter(
                  (stroke) => stroke.isCandidateDot || stroke.type === 'dot'
                )
              : []
      } else {
        glyph.orderedStrokes =
          glyph.semanticRole === 'base' || glyph.semanticRole === 'dot'
            ? []
            : glyph.orderedStrokes
      }
    }
  }

  return {
    glyphs: sorted,
    unsupportedCount,
    supportedCount: composedGlyphs.length,
    isFullySupported: unsupportedCount === 0,
    sourceText,
    clusterSpans: Array.from(spansMap.values()),
    skippedGlyphs
  }
}

/**
 * High-level helper: shapes and composes an arbitrary Arabic Unicode text string.
 */
export function composeText(
  text: string,
  options: {
    startX?: number
    startY?: number
    isIsolated?: boolean
  } = {}
): CompositionResult {
  const hbGlyphs = shapeText(text)
  return composeGlyphs(hbGlyphs, text, options.startX ?? 0, options.startY ?? 0, options.isIsolated)
}
