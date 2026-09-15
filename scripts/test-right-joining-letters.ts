import assert from 'node:assert'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import { setupEngine } from '../src/renderer/src/engine'
import { CANONICAL_RIGHT_JOINING_PATHS } from '../src/renderer/src/engine/data/canonical-stroke-paths'

function getBaseGlyph(setup: ReturnType<typeof setupEngine>, char: string) {
  const glyph = setup.glyphs.find((item) => item.baseChar === char && item.semanticRole === 'base')
  assert(glyph, `Base glyph resolved for ${char}`)
  assert(glyph.isSupported, `${char} is supported`)
  return glyph
}

async function run(): Promise<void> {
  await initHarfBuzz()

  for (const char of ['د', 'ذ', 'ر', 'ز', 'و']) {
    const isolated = getBaseGlyph(
      setupEngine(char, { allowUnverifiedFallback: true, connectGlyphs: true }),
      char
    )
    const isolatedBody = isolated.orderedStrokes.find((stroke) => !stroke.isCandidateDot)
    assert.equal(
      isolatedBody?.medianPath,
      CANONICAL_RIGHT_JOINING_PATHS[char].isolated,
      `${char} isolated path uses the supplied canonical path`
    )

    const connected = getBaseGlyph(
      setupEngine(`ب${char}`, { allowUnverifiedFallback: true, connectGlyphs: true }),
      char
    )
    const bodyStrokes = connected.orderedStrokes.filter((stroke) => !stroke.isCandidateDot)
    const expectedBodyStrokes = 1
    assert.equal(
      bodyStrokes.length,
      expectedBodyStrokes,
      `${char} right-connected form has the canonical number of ordered body strokes`
    )
    assert.equal(bodyStrokes[0].medianPath, CANONICAL_RIGHT_JOINING_PATHS[char].final)
  }

  console.log('Right-joining letter path checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
