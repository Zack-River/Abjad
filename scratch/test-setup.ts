import fs from 'node:fs'
const wasmBuf = fs.readFileSync('node_modules/harfbuzzjs/dist/harfbuzz.wasm')
const origRead = fs.readFileSync
// @ts-ignore: mock readFileSync for wasm
fs.readFileSync = function (p, ...args) {
  if (p === '/harfbuzz.wasm') return wasmBuf
  return origRead.call(fs, p, ...args)
}
import { harfbuzzService } from '../src/renderer/src/engine/shaping/harfbuzz-service'
import { setupEngine, composeGlyphs, shapeText } from '../src/renderer/src/engine'

async function main(): Promise<void> {
  const fontBuf = fs.readFileSync('public/fonts/NotoSansArabic-Regular.ttf')
  await harfbuzzService.init(fontBuf)

  console.log('--- TEST فففف ---')
  const setupF = setupEngine('فففف', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupF.glyphs.length)
  for (let i = 0; i < setupF.glyphs.length; i++) {
    const g = setupF.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth
    )
  }

  console.log('--- TEST قققق ---')
  const setupQ = setupEngine('قققق', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupQ.glyphs.length)
  for (let i = 0; i < setupQ.glyphs.length; i++) {
    const g = setupQ.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth
    )
  }

  console.log('--- TEST صصصص ---')
  const setupSad = setupEngine('صصصص', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupSad.glyphs.length)
  for (let i = 0; i < setupSad.glyphs.length; i++) {
    const g = setupSad.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes.length
    )
  }

  console.log('--- TEST ضضضض ---')
  const setupDad = setupEngine('ضضضض', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupDad.glyphs.length)
  for (let i = 0; i < setupDad.glyphs.length; i++) {
    const g = setupDad.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes.length
    )
  }

  console.log('--- TEST طططط ---')
  const setupTah = setupEngine('طططط', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupTah.glyphs.length)
  for (let i = 0; i < setupTah.glyphs.length; i++) {
    const g = setupTah.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes.length
    )
  }

  console.log('--- TEST ظظظظ ---')
  const setupZah = setupEngine('ظظظظ', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupZah.glyphs.length)
  for (let i = 0; i < setupZah.glyphs.length; i++) {
    const g = setupZah.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes.length
    )
  }

  console.log('--- TEST سسسس ---')
  const setupSeen = setupEngine('سسسس', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupSeen.glyphs.length)
  for (let i = 0; i < setupSeen.glyphs.length; i++) {
    const g = setupSeen.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes?.length
    )
  }

  console.log('--- TEST شششش ---')
  const setupSheen = setupEngine('شششش', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupSheen.glyphs.length)
  for (let i = 0; i < setupSheen.glyphs.length; i++) {
    const g = setupSheen.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes?.length
    )
  }

  console.log('--- TEST حححح ---')
  const setupHaa = setupEngine('حححح', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupHaa.glyphs.length)
  for (let i = 0; i < setupHaa.glyphs.length; i++) {
    const g = setupHaa.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes?.length
    )
  }

  console.log('--- TEST جججج ---')
  const setupJeem = setupEngine('جججج', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupJeem.glyphs.length)
  for (let i = 0; i < setupJeem.glyphs.length; i++) {
    const g = setupJeem.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes?.length
    )
  }

  console.log('--- TEST خخخخ ---')
  const setupKhaa = setupEngine('خخخخ', { allowUnverifiedFallback: true, connectGlyphs: true })
  console.log('Total glyphs:', setupKhaa.glyphs.length)
  for (let i = 0; i < setupKhaa.glyphs.length; i++) {
    const g = setupKhaa.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      g.glyphName,
      'role:',
      g.semanticRole,
      'cluster:',
      g.cluster,
      'gx:',
      g.glyphX,
      'defId:',
      g.definition?.id,
      'advance:',
      g.definition?.advanceWidth,
      'strokes:',
      g.definition?.strokes?.length
    )
  }

  for (const text of ['كككك', 'بهب', 'ئ', 'ؤ', 'لا']) {
    console.log(`--- TEST ${text} ---`)
    const s = setupEngine(text, { allowUnverifiedFallback: true, connectGlyphs: true })
    console.log('Total glyphs:', s.glyphs.length)
    for (let i = 0; i < s.glyphs.length; i++) {
      const g = s.glyphs[i]
      console.log(
        i,
        'gid:',
        g.glyphId,
        g.glyphName,
        'role:',
        g.semanticRole,
        'cluster:',
        g.cluster,
        'gx:',
        g.glyphX,
        'defId:',
        g.definition?.id,
        'advance:',
        g.definition?.advanceWidth,
        'strokes:',
        g.definition?.strokes?.length
      )
    }
  }

  console.log('--- TEST لا with isIsolated=true ---')
  const sIsolatedLa = composeGlyphs(shapeText('لا'), 'لا', 0, 0, true)
  console.log('Total glyphs:', sIsolatedLa.glyphs.length)
  for (let i = 0; i < sIsolatedLa.glyphs.length; i++) {
    const g = sIsolatedLa.glyphs[i]
    console.log(
      i,
      'gid:',
      g.glyphId,
      'defId:',
      g.definition?.id,
      'strokes:',
      g.orderedStrokes.length
    )
  }
}

main().catch(console.error)
