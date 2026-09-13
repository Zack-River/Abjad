/**
 * Phase 1 Migration Validation Suite
 *
 * Validates:
 * 1. HarfBuzz can shape: كتاب, لا, بِ, مُحَمَّد, شمس
 * 2. HarfBuzzService initializes only once.
 * 3. StrokeRegistry resolves verified glyphs for: كتاب, ببب, باب, مُحَمَّد, قراءة, بيئة
 * 4. Isolated characters ج, ح, خ, س, ش, ص, ض resolve to correct fixtures despite shared GIDs.
 * 5. Unverified shaped glyph (such as GID 35 in شمس) is reported as unsupported.
 * 6. Existing 72 verified fixtures remain byte-identical.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  HarfBuzzService,
  initHarfBuzz,
  shapeText
} from '../src/renderer/src/engine/shaping/harfbuzz-service'
import { strokeRegistry } from '../src/renderer/src/engine/data/stroke-registry'

async function runTests(): Promise<void> {
  console.log('=================================================================')
  console.log('       ARABIC STROKE PIPELINE: PHASE 1 VALIDATION SUITE          ')
  console.log('=================================================================\n')

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

  // -------------------------------------------------------------------------
  // TEST 2 (run before test 1 to check single initialization): Single Initialization
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Single Initialization Verification ---')
  const service = HarfBuzzService.getInstance()
  assert(!service.isReady, 'Service is uninitialized initially')

  // Call init concurrently multiple times
  const p1 = initHarfBuzz()
  const p2 = initHarfBuzz()
  const p3 = service.init()
  await Promise.all([p1, p2, p3])

  assert(service.isReady, 'Service is ready after init()')
  assert(
    service.initCount === 1,
    `Service was initialized exactly once (initCount: ${service.initCount})`
  )

  // Call init again after ready
  await initHarfBuzz()
  assert(
    service.initCount === 1,
    `Service initCount remains 1 after repeated call (initCount: ${service.initCount})`
  )

  // -------------------------------------------------------------------------
  // TEST 1: HarfBuzz Shaping of Specified Words
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 1: HarfBuzz Shaping for Target Words ---')
  const testWords = ['كتاب', 'لا', 'بِ', 'مُحَمَّد', 'شمس']

  for (const word of testWords) {
    const glyphs = shapeText(word)
    assert(glyphs.length > 0, `Shaped "${word}" -> produced ${glyphs.length} glyphs`)
    for (const g of glyphs) {
      assert(
        typeof g.glyphId === 'number' &&
          g.glyphId > 0 &&
          typeof g.glyphName === 'string' &&
          g.glyphName.length > 0,
        `   Glyph GID ${g.glyphId} (${g.glyphName}), cluster ${g.cluster}, advance ${g.xAdvance}`
      )
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3: Registry Resolves Verified Glyphs for Target Words
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Registry Resolution for Verified Words ---')
  const verifiedWords = ['كتاب', 'ببب', 'باب', 'مُحَمَّد', 'قراءة', 'بيئة']

  for (const word of verifiedWords) {
    const shaped = shapeText(word)
    let allResolved = true
    for (const g of shaped) {
      const def = strokeRegistry.getGlyph(g.glyphId)
      if (!def) {
        allResolved = false
        console.error(`   Missing GID ${g.glyphId} (${g.glyphName}) in word "${word}"`)
      } else {
        assert(
          def.strokes.length > 0,
          `"${word}": GID ${g.glyphId} (${g.glyphName}) resolved -> ${def.strokes.length} strokes (Category: ${def.sourceCategory})`
        )
      }
    }
    assert(allResolved, `All glyphs in "${word}" resolved in registry`)
  }

  // -------------------------------------------------------------------------
  // TEST 4: Isolated Characters with Shared GIDs Resolve Correctly
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Isolated Characters with Shared GIDs ---')
  const isolatedChecks = [
    { char: 'ج', expectedStrokes: 3, sharedGid: 22 },
    { char: 'ح', expectedStrokes: 2, sharedGid: 22 },
    { char: 'خ', expectedStrokes: 3, sharedGid: 22 },
    { char: 'س', expectedStrokes: 3, sharedGid: 34 },
    { char: 'ش', expectedStrokes: 6, sharedGid: 34 },
    { char: 'ص', expectedStrokes: 2, sharedGid: 38 },
    { char: 'ض', expectedStrokes: 3, sharedGid: 38 }
  ]

  for (const item of isolatedChecks) {
    const letterDef = strokeRegistry.getLetter(item.char)
    assert(Boolean(letterDef), `Letter "${item.char}" resolved in registry`)
    if (letterDef) {
      assert(
        letterDef.strokes.length === item.expectedStrokes,
        `Letter "${item.char}" has exact expected ${item.expectedStrokes} strokes (actual: ${letterDef.strokes.length})`
      )
      assert(letterDef.char === item.char, `Letter "${item.char}" matches char field`)
    }

    // Verify through generic resolve API
    const resolved = strokeRegistry.resolve({
      glyphId: item.sharedGid,
      sourceChar: item.char,
      isIsolated: true
    })
    assert(
      resolved?.strokes.length === item.expectedStrokes,
      `resolve() for "${item.char}" (shared GID ${item.sharedGid}) correctly yielded character-specific fixture with ${item.expectedStrokes} strokes`
    )
  }

  // -------------------------------------------------------------------------
  // TEST 5: Unverified Shaped Glyph Reported as Unsupported
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Unverified Shaped Glyph Handled Gracefully ---')
  const shamsGlyphs = shapeText('شمس')
  // In شمس: GID 35 is uni0633.fina, which is an incomplete slot
  const finalSeen = shamsGlyphs.find((g) => g.glyphName.includes('0633.fina') || g.glyphId === 35)
  assert(Boolean(finalSeen), 'Found final seen (GID 35) in shaped "شمس"')

  if (finalSeen) {
    const def = strokeRegistry.getGlyph(finalSeen.glyphId)
    assert(
      def === null,
      `GID ${finalSeen.glyphId} (${finalSeen.glyphName}) returns null (unsupported, NOT fabricated)`
    )

    const genericDef = strokeRegistry.resolve({
      glyphId: finalSeen.glyphId,
      sourceChar: 'س',
      isIsolated: false // it is in connected context
    })
    assert(
      genericDef === null,
      `resolve() for GID ${finalSeen.glyphId} in non-isolated context returns null`
    )
  }

  // -------------------------------------------------------------------------
  // TEST 6: Existing 72 Verified Fixtures Remain Byte-Identical
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Golden Fixtures Byte-Identity Check ---')
  const goldenPath = path.resolve(process.cwd(), 'data/golden/verified-reference.json')
  const goldenContent = fs.readFileSync(goldenPath, 'utf8')
  const goldenHash = crypto.createHash('sha256').update(goldenContent).digest('hex')
  const expectedGoldenHash = '7cb3754490ba7e1a5dcf4c719d53659a9b1db4650ba194493781f193802731a0'

  assert(
    goldenHash === expectedGoldenHash,
    `Golden reference SHA-256 is unchanged (${goldenHash.slice(0, 16)}...)`
  )

  const candidatePath = path.resolve(
    process.cwd(),
    'src/renderer/src/assets/candidates/arabic-strokes.candidates.json'
  )
  const candidateContent = fs.readFileSync(candidatePath, 'utf8')
  const candidateHash = crypto.createHash('sha256').update(candidateContent).digest('hex')
  const expectedCandidateHash = 'd3d101f42fb3697fa1b7b856213e9593bad1070e6e27a51eff9a0c4f4c39b751'

  assert(
    candidateHash === expectedCandidateHash,
    `Candidate reference SHA-256 is unchanged (${candidateHash.slice(0, 16)}...)`
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
  console.error('Fatal test error:', err)
  process.exit(1)
})
