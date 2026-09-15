import assert from 'node:assert'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import { setupEngine } from '../src/renderer/src/engine'
import { orderDotItems } from '../src/renderer/src/engine/data/stroke-normalizer'

async function run(): Promise<void> {
  await initHarfBuzz()

  const dotOrder = orderDotItems(
    [
      { id: 'left-bottom', x: -10, y: 10 },
      { id: 'center-top', x: 0, y: -10 },
      { id: 'right-bottom', x: 10, y: 10 }
    ],
    (dot) => ({ x: dot.x, y: dot.y })
  )
  assert.deepEqual(
    dotOrder.map((dot) => dot.id),
    ['right-bottom', 'center-top', 'left-bottom'],
    'three-dot groups use bottom-right, top-center, bottom-left order'
  )

  const dottedWord = setupEngine('ببب', { allowUnverifiedFallback: true, connectGlyphs: true })
  const roles = dottedWord.timeline.steps.map((step) => dottedWord.glyphs[step.glyphIndex]?.semanticRole)
  assert.deepEqual(roles, ['base', 'dot', 'base', 'dot', 'base', 'dot'])

  const hamzaWord = setupEngine('أب', { allowUnverifiedFallback: true, connectGlyphs: true })
  const hamzaRoles = hamzaWord.timeline.steps.map((step) => hamzaWord.glyphs[step.glyphIndex]?.semanticRole)
  const hamzaIndex = hamzaRoles.indexOf('hamza')
  const firstBaseIndex = hamzaRoles.indexOf('base')
  const secondBaseIndex = hamzaRoles.lastIndexOf('base')
  assert(hamzaIndex > firstBaseIndex && hamzaIndex < secondBaseIndex, 'hamza is drawn after its letter and before the next letter')

  const markedWord = setupEngine('مُسْ', { allowUnverifiedFallback: true, connectGlyphs: true })
  const firstMark = markedWord.timeline.steps.findIndex((step) => {
    const role = markedWord.glyphs[step.glyphIndex]?.semanticRole
    return role !== 'base' && role !== 'dot'
  })
  assert(firstMark >= 0, 'marked word contains a diacritic step')
  assert(
    markedWord.timeline.steps.slice(firstMark).every((step) => {
      const role = markedWord.glyphs[step.glyphIndex]?.semanticRole
      return role !== 'base' && role !== 'dot'
    }),
    'diacritics are deferred until all letter bodies and dots finish'
  )

  console.log('Animation ordering checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
