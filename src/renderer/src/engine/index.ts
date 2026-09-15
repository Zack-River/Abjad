import { shapeText, initHarfBuzz, harfbuzzService } from './shaping/harfbuzz'
import {
  composeGlyphs,
  composeText,
  ComposedGlyph,
  CompositionResult,
  normalizeEducationalText
} from './composition/glyph-composer'
import {
  AnimationEngine,
  buildTimeline,
  AnimationTimeline,
  SpeedLevel,
  SPEED_MULTIPLIERS,
  getBridgeHandoffProgress,
  getStepInkProgress,
  getStepStrokeProgress
} from './animation/animation-engine'
import {
  renderSvg,
  prepareRenderScene,
  renderSvgFrame,
  PreparedRenderScene,
  getBrushSquareGeometry,
  GLOBAL_BRUSH_SCALE,
  DEFAULT_STROKE_WEIGHT,
  DEFAULT_BRUSH_HEIGHT,
  DEFAULT_DOT_BRUSH_HEIGHT,
  BRUSH_WIDTH_TO_HEIGHT_RATIO
} from './renderer/svg-renderer'
import {
  composeCandidateFixture,
  setupCandidateFixture
} from './composition/candidate-fixture-composer'

export function setupEngine(
  text: string,
  options?: {
    speed?: SpeedLevel | number
    connectGlyphs?: boolean
    allowUnverifiedFallback?: boolean
    animationPhase?: 'base' | 'dots' | 'marks'
    targetCluster?: number
    targetGlyphIndex?: number
  }
): {
  glyphs: ComposedGlyph[]
  timeline: AnimationTimeline
  engine: AnimationEngine
  skippedGlyphs: CompositionResult['skippedGlyphs']
} {
  const shapedText = normalizeEducationalText(text)
  const hbGlyphs = shapeText(shapedText)

  if (hbGlyphs.length === 0) {
    // Return empty setup
    const timeline = buildTimeline([])
    return {
      glyphs: [],
      timeline,
      engine: new AnimationEngine(timeline, options?.speed ?? 'medium'),
      skippedGlyphs: []
    }
  }

  const composition = composeGlyphs(hbGlyphs, shapedText, 0, 0, undefined, {
    allowUnverifiedFallback: options?.allowUnverifiedFallback,
    animationPhase: options?.animationPhase,
    targetCluster: options?.targetCluster,
    targetGlyphIndex: options?.targetGlyphIndex
  })
  const { glyphs, skippedGlyphs } = composition
  const timeline = buildTimeline(glyphs, { connectGlyphs: options?.connectGlyphs })
  const engine = new AnimationEngine(timeline, options?.speed ?? 'medium')

  return { glyphs, timeline, engine, skippedGlyphs }
}

export {
  shapeText,
  initHarfBuzz,
  harfbuzzService,
  composeGlyphs,
  composeText,
  composeCandidateFixture,
  setupCandidateFixture,
  buildTimeline,
  renderSvg,
  prepareRenderScene,
  renderSvgFrame,
  getBrushSquareGeometry,
  GLOBAL_BRUSH_SCALE,
  DEFAULT_STROKE_WEIGHT,
  DEFAULT_BRUSH_HEIGHT,
  DEFAULT_DOT_BRUSH_HEIGHT,
  BRUSH_WIDTH_TO_HEIGHT_RATIO,
  AnimationEngine,
  SPEED_MULTIPLIERS,
  getBridgeHandoffProgress,
  getStepInkProgress,
  getStepStrokeProgress
}
export type { ComposedGlyph, SpeedLevel, PreparedRenderScene }
