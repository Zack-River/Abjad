/**
 * Phase 2 Migration Validation Script
 *
 * Validates:
 * 1. RTL placement matching golden reference for 11 verified words:
 *    ببب, باب, بتث, سلم, كتب, علم, ننب, هوي, على, فتى, مدرسة
 * 2. Extended calligraphic ordering for:
 *    بِسْمِ, مُحَمَّد, سؤال, قراءة, مؤمن, بيئة
 * 3. Multi-codepoint cluster spans and role ordering for:
 *    بِ, مُحَمَّد
 * 4. Ligature contextual composition:
 *    لا
 * 5. Unsupported glyph handling:
 *    شمس (GID 35 unverified -> reported as unsupported without fabrication)
 * 6. Determinism (multiple runs produce identical outputs)
 * 7. Byte-level integrity of frozen reference datasets
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import { composeText } from '../src/renderer/src/engine/composition/glyph-composer'
import { VerifiedInventory, WordEntry } from './types'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`)
    passed++
  } else {
    console.error(`  ❌ [FAIL] ${message}`)
    failed++
  }
}

async function runTests(): Promise<void> {
  console.log('=================================================================')
  console.log('PHASE 2 VALIDATION: GENERIC GLYPH COMPOSITION LAYER')
  console.log('=================================================================')

  await initHarfBuzz()

  const goldenPath = path.resolve(process.cwd(), 'data/golden/verified-reference.json')
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as VerifiedInventory
  const allGoldenFixtures: WordEntry[] = [
    ...(golden.contextual || []),
    ...(golden.extended || []),
    ...(golden.special || []),
    ...(golden.diacritics || [])
  ]

  // -------------------------------------------------------------------------
  // TEST A: RTL Placement for 11 Verified Golden Words
  // -------------------------------------------------------------------------
  console.log('\n--- TEST A: RTL Placement for 11 Golden Words ---')
  const testAWords = ['ببب', 'باب', 'بتث', 'سلم', 'كتب', 'علم', 'ننب', 'هوي', 'على', 'فتى', 'مدرسة']

  for (const word of testAWords) {
    const fixture = golden.contextual.find((f: WordEntry) => f.word === word)
    assert(Boolean(fixture), `Found golden fixture for "${word}"`)
    if (!fixture) continue

    const result = composeText(word)
    assert(
      result.glyphs.length === fixture.glyphs.length,
      `"${word}": composed ${result.glyphs.length} glyphs (expected ${fixture.glyphs.length})`
    )

    let allCoordsMatch = true
    for (let i = 0; i < fixture.glyphs.length; i++) {
      const fg = fixture.glyphs[i]
      const cg = result.glyphs[i]
      const fgX = fg.xPosition ?? 0
      const fgY = fg.yPosition ?? 0
      const xDiff = Math.abs((cg?.glyphX ?? -9999) - fgX)
      const yDiff = Math.abs((cg?.glyphY ?? -9999) - fgY)
      const gidMatch = cg?.glyphId === fg.glyphId

      if (xDiff > 0.01 || yDiff > 0.01 || !gidMatch) {
        allCoordsMatch = false
        console.error(
          `     Mismatch in "${word}" at index ${i}: composed GID ${cg?.glyphId} (x=${cg?.glyphX}, y=${cg?.glyphY}) vs fixture GID ${fg.glyphId} (x=${fgX}, y=${fgY})`
        )
      }
    }
    assert(allCoordsMatch, `"${word}": all glyph positions match golden reference exactly`)
  }

  // -------------------------------------------------------------------------
  // TEST B: Extended Calligraphic Ordering
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: Extended Calligraphic Ordering ---')
  const testBWords = ['بِسْمِ', 'مُحَمَّد', 'سؤال', 'قراءة', 'مؤمن', 'بيئة']

  for (const word of testBWords) {
    const fixture = allGoldenFixtures.find(
      (f: WordEntry) => f.word === word || f.id === `extended_${word}` || f.id?.includes(word)
    )
    assert(Boolean(fixture), `Found golden reference fixture for "${word}" (${fixture?.id})`)
    if (!fixture) continue

    const result = composeText(word)
    assert(
      result.glyphs.length === fixture.glyphs.length,
      `"${word}": composed ${result.glyphs.length} glyphs (expected ${fixture.glyphs.length})`
    )

    let orderAndPosMatch = true
    for (let i = 0; i < fixture.glyphs.length; i++) {
      const fg = fixture.glyphs[i]
      const cg = result.glyphs[i]
      const fgX = fg.xPosition ?? 0
      const fgY = fg.yPosition ?? 0
      const xDiff = Math.abs((cg?.glyphX ?? -9999) - fgX)
      const yDiff = Math.abs((cg?.glyphY ?? -9999) - fgY)
      const gidMatch = cg?.glyphId === fg.glyphId

      if (xDiff > 0.01 || yDiff > 0.01 || !gidMatch) {
        orderAndPosMatch = false
        console.error(
          `     Mismatch in "${word}" at index ${i}: composed GID ${cg?.glyphId} (x=${cg?.glyphX}, y=${cg?.glyphY}) vs fixture GID ${fg.glyphId} (x=${fgX}, y=${fgY})`
        )
      }
    }
    assert(
      orderAndPosMatch,
      `"${word}": calligraphic sequence and positions match golden reference`
    )

    // Verify all glyphs in these verified words are supported
    assert(result.isFullySupported, `"${word}": all composed glyphs are fully supported`)
  }

  // Specific ordering invariants
  // 1. In مُحَمَّد cluster 4 (مَّ): Shadda before Fatha
  const mohammadResult = composeText('مُحَمَّد')
  const shaddaIndex = mohammadResult.glyphs.findIndex((g) => g.glyphId === 366) // uni0651
  const fathaIndex = mohammadResult.glyphs.findIndex(
    (g, idx) => g.glyphId === 369 && idx > shaddaIndex - 2 && idx > 2
  )
  assert(
    shaddaIndex !== -1 && fathaIndex !== -1 && shaddaIndex < fathaIndex,
    'مُحَمَّد: Shadda (level 1) is sequenced before Fatha (level 2) within cluster 4'
  )

  // 2. In سؤال: Waw base before Hamza mark
  const sualResult = composeText('سؤال')
  const wawIndex = sualResult.glyphs.findIndex((g) => g.glyphId === 98) // uni0648.fina
  const hamzaIndex = sualResult.glyphs.findIndex((g) => g.glyphId === 296) // uni0654
  assert(
    wawIndex !== -1 && hamzaIndex !== -1 && wawIndex < hamzaIndex,
    'سؤال: Waw body is sequenced before Hamza mark within cluster 1'
  )

  // 3. In بيئة: Nabrah base before Hamza mark
  const biahResult = composeText('بيئة')
  const nabrahIndex = biahResult.glyphs.findIndex((g) => g.glyphId === 16 && g.cluster === 2)
  const biahHamzaIndex = biahResult.glyphs.findIndex((g) => g.glyphId === 296 && g.cluster === 2)
  assert(
    nabrahIndex !== -1 && biahHamzaIndex !== -1 && nabrahIndex < biahHamzaIndex,
    'بيئة: Nabrah body is sequenced before Hamza mark within cluster 2'
  )

  // -------------------------------------------------------------------------
  // TEST C: Multi-Codepoint Cluster Spans
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: Multi-Codepoint Cluster Spans ---')
  const biResult = composeText('بِ')
  assert(biResult.clusterSpans.length === 1, 'بِ: exactly 1 cluster span')
  assert(biResult.clusterSpans[0].sourceSpan === 'بِ', 'بِ: sourceSpan is "بِ"')
  assert(biResult.clusterSpans[0].baseChar === 'ب', 'بِ: baseChar is "ب"')
  assert(biResult.glyphs.length === 3, 'بِ: produces 3 glyphs (base, dot, kasra)')
  assert(biResult.glyphs[0].semanticRole === 'base', 'بِ glyph 0 is base (GID 14)')
  assert(biResult.glyphs[1].semanticRole === 'dot', 'بِ glyph 1 is dot (GID 315)')
  assert(
    biResult.glyphs[2].semanticRole === 'tashkeel_bottom',
    'بِ glyph 2 is tashkeel_bottom (GID 425)'
  )

  assert(mohammadResult.clusterSpans.length === 4, 'مُحَمَّد: exactly 4 cluster spans')
  assert(mohammadResult.clusterSpans[0].sourceSpan === 'مُ', 'Cluster 0 span is "مُ"')
  assert(mohammadResult.clusterSpans[0].baseChar === 'م', 'Cluster 0 baseChar is "م"')
  assert(mohammadResult.clusterSpans[1].sourceSpan === 'حَ', 'Cluster 1 span is "حَ"')
  assert(mohammadResult.clusterSpans[1].baseChar === 'ح', 'Cluster 1 baseChar is "ح"')
  assert(mohammadResult.clusterSpans[2].sourceSpan === 'مَّ', 'Cluster 2 span is "مَّ"')
  assert(mohammadResult.clusterSpans[2].baseChar === 'م', 'Cluster 2 baseChar is "م"')
  assert(mohammadResult.clusterSpans[3].sourceSpan === 'د', 'Cluster 3 span is "د"')
  assert(mohammadResult.clusterSpans[3].baseChar === 'د', 'Cluster 3 baseChar is "د"')

  // -------------------------------------------------------------------------
  // TEST D: Ligature / Context (لا)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Ligature Context (لا) ---')
  const laaResult = composeText('لا')
  assert(laaResult.glyphs.length === 2, 'لا: produces 2 contextual ligature glyphs')
  assert(laaResult.clusterSpans.length === 2, 'لا: contains 2 cluster spans (cluster 0 and 1)')
  assert(laaResult.clusterSpans[0].sourceSpan === 'ل', 'Cluster 0 span is "ل"')
  assert(laaResult.clusterSpans[1].sourceSpan === 'ا', 'Cluster 1 span is "ا"')
  assert(
    laaResult.glyphs[0].glyphId === 73, // uni0644.init.rlig
    'لا: first animated glyph is initial Lam (GID 73, cluster 0)'
  )
  assert(
    laaResult.glyphs[1].glyphId === 10, // uni0627.fina.rlig
    'لا: second animated glyph is final Alef (GID 10, cluster 1)'
  )
  assert(
    laaResult.glyphs[0].glyphX > laaResult.glyphs[1].glyphX,
    'لا: RTL visual placement puts initial Lam (right) before final Alef (left)'
  )

  // -------------------------------------------------------------------------
  // TEST E: Unsupported Glyphs (شمس)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST E: Unsupported Glyphs (شمس) ---')
  const shamsResult = composeText('شمس')
  assert(shamsResult.glyphs.length === 4, 'شمس: composed into 4 glyphs')
  assert(!shamsResult.isFullySupported, 'شمس: reported as NOT fully supported')
  assert(shamsResult.unsupportedCount === 1, 'شمس: unsupportedCount === 1')
  assert(shamsResult.supportedCount === 3, 'شمس: supportedCount === 3')

  const finalSeenGlyph = shamsResult.glyphs.find((g) => g.glyphId === 35) // uni0633.fina
  assert(Boolean(finalSeenGlyph), 'شمس: includes final seen (GID 35)')
  assert(finalSeenGlyph?.isSupported === false, 'Final seen (GID 35) isSupported === false')
  assert(finalSeenGlyph?.definition === null, 'Final seen (GID 35) definition === null')
  assert(finalSeenGlyph?.orderedStrokes.length === 0, 'Final seen (GID 35) orderedStrokes === []')

  const initialSeenGlyph = shamsResult.glyphs.find((g) => g.glyphId === 37)
  assert(initialSeenGlyph?.isSupported === true, 'Initial seen (GID 37) is supported')
  assert(
    (initialSeenGlyph?.orderedStrokes.length ?? 0) > 0,
    'Initial seen (GID 37) has verified strokes'
  )

  // -------------------------------------------------------------------------
  // TEST F: Determinism
  // -------------------------------------------------------------------------
  console.log('\n--- TEST F: Determinism ---')
  const runs = [
    composeText('مُحَمَّد'),
    composeText('مُحَمَّد'),
    composeText('مُحَمَّد'),
    composeText('مُحَمَّد'),
    composeText('مُحَمَّد')
  ]

  const firstJson = JSON.stringify(runs[0])
  let allRunsIdentical = true
  for (let i = 1; i < runs.length; i++) {
    if (JSON.stringify(runs[i]) !== firstJson) {
      allRunsIdentical = false
    }
  }
  assert(
    allRunsIdentical,
    '5 successive runs of composeText("مُحَمَّد") produced byte-identical output'
  )

  // -------------------------------------------------------------------------
  // TEST G: Frozen Dataset SHA-256 Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST G: Frozen Dataset Integrity ---')
  const expectedGoldenHash = '7cb3754490ba7e1a5dcf4c719d53659a9b1db4650ba194493781f193802731a0'
  const expectedCandidateHash = 'd3d101f42fb3697fa1b7b856213e9593bad1070e6e27a51eff9a0c4f4c39b751'

  const actualGoldenContent = fs.readFileSync(goldenPath, 'utf8')
  const actualGoldenHash = crypto.createHash('sha256').update(actualGoldenContent).digest('hex')
  assert(
    actualGoldenHash === expectedGoldenHash,
    `Golden reference SHA-256 is unchanged (${actualGoldenHash.slice(0, 16)}...)`
  )

  const candidatePath = path.resolve(
    process.cwd(),
    'src/renderer/src/assets/candidates/arabic-strokes.candidates.json'
  )
  const actualCandidateContent = fs.readFileSync(candidatePath, 'utf8')
  const actualCandidateHash = crypto
    .createHash('sha256')
    .update(actualCandidateContent)
    .digest('hex')
  assert(
    actualCandidateHash === expectedCandidateHash,
    `Candidate dataset SHA-256 is unchanged (${actualCandidateHash.slice(0, 16)}...)`
  )

  const tegakiCandidatePath = path.resolve(
    process.cwd(),
    'data/tegaki/candidates/arabic-strokes.candidates.json'
  )
  const tegakiContent = fs.readFileSync(tegakiCandidatePath, 'utf8')
  const tegakiHash = crypto.createHash('sha256').update(tegakiContent).digest('hex')
  assert(
    tegakiHash === expectedCandidateHash,
    `Tegaki candidate SHA-256 is unchanged (${tegakiHash.slice(0, 16)}...)`
  )

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n=================================================================')
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('=================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test error in Phase 2:', err)
  process.exit(1)
})
