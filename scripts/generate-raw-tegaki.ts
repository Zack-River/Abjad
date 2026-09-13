import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { RawGlyphData, RawPoint, RawStroke, RawTegakiDataset, RawWordFixture } from './types'

async function main(): Promise<void> {
  // Discover Tegaki scratch directory
  const candidateTegakiPaths = [
    '/home/zack-river/.gemini/antigravity-ide/brain/6c06281d-d3a3-48f7-91d7-665961a470e7/scratch/tegaki',
    '/home/zack-river/.gemini/antigravity-ide/brain/e5d50a39-b1f9-4a37-aa8a-022dab58e633/scratch/tegaki',
    '/home/zack-river/.gemini/antigravity-ide/brain/d1035402-d401-4a10-befb-640af04a1b2b/scratch/tegaki'
  ]
  const tegakiPath = candidateTegakiPaths.find((p) => fs.existsSync(p)) || candidateTegakiPaths[0]
  console.log(`Using Tegaki engine from: ${tegakiPath}`)

  const { parseFont, processGlyph, processGlyphById, DEFAULT_OPTIONS } = await import(
    path.join(tegakiPath, 'packages/generator/src/commands/generate.ts')
  )

  const hbImport = await import('harfbuzzjs')
  const hbModule = (hbImport as unknown as { default?: typeof hbImport }).default || hbImport
  const { Blob, Face, Font: HbFont, Buffer: HbBuffer, shape } = hbModule

  const fontPath = path.resolve('public/fonts/NotoSansArabic-Regular.ttf')
  const fontBuf = fs.readFileSync(fontPath)
  const fontSha256 = createHash('sha256').update(fontBuf).digest('hex')

  const arrayBuffer = fontBuf.buffer.slice(
    fontBuf.byteOffset,
    fontBuf.byteOffset + fontBuf.byteLength
  )
  const fontInfo = await parseFont(arrayBuffer, undefined, 'Noto Sans Arabic')

  const blob = new Blob(arrayBuffer)
  const face = new Face(blob, 0)
  const hbFont = new HbFont(face)

  const rawDataset: RawTegakiDataset = {
    metadata: {
      generator: 'tegaki-0.22.1',
      timestamp: new Date().toISOString(),
      font: {
        family: fontInfo.family,
        style: fontInfo.style,
        version: '2.012',
        uniqueID: '2.012;GOOG;NotoSansArabic-Regular',
        sha256: fontSha256,
        unitsPerEm: fontInfo.unitsPerEm,
        ascender: fontInfo.ascender,
        descender: fontInfo.descender,
        lineCap: fontInfo.lineCap
      }
    },
    fixtures: {
      isolated: {},
      contextual: {},
      diacritics: {},
      special: {},
      extended: {}
    }
  }

  function processSingleChar(char: string): RawGlyphData | null {
    const res = processGlyph(fontInfo, char, DEFAULT_OPTIONS)
    if (!res) return null
    return {
      char: res.char,
      unicode: res.unicode,
      advanceWidth: res.advanceWidth,
      boundingBox: res.boundingBox,
      pathString: res.pathString,
      lineCap: res.lineCap,
      subPathsCount: res.subPaths.length,
      strokes: res.strokesFontUnits.map((s: RawStroke) => ({
        order: s.order,
        priority: s.priority ?? 0,
        length: s.length,
        animationDuration: s.animationDuration,
        delay: s.delay,
        points: s.points.map((p: RawPoint) => ({
          x: p.x,
          y: p.y,
          t: p.t,
          width: p.width
        }))
      }))
    }
  }

  function processWord(word: string): RawWordFixture {
    const buffer = new HbBuffer()
    buffer.addText(word)
    buffer.guessSegmentProperties()
    shape(hbFont, buffer)
    const hbGlyphs = buffer.getGlyphInfosAndPositions()

    return {
      word,
      glyphCount: hbGlyphs.length,
      glyphs: hbGlyphs.map(
        (g: {
          codepoint: number
          cluster: number
          xAdvance?: number
          yAdvance?: number
          xOffset?: number
          yOffset?: number
        }) => {
          const res = processGlyphById(fontInfo, g.codepoint, DEFAULT_OPTIONS, 0, true)
          return {
            codepoint: g.codepoint,
            cluster: g.cluster,
            xAdvance: g.xAdvance,
            yAdvance: g.yAdvance,
            xOffset: g.xOffset,
            yOffset: g.yOffset,
            char: res?.char || `gid_${g.codepoint}`,
            glyphData: res
              ? {
                  advanceWidth: res.advanceWidth,
                  boundingBox: res.boundingBox,
                  pathString: res.pathString,
                  strokes: res.strokesFontUnits.map((s: RawStroke) => ({
                    order: s.order,
                    priority: s.priority ?? 0,
                    length: s.length,
                    animationDuration: s.animationDuration,
                    delay: s.delay,
                    points: s.points.map((p: RawPoint) => ({
                      x: p.x,
                      y: p.y,
                      t: p.t,
                      width: p.width
                    }))
                  }))
                }
              : null
          }
        }
      )
    }
  }

  console.log('Generating Isolated fixtures for all 36 Arabic letters (Groups A–E)...')
  const ALL_LETTERS = [
    // Group A (Simple body + dots)
    'ب',
    'ت',
    'ث',
    'ن',
    'ي',
    // Group B (Baseline/body families)
    'د',
    'ذ',
    'ر',
    'ز',
    'و',
    // Group C (Extended baselines)
    'س',
    'ش',
    'ص',
    'ض',
    'ط',
    'ظ',
    // Group D (Curved/complex bodies)
    'ج',
    'ح',
    'خ',
    'ع',
    'غ',
    'ف',
    'ق',
    'ك',
    'ل',
    'م',
    'ه',
    // Group E (Special / structural forms)
    'ا',
    'أ',
    'إ',
    'آ',
    'ة',
    'ى',
    'ء',
    'ؤ',
    'ئ'
  ]

  for (const ch of ALL_LETTERS) {
    const processed = processSingleChar(ch)
    if (processed) {
      rawDataset.fixtures.isolated[ch] = processed
      console.log(`  -> Isolated: ${ch} (${processed.strokes.length} raw strokes)`)
    } else {
      console.warn(`  [!] Could not process character: ${ch}`)
    }
  }

  console.log('Generating Contextual fixtures (golden & expanded)...')
  const CONTEXTUAL_WORDS = [
    // Golden reference contextual fixtures
    'ببب',
    'باب',
    'بتث',
    // Expanded contextual fixtures from topological expansion
    'سلم',
    'كتب',
    'علم',
    'ننب',
    'هوي',
    'على',
    'فتى',
    'مدرسة'
  ]
  for (const word of CONTEXTUAL_WORDS) {
    rawDataset.fixtures.contextual[word] = processWord(word)
    console.log(
      `  -> Contextual: ${word} (${rawDataset.fixtures.contextual[word].glyphCount} glyphs)`
    )
  }

  console.log('Generating Diacritic fixtures...')
  for (const word of ['بَ', 'بِ', 'بُ', 'بْ', 'بّ', 'بً', 'بٍ', 'بٌ']) {
    rawDataset.fixtures.diacritics[word] = processWord(word)
  }

  console.log('Generating Special cases...')
  const SPECIAL_WORDS = [
    'أ',
    'إ',
    'ؤ',
    'ئ',
    'ء',
    'لا',
    'لال',
    'للا',
    // Expanded Lam-Alef forms
    'لأ',
    'لإ',
    'لآ'
  ]
  for (const word of SPECIAL_WORDS) {
    rawDataset.fixtures.special[word] = processWord(word)
    console.log(`  -> Special: ${word} (${rawDataset.fixtures.special[word].glyphCount} glyphs)`)
  }

  console.log('Generating Extended evaluation fixtures...')
  for (const word of ['بِسْمِ', 'مُحَمَّد', 'سؤال', 'قراءة', 'مؤمن', 'بيئة']) {
    rawDataset.fixtures.extended[word] = processWord(word)
  }

  const outPath = path.resolve('data/tegaki/raw/fixture_experiment.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(rawDataset, null, 2))
  console.log(`Saved raw Tegaki output to: ${outPath}`)
}

main().catch((err) => {
  console.error('Error generating raw Tegaki fixtures:', err)
  process.exit(1)
})
