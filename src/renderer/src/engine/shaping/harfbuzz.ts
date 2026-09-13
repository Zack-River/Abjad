import { harfbuzzService, initHarfBuzz, ShapedGlyphRecord } from './harfbuzz-service'

export type HbGlyph = ShapedGlyphRecord

/**
 * Shapes an Arabic text string using HarfBuzz WASM.
 * HarfBuzzService must be initialized via initHarfBuzz() beforehand.
 */
export function shapeText(text: string): HbGlyph[] {
  return harfbuzzService.shapeText(text)
}

export type { ShapedGlyphRecord }
export { harfbuzzService, initHarfBuzz }
