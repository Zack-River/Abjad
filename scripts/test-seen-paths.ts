import assert from 'node:assert'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import { setupEngine } from '../src/renderer/src/engine'
import {
  CANONICAL_EDITOR_BRUSH_SIZES,
  CANONICAL_LETTER_PATHS,
  canonicalDotOutlineAt
} from '../src/renderer/src/engine/data/canonical-stroke-paths'
import { StrokeRegistry } from '../src/renderer/src/engine/data/stroke-registry'

function getBaseGlyph(
  setup: ReturnType<typeof setupEngine>,
  char: string
): ReturnType<typeof setupEngine>['glyphs'][number] {
  const glyph = setup.glyphs.find((item) => item.baseChar === char && item.semanticRole === 'base')
  assert(glyph, `Base glyph resolved for ${char}`)
  assert(glyph.isSupported, `${char} is supported`)
  return glyph
}

function assertBodyPath(word: string, char: 'س' | 'ش', expected: string): void {
  const glyph = getBaseGlyph(
    setupEngine(word, { allowUnverifiedFallback: true, connectGlyphs: true }),
    char
  )
  const body = glyph.orderedStrokes.find((stroke) => !stroke.isCandidateDot)
  assert.equal(body?.medianPath, expected, `${char} body path is canonical in ${word}`)
}

async function run(): Promise<void> {
  await initHarfBuzz()

  const seenPaths = CANONICAL_LETTER_PATHS.س
  const sheenPaths = CANONICAL_LETTER_PATHS.ش
  assert.deepEqual(sheenPaths, seenPaths, 'Seen and Sheen share the supplied body paths')
  assert.equal(CANONICAL_EDITOR_BRUSH_SIZES.س.isolated, 80, 'Seen editor uses brush size 80')
  assert.equal(CANONICAL_EDITOR_BRUSH_SIZES.ش.isolated, 80, 'Sheen editor uses brush size 80')

  assertBodyPath('س', 'س', seenPaths.isolated)
  assertBodyPath('ش', 'ش', sheenPaths.isolated)

  for (const [char, paths, words] of [
    ['س', seenPaths, ['سب', 'بسب', 'بس']],
    ['ش', sheenPaths, ['شب', 'بشب', 'بش']]
  ] as const) {
    assertBodyPath(words[0], char, paths.initial)
    assertBodyPath(words[1], char, paths.medial)
    assertBodyPath(words[2], char, paths.final)
  }

  const registry = StrokeRegistry.getInstance()
  assert.equal(registry.getGlyph(37)?.strokes[0]?.medianPath, seenPaths.initial)
  assert.equal(registry.getGlyph(36)?.strokes[0]?.medianPath, seenPaths.medial)
  assert.equal(registry.getGlyph(35)?.strokes[0]?.medianPath, seenPaths.final)

  const isolatedSheen = getBaseGlyph(
    setupEngine('ش', { allowUnverifiedFallback: true, connectGlyphs: true }),
    'ش'
  )
  assert.equal(
    isolatedSheen.orderedStrokes.filter((stroke) => stroke.isCandidateDot).length,
    3,
    'isolated Sheen retains its three dot strokes'
  )
  for (const dot of isolatedSheen.orderedStrokes.filter((stroke) => stroke.isCandidateDot)) {
    const start = dot.startPoint!
    const end = dot.endPoint!
    assert.equal(
      dot.outlinePath,
      canonicalDotOutlineAt({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }),
      'isolated Sheen uses the standard round dot outline'
    )
  }

  for (const word of ['شب', 'بشب', 'بش']) {
    const setup = setupEngine(word, { allowUnverifiedFallback: true, connectGlyphs: true })
    const contextualDots = setup.glyphs
      .filter((glyph) => glyph.semanticRole === 'dot' && glyph.glyphId === 291)
      .flatMap((glyph) => glyph.orderedStrokes.filter((stroke) => stroke.isCandidateDot))
    assert(contextualDots.length > 0, `contextual Sheen dots resolved for ${word}`)
    for (const dot of contextualDots) {
      assert(dot.outlinePath, `contextual Sheen dot has an outline path in ${word}`)
      const start = dot.startPoint!
      const end = dot.endPoint!
      assert.equal(
        dot.outlinePath,
        canonicalDotOutlineAt({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }),
        `contextual Sheen uses the standard round dot outline in ${word}`
      )
    }
  }

  console.log('Seen and Sheen path checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
