/**
 * Phase 3 Migration Test Suite: SVG Renderer Integration & Coordinate-Space Verification
 *
 * Validates:
 * 1. All 72 verified fixtures render through renderSvg without errors.
 * 2. Geometry alignment for letter_ب (outline and median/stamp coordinates occupy same local font space).
 * 3. Prevention of coordinate-space failure (no untransformed root paths; common group transform).
 * 4. Exact validated ComparisonGallery viewport transform parity.
 * 5. Multi-glyph words (كتاب, ببب, باب).
 * 6. Combining marks and tashkeel (بِ, مُحَمَّد).
 * 7. Ligatures and extended contexts (لا, قراءة, بيئة).
 * 8. Regression coverage for formerly unsupported Arabic text (شمس).
 * 9. Strict byte-identical SVG determinism (identical markup & mask IDs across renders).
 * 10. Frozen dataset SHA-256 integrity (verified reference & candidate files unchanged).
 * 11. App.css untouched integrity.
 * 12. animation-engine.ts regression hash confirmation.
 * 13. Trusted geometry source verification (zero access to legacy fixture_db.json).
 */

import * as fs from 'fs'
import * as crypto from 'crypto'
import {
  renderSvg,
  computeViewportTransform
} from '../src/renderer/src/engine/renderer/svg-renderer'
import { composeText } from '../src/renderer/src/engine/composition/glyph-composer'
import { composeCandidateFixture } from '../src/renderer/src/engine/composition/candidate-fixture-composer'
import { buildTimeline } from '../src/renderer/src/engine/animation/animation-engine'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import { setupEngine } from '../src/renderer/src/engine'
import {
  CANONICAL_EDITOR_BRUSH_SIZES,
  CANONICAL_HAMZA_PATH,
  CANONICAL_KAF_PATHS,
  CANONICAL_LETTER_PATHS,
  CANONICAL_MULTI_STROKE_LETTER_PATHS
} from '../src/renderer/src/engine/data/canonical-stroke-paths'
import verifiedCandidates from '../src/renderer/src/assets/candidates/arabic-strokes.candidates.json'
import { ArabicStrokeDataset, CandidateEntry, VerifiedInventory, LetterEntry } from './types'

let totalChecks = 0
let passedChecks = 0
let failedChecks = 0

function assert(condition: boolean, msg: string): void {
  totalChecks++
  if (condition) {
    passedChecks++
    console.log(`  ✅ [PASS] ${msg}`)
  } else {
    failedChecks++
    console.error(`  ❌ [FAIL] ${msg}`)
  }
}

function sha256(filePath: string): string {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function runPhase3Tests(): Promise<void> {
  console.log('=================================================================')
  console.log('PHASE 3 VALIDATION: SVG RENDERER & COORDINATE-SPACE INTEGRATION')
  console.log('=================================================================\n')

  await initHarfBuzz()

  // The Glyph State Source of Truth editor uses this exact contextual setup
  // for the connected-left ت form. Guard against falling back to the old
  // hardcoded GID 21 stroke when the candidate map has no entry for that GID.
  const taInitialSetup = setupEngine('تب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 0
  })
  const taInitialStroke = taInitialSetup.glyphs.find((glyph) => glyph.semanticRole === 'base')?.orderedStrokes[0]
  assert(
    taInitialStroke?.medianPath === 'M 144.5 -388.2 C 276.4 -49.9, 156.1 -32.2, 8.7 -39.2',
    'Connected-left ت resolves the canonical GID 21 path'
  )

  const baaIsolatedSetup = setupEngine('ب', { allowUnverifiedFallback: true })
  const baaIsolatedGlyph = baaIsolatedSetup.glyphs.find((glyph) => glyph.semanticRole === 'base')
  assert(
    baaIsolatedGlyph?.orderedStrokes[0]?.medianPath ===
      'M 851.8 -387.7 C 910.3 -186.5, 1027.2 -11.1, 428.5 -22.8 C 70.7 -34.5, 42.7 -60.3, 91.8 -331.5' &&
      baaIsolatedGlyph.orderedStrokes[1]?.medianPath === 'M 504.0 120.3 L 464.0 202.4',
    'Isolated ب resolves the supplied body and dot paths'
  )

  const taaIsolatedPaths = setupEngine('ت', { allowUnverifiedFallback: true }).glyphs
    .find((glyph) => glyph.semanticRole === 'base')
    ?.orderedStrokes.map((stroke) => stroke.medianPath)
  assert(
    taaIsolatedPaths !== undefined &&
      taaIsolatedPaths.includes('M 574.3 -491.8 L 534.3 -409.6') &&
      taaIsolatedPaths.includes('M 438.7 -491.8 L 398.7 -409.6'),
    'Isolated ت resolves both supplied dot paths'
  )

  const sharedBaaPaths = {
    isolated:
      'M 851.8 -387.7 C 910.3 -186.5, 1027.2 -11.1, 428.5 -22.8 C 70.7 -34.5, 42.7 -60.3, 91.8 -331.5',
    initial: 'M 123.3 -385.3 C 233.3 -64.9, 156.1 -32.2, 8.7 -39.2',
    medial:
      'M 391.8 -38.8 C 136.5 5.6, 189.7 -167.6, 192 -278.6 C 165.3 -16.6, 105.4 -54.4, 5.5 -41',
    final:
      'M 1142.2 -36.6 C 867.1 -16.1, 917.6 -154.2, 951.3 -226.7 C 716.2 80.9, -118.7 66.9, 92.1 -325.2'
  } as const
  const taaPaths = {
    ...sharedBaaPaths,
    initial: 'M 144.5 -388.2 C 276.4 -49.9, 156.1 -32.2, 8.7 -39.2',
    medial:
      'M 422.3 -40 C 119.2 -2, 206.2 -229.8, 217.4 -278.2 C 178.1 -67.6, 141.6 -43.4, 5.5 -41',
    final:
      'M 1142.2 -36.6 C 923.2 -19.2, 889.5 -112.5, 948.5 -229.8 C 914.8 -22.7, -123.6 163.7, 95.3 -333.4'
  } as const
  for (const [char, initialWord, medialWord, finalWord] of [
    ['ب', 'بب', 'ببب', 'بب'],
    ['ت', 'تب', 'بتب', 'بت'],
    ['ث', 'ثب', 'بثب', 'بث']
  ] as const) {
    const isolated = setupEngine(char, { allowUnverifiedFallback: true }).glyphs.find(
      (glyph) => glyph.semanticRole === 'base'
    )
    const initial = setupEngine(initialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 0
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const medial = setupEngine(medialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const final = setupEngine(finalWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const expectedPaths = char === 'ب' ? sharedBaaPaths : taaPaths
    assert(
      isolated?.orderedStrokes[0]?.medianPath === expectedPaths.isolated &&
        initial?.orderedStrokes[0]?.medianPath === expectedPaths.initial &&
        medial?.orderedStrokes[0]?.medianPath === expectedPaths.medial &&
        final?.orderedStrokes[0]?.medianPath === expectedPaths.final,
      `${char} uses the supplied shared body path in all four states`
    )
  }

  for (const [char, initialWord, medialWord, finalWord] of [
    ['ص', 'صب', 'بصب', 'بص'],
    ['ض', 'ضب', 'بضب', 'بض']
  ] as const) {
    const isolated = setupEngine(char, { allowUnverifiedFallback: true }).glyphs.find(
      (glyph) => glyph.semanticRole === 'base'
    )
    const initial = setupEngine(initialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 0
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const medial = setupEngine(medialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const final = setupEngine(finalWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const expectedPaths = CANONICAL_LETTER_PATHS[char]
    assert(
      isolated?.orderedStrokes[0]?.medianPath === expectedPaths.isolated &&
        isolated?.orderedStrokes.length === (char === 'ض' ? 2 : 1) &&
        initial?.orderedStrokes[0]?.medianPath === expectedPaths.initial &&
        medial?.orderedStrokes[0]?.medianPath === expectedPaths.medial &&
        final?.orderedStrokes[0]?.medianPath === expectedPaths.final &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.isolated === 80,
      `${char} uses the supplied SAD-family paths in all four states without the obsolete isolated step`
    )
  }

  for (const [char, initialWord, medialWord, finalWord] of [
    ['ط', 'طب', 'بطب', 'بط'],
    ['ظ', 'ظب', 'بظب', 'بظ']
  ] as const) {
    const expected = CANONICAL_MULTI_STROKE_LETTER_PATHS[char]
    const isolated = setupEngine(char, { allowUnverifiedFallback: true }).glyphs.find(
      (glyph) => glyph.semanticRole === 'base'
    )
    const initial = setupEngine(initialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 0
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const medial = setupEngine(medialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const final = setupEngine(finalWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const matches = (glyph, state) =>
      glyph?.orderedStrokes.map((stroke) => stroke.medianPath).join('|') ===
        expected[state].map((stroke) => stroke.medianPath).join('|') &&
      glyph?.orderedStrokes.map((stroke) => stroke.direction).join('|') ===
        expected[state].map((stroke) => stroke.direction).join('|')
    assert(
      matches(isolated, 'isolated') &&
        matches(initial, 'initial') &&
        matches(medial, 'medial') &&
        matches(final, 'final') &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.isolated === 80,
      `${char} uses the canonical two-stroke TAH-family sequence in all four states`
    )
  }

  for (const [char, initialWord, medialWord, finalWord] of [
    ['ع', 'عب', 'بعب', 'بع'],
    ['غ', 'غب', 'بغب', 'بغ']
  ] as const) {
    const expected = CANONICAL_LETTER_PATHS[char]
    const bodyStrokes = (glyph) =>
      glyph?.orderedStrokes.filter((stroke) => !stroke.isCandidateDot && stroke.type !== 'dot') || []
    const isolated = setupEngine(char, { allowUnverifiedFallback: true }).glyphs.find(
      (glyph) => glyph.baseChar === char
    )
    const initial = setupEngine(initialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 0
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const medial = setupEngine(medialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const final = setupEngine(finalWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    assert(
      bodyStrokes(isolated)[0]?.medianPath === expected.isolated &&
        bodyStrokes(initial)[0]?.medianPath === expected.initial &&
        bodyStrokes(medial)[0]?.medianPath === expected.medial &&
        bodyStrokes(final)[0]?.medianPath === expected.final &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.isolated === 80 &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.['left-connected'] === 80 &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.['right-connected'] === 80 &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.['both-connected'] === 80,
      `${char} uses the canonical AIN-family body path in all four states`
    )
    if (char === 'غ') {
      assert(
        [isolated, initial, medial, final].every(
          (glyph) => glyph?.orderedStrokes.filter((stroke) => stroke.isCandidateDot || stroke.type === 'dot').length === 1
        ),
        'GHAIN retains one independent upper dot in every state'
      )
    }
  }

  const faaPaths = CANONICAL_LETTER_PATHS.ف
  const faaIsolated = setupEngine('ف', { allowUnverifiedFallback: true }).glyphs.find(
    (glyph) => glyph.baseChar === 'ف'
  )
  const faaInitial = setupEngine('فب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 0
  }).glyphs.find((glyph) => glyph.baseChar === 'ف')
  const faaMedial = setupEngine('بفب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  }).glyphs.find((glyph) => glyph.baseChar === 'ف')
  const faaFinal = setupEngine('بف', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  }).glyphs.find((glyph) => glyph.baseChar === 'ف')
  const faaBody = (glyph) =>
    glyph?.orderedStrokes.find((stroke) => !stroke.isCandidateDot && stroke.type !== 'dot')
  assert(
    faaBody(faaIsolated)?.medianPath === faaPaths.isolated &&
      faaBody(faaInitial)?.medianPath === faaPaths.initial &&
      faaBody(faaMedial)?.medianPath === faaPaths.medial &&
      faaBody(faaFinal)?.medianPath === faaPaths.final &&
      faaIsolated?.orderedStrokes.some(
        (stroke) => stroke.isCandidateDot && stroke.medianPath === faaPaths.dotPaths?.[0]
      ) === true &&
      CANONICAL_EDITOR_BRUSH_SIZES.ف?.isolated === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ق?.isolated === 80,
    'FAA uses the supplied four-state paths and isolated dot'
  )

  const qafInitial = setupEngine('قب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 0
  }).glyphs.find((glyph) => glyph.baseChar === 'ق')
  const qafMedial = setupEngine('بقب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  }).glyphs.find((glyph) => glyph.baseChar === 'ق')
  assert(
    faaBody(qafInitial)?.medianPath === faaPaths.initial &&
      faaBody(qafMedial)?.medianPath === faaPaths.medial,
    'QAF uses the shared FAA connected body paths'
  )

  const jheemPaths = {
    isolated:
      'M 38.3 -357.2 C 227.2 -419.3, 323.4 -312.3, 568.5 -291.6 C -20.3 -291.6, -214.8 543.9, 584.5 305.7',
    initial:
      'M 60.3 -298.5 C 335.3 -346.8, 349.3 -205.2, 549.4 -193.2 C 391.4 -201.8, 251.1 -18.8, 3.2 -37.7',
    medial: [
      'M 688.9 -40.3 C 537.3 -26.5, 489.6 -67.9, 447.5 -130',
      'M 63.1 -302.3 C 296.8 -371.1, 427.9 -167.7, 559.8 -191.9 C 366.2 -188.4, 180.9 -8.9, 6.9 -40'
    ],
    final: [
      'M 699.1 -33.1 C 533.1 -36.8, 429.3 -71.4, 440.5 -223.3',
      'M 36.4 -354.1 C 185.1 -419.7, 364.8 -292, 578 -295.4 C -258.3 -150.4, 8.3 550.4, 581.9 302.1'
    ]
  } as const
  for (const [char, initialWord, medialWord, finalWord] of [
    ['ج', 'جب', 'بجب', 'بج'],
    ['ح', 'حب', 'بحب', 'بح'],
    ['خ', 'خب', 'بخب', 'بخ']
  ] as const) {
    const isolated = setupEngine(char, { allowUnverifiedFallback: true }).glyphs.find(
      (glyph) => glyph.baseChar === char
    )
    const initial = setupEngine(initialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 0
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const medial = setupEngine(medialWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    const final = setupEngine(finalWord, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    }).glyphs.find((glyph) => glyph.baseChar === char)
    assert(
      isolated?.orderedStrokes[0]?.medianPath === jheemPaths.isolated &&
        initial?.orderedStrokes[0]?.medianPath === jheemPaths.initial &&
        medial?.orderedStrokes.slice(0, 2).map((stroke) => stroke.medianPath).join('|') ===
          jheemPaths.medial.join('|') &&
        final?.orderedStrokes.slice(0, 2).map((stroke) => stroke.medianPath).join('|') ===
          jheemPaths.final.join('|'),
      `${char} uses the supplied JHEEM-family paths in all four states`
    )
  }

  const noonIsolatedSetup = setupEngine('ن', { allowUnverifiedFallback: true })
  const noonIsolatedStroke = noonIsolatedSetup.glyphs.find((glyph) => glyph.semanticRole === 'base')?.orderedStrokes[0]
  assert(
    noonIsolatedStroke?.medianPath === 'M 519.7 -296.4 C 840.1 342.1, -123.4 332.7, 101.1 -163.1',
    'Isolated ن resolves the canonical GID 80 path'
  )
  const noonIsolatedPaths = noonIsolatedSetup.glyphs.flatMap((glyph) =>
    glyph.orderedStrokes.map((stroke) => stroke.medianPath)
  )
  assert(
    noonIsolatedPaths.includes('M 349.6 -488.5 L 309.6 -406.3'),
    'Isolated ن resolves the supplied dot path'
  )

  const noonFinalSetup = setupEngine('بن', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  })
  const noonFinalGlyph = noonFinalSetup.glyphs.find(
    (glyph) => glyph.semanticRole === 'base' && glyph.baseChar === 'ن'
  )
  assert(
    noonFinalGlyph?.orderedStrokes.length === 1 &&
      noonFinalGlyph.orderedStrokes[0]?.medianPath ===
        'M 781.7 -38.2 C 594.9 -9.2, 566.8 -188.7, 547.8 -272.1 C 816.6 380.9, -148.8 294.6, 109.4 -157.7',
    'Final ن uses only the canonical body stroke'
  )

  const yaaIsolatedSetup = setupEngine('ي', { allowUnverifiedFallback: true })
  const yaaIsolatedPaths = yaaIsolatedSetup.glyphs.flatMap((glyph) =>
    glyph.orderedStrokes.map((stroke) => stroke.medianPath)
  )
  assert(
    yaaIsolatedPaths.includes(
      'M 729.6 -353.7 C 569.6 -457.3, 232.9 -184.5, 558.4 -87.9 C 996.2 77.8, -92.7 505.9, 103.8 -156.9'
    ),
    'Isolated ي resolves the supplied canonical body path'
  )
  assert(
    yaaIsolatedPaths.includes('M 446.3 329.5 L 406.3 411.7') &&
      yaaIsolatedPaths.includes('M 307.7 329.5 L 267.7 411.7'),
    'Isolated ي resolves both supplied canonical dot paths'
  )

  const yaaInitialSetup = setupEngine('يب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const yaaInitialGlyph = yaaInitialSetup.glyphs.find((glyph) => glyph.baseChar === 'ي')
  assert(
    yaaInitialGlyph?.orderedStrokes[0]?.medianPath ===
      'M 147.3 -388.2 C 175.3 -329.5, 315.6 -1.6, 9.7 -36.1',
    'Connected-left ي resolves the supplied canonical initial path'
  )

  const yaaMedialSetup = setupEngine('بيب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const yaaMedialGlyph = yaaMedialSetup.glyphs.find((glyph) => glyph.baseChar === 'ي')
  assert(
    yaaMedialGlyph?.orderedStrokes[0]?.medianPath ===
      'M 422.3 -40 C 200.6 -2, 178.1 -122.8, 223 -278.2 C 186.5 -60.7, 169.7 -46.9, 5.5 -41',
    'Both-connected ي resolves the supplied canonical medial path'
  )

  const yaaFinalSetup = setupEngine('بي', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const yaaFinalGlyph = yaaFinalSetup.glyphs.find((glyph) => glyph.baseChar === 'ي')
  assert(
    yaaFinalGlyph?.orderedStrokes[0]?.medianPath ===
      'M 788.5 -43.4 C 687.5 -8.9, 656.6 -67.6, 488.2 -102.1 C 1114.1 108.5, -134.8 474.4, 103.8 -160.8',
    'Connected-right ي resolves the supplied canonical final path'
  )
  assert(
    CANONICAL_EDITOR_BRUSH_SIZES.ي['both-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ئ['both-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ى['both-connected'] === 80,
    'YAA-family medial editor previews use brush size 80'
  )
  assert(
    ['ب', 'ت', 'ث', 'ن', 'ي'].every(
      (char) => CANONICAL_EDITOR_BRUSH_SIZES[char]?.['both-connected'] === 80
    ),
    'Shared dotted-medial family previews use brush size 80'
  )
  assert(
    ['ب', 'ت', 'ث'].every(
      (char) => CANONICAL_EDITOR_BRUSH_SIZES[char]?.['right-connected'] === 80
    ),
    'BAA/TAA/THAA right-connected previews use brush size 80'
  )
  assert(
    CANONICAL_EDITOR_BRUSH_SIZES.ن['right-connected'] === 80,
    'NOON right-connected preview uses brush size 80'
  )

  const kafIsolatedSetup = setupEngine('ك', { allowUnverifiedFallback: true })
  const kafIsolatedGlyph = kafIsolatedSetup.glyphs.find((glyph) => glyph.semanticRole === 'base')
  assert(
    kafIsolatedGlyph?.orderedStrokes.map((stroke) => stroke.medianPath).join('|') ===
      CANONICAL_KAF_PATHS.isolated.join('|'),
    'Isolated K resolves the canonical two-stroke sequence'
  )
  assert(
    kafIsolatedGlyph?.definition?.outlinePath?.includes('M390 21') === true &&
      kafIsolatedGlyph.orderedStrokes.every((stroke) => stroke.outlinePath?.includes('M390 21')),
    'Isolated K keeps the complete verified shadow outline'
  )

  const kafInitialSetup = setupEngine('كب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 0
  })
  const kafInitialGlyph = kafInitialSetup.glyphs.find((glyph) => glyph.baseChar === 'ك')
  assert(
    kafInitialGlyph?.orderedStrokes.length === 1 &&
      kafInitialGlyph.orderedStrokes[0]?.medianPath === CANONICAL_KAF_PATHS.initial,
    'Connected-left K resolves the canonical initial path'
  )

  const kafMedialSetup = setupEngine('بكب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  })
  const kafMedialGlyph = kafMedialSetup.glyphs.find((glyph) => glyph.baseChar === 'ك')
  assert(
    kafMedialGlyph?.orderedStrokes.length === 1 &&
      kafMedialGlyph.orderedStrokes[0]?.medianPath === CANONICAL_KAF_PATHS.medial,
    'Both-connected K resolves the canonical medial path'
  )

  const kafFinalSetup = setupEngine('بك', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  })
  const kafFinalGlyph = kafFinalSetup.glyphs.find((glyph) => glyph.baseChar === 'ك')
  assert(
    kafFinalGlyph?.orderedStrokes.length === 2 &&
      kafFinalGlyph.orderedStrokes[0]?.medianPath === CANONICAL_KAF_PATHS.finalBody &&
      kafFinalGlyph.orderedStrokes[1]?.medianPath === CANONICAL_KAF_PATHS.finalMark,
    'Connected-right K resolves the canonical body followed by its upper mark'
  )
  assert(
    kafFinalGlyph?.definition?.outlinePath?.includes('M 390 21') === true &&
      kafFinalGlyph.definition.outlinePath.includes('M 364 -204') === true &&
      kafFinalGlyph.orderedStrokes[0]?.outlinePath?.includes('M 390 21') === true &&
      kafFinalGlyph.orderedStrokes[1]?.outlinePath?.includes('M 364 -204') === true,
    'Connected-right K keeps both the body and upper-mark shadow outlines'
  )
  assert(
    CANONICAL_EDITOR_BRUSH_SIZES.ك.isolated === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ك['left-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ك['right-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ك['both-connected'] === 80,
    'K editor previews use the global brush size for all states'
  )

  const lamStates = [
    ['isolated', 'ل', 0, CANONICAL_LETTER_PATHS.ل.isolated],
    ['left-connected', 'لب', 0, CANONICAL_LETTER_PATHS.ل.initial],
    ['both-connected', 'بلب', 1, CANONICAL_LETTER_PATHS.ل.medial],
    ['right-connected', 'بل', 1, CANONICAL_LETTER_PATHS.ل.final]
  ] as const
  for (const [label, word, targetGlyphIndex, expectedPath] of lamStates) {
    const lamGlyph = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex
    }).glyphs.find((glyph) => glyph.baseChar === 'ل')
    assert(
      lamGlyph?.orderedStrokes.length === 1 &&
        lamGlyph.orderedStrokes[0]?.medianPath === expectedPath,
      `Lam ${label} uses the supplied single canonical stroke`
    )
  }

  const meemStates = [
    ['isolated', 'م', 0, CANONICAL_LETTER_PATHS.م.isolated],
    ['left-connected', 'مب', 0, CANONICAL_LETTER_PATHS.م.initial],
    ['both-connected', 'بمب', 1, CANONICAL_LETTER_PATHS.م.medial],
    ['right-connected', 'بم', 1, CANONICAL_LETTER_PATHS.م.final]
  ] as const
  for (const [label, word, targetGlyphIndex, expectedPath] of meemStates) {
    const meemGlyph = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex
    }).glyphs.find((glyph) => glyph.baseChar === 'م')
    assert(
      meemGlyph?.orderedStrokes.length === 1 &&
        meemGlyph.orderedStrokes[0]?.medianPath === expectedPath,
      `Meem ${label} uses the supplied single canonical stroke`
    )
  }
  assert(
    CANONICAL_EDITOR_BRUSH_SIZES.م.isolated === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.م['left-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.م['right-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.م['both-connected'] === 80,
    'Meem editor previews use the supplied brush sizes'
  )

  const haaStates = [
    ['isolated', 'ه', 0, CANONICAL_LETTER_PATHS.ه.isolated],
    ['left-connected', 'هب', 0, CANONICAL_LETTER_PATHS.ه.initial],
    ['both-connected', 'بهب', 1, CANONICAL_LETTER_PATHS.ه.medial],
    ['right-connected', 'به', 1, CANONICAL_LETTER_PATHS.ه.final]
  ] as const
  for (const [label, word, targetGlyphIndex, expectedPath] of haaStates) {
    const haaGlyph = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex
    }).glyphs.find((glyph) => glyph.baseChar === 'ه')
    assert(
      haaGlyph?.orderedStrokes.length === 1 &&
        haaGlyph.orderedStrokes[0]?.medianPath === expectedPath,
      `Haa ${label} uses the supplied single canonical stroke`
    )
  }
  assert(
    CANONICAL_EDITOR_BRUSH_SIZES.ه.isolated === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ه['left-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ه['right-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ه['both-connected'] === 80,
    'Haa editor previews use the supplied brush sizes'
  )

  const alifStates = [
    ['isolated', 'ا', 0, CANONICAL_LETTER_PATHS.ا.isolated],
    ['left-connected', 'اب', 0, CANONICAL_LETTER_PATHS.ا.initial],
    ['both-connected', 'باب', 1, CANONICAL_LETTER_PATHS.ا.medial],
    ['right-connected', 'با', 1, CANONICAL_LETTER_PATHS.ا.final]
  ] as const
  for (const [label, word, targetGlyphIndex, expectedPath] of alifStates) {
    const alifGlyph = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex
    }).glyphs.find((glyph) => glyph.baseChar === 'ا')
    assert(
      alifGlyph?.orderedStrokes.length === 1 &&
        alifGlyph.orderedStrokes[0]?.medianPath === expectedPath,
      `Alif ${label} uses the supplied single canonical stroke`
    )
  }
  assert(
    CANONICAL_EDITOR_BRUSH_SIZES.ا.isolated === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ا['left-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ا['right-connected'] === 80 &&
      CANONICAL_EDITOR_BRUSH_SIZES.ا['both-connected'] === 80,
    'Alif editor previews use the supplied brush sizes'
  )
  for (const [char, expectedExtraStrokes] of [
    ['أ', 1],
    ['إ', 1],
    ['آ', 1]
  ] as const) {
    const alifVariant = setupEngine(char, { allowUnverifiedFallback: true }).glyphs.find(
      (glyph) => glyph.baseChar === char
    )
    assert(
      alifVariant?.orderedStrokes[0]?.medianPath === CANONICAL_LETTER_PATHS.ا.isolated &&
        alifVariant.orderedStrokes.length === expectedExtraStrokes + 1 &&
        CANONICAL_EDITOR_BRUSH_SIZES[char]?.isolated === 80,
      `${char} uses the canonical Alif body while preserving its marks`
    )
  }

  for (const [label, word, expectedPath] of [
    ['Connected-left ئ', 'ئب', 'M 147.3 -388.2 C 175.3 -329.5, 315.6 -1.6, 9.7 -36.1'],
    ['Both-connected ئ', 'بئب', 'M 422.3 -40 C 200.6 -2, 178.1 -122.8, 223 -278.2 C 186.5 -60.7, 169.7 -46.9, 5.5 -41'],
    ['Connected-right ئ', 'بئ', 'M 788.5 -43.4 C 687.5 -8.9, 656.6 -67.6, 488.2 -102.1 C 1114.1 108.5, -134.8 474.4, 103.8 -160.8']
  ] as const) {
    const stateIndex = word.startsWith('ب') ? 1 : 0
    const setup = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: stateIndex
    })
    const glyph = setup.glyphs.find((item) => item.baseChar === 'ئ')
    assert(glyph?.orderedStrokes[0]?.medianPath === expectedPath, `${label} resolves the canonical YAA body path`)
  }

  const dotlessYaa = setupEngine('ى', { allowUnverifiedFallback: true }).glyphs.find(
    (glyph) => glyph.baseChar === 'ى'
  )
  assert(
    dotlessYaa?.orderedStrokes.length === 1 &&
      dotlessYaa.orderedStrokes[0]?.medianPath === CANONICAL_LETTER_PATHS.ي.isolated,
    'Dotless Yaa reuses the canonical dotted-Yaa body without dot strokes'
  )
  const hamzaYaa = setupEngine('ئ', { allowUnverifiedFallback: true }).glyphs.find(
    (glyph) => glyph.baseChar === 'ئ'
  )
  assert(
    Boolean(
      hamzaYaa?.orderedStrokes.some((stroke) => stroke.medianPath === CANONICAL_LETTER_PATHS.ي.isolated) &&
        hamzaYaa.orderedStrokes.some((stroke) => stroke.medianPath === CANONICAL_HAMZA_PATH)
    ),
    'Hamza-Yaa reuses the canonical dotted-Yaa body and shared Hamza movement'
  )

  const baaFinalSetup = setupEngine('بب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true,
    targetGlyphIndex: 1
  })
  const baaFinalGlyph = baaFinalSetup.glyphs.find((glyph) => glyph.baseChar === 'ب')
  assert(
    baaFinalGlyph?.orderedStrokes[0]?.medianPath ===
      'M 1142.2 -36.6 C 867.1 -16.1, 917.6 -154.2, 951.3 -226.7 C 716.2 80.9, -118.7 66.9, 92.1 -325.2',
    'Right-connected ب resolves the shared canonical final path'
  )
  for (const [char, word] of [
    ['ت', 'بت'],
    ['ث', 'بث']
  ] as const) {
    const setup = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: 1
    })
    const finalGlyph = setup.glyphs.find((glyph) => glyph.baseChar === char)
    assert(
      finalGlyph?.orderedStrokes[0]?.medianPath ===
        'M 1142.2 -36.6 C 923.2 -19.2, 889.5 -112.5, 948.5 -229.8 C 914.8 -22.7, -123.6 163.7, 95.3 -333.4',
      `Right-connected ${char} resolves the shared canonical final path`
    )
  }

  const hamzaIsolatedSetup = setupEngine('ء', { allowUnverifiedFallback: true })
  const hamzaIsolatedGlyph = hamzaIsolatedSetup.glyphs.find(
    (glyph) => glyph.semanticRole === 'base' || glyph.semanticRole === 'hamza'
  )
  assert(
    hamzaIsolatedGlyph?.orderedStrokes.length === 1 &&
      hamzaIsolatedGlyph.orderedStrokes[0]?.medianPath === CANONICAL_HAMZA_PATH,
    'Isolated HAMZA uses the supplied single canonical stroke'
  )
  for (const char of ['أ', 'إ', 'ؤ', 'ئ']) {
    const setup = setupEngine(char, { allowUnverifiedFallback: true })
    const glyph = setup.glyphs.find((item) => item.semanticRole === 'base')
    assert(
      glyph?.orderedStrokes.filter((stroke) => stroke.medianPath === CANONICAL_HAMZA_PATH).length === 1,
      `${char} uses the shared canonical Hamza stroke`
    )
  }
  for (const word of ['أب', 'إب', 'ؤب', 'ئب']) {
    const setup = setupEngine(word, { allowUnverifiedFallback: true, connectGlyphs: true })
    const hamzaGlyph = setup.glyphs.find((glyph) => glyph.semanticRole === 'hamza')
    assert(
      hamzaGlyph?.orderedStrokes.length === 1 &&
        hamzaGlyph.orderedStrokes[0]?.medianPath === CANONICAL_HAMZA_PATH,
      `${word} uses the shared canonical Hamza glyph stroke`
    )
  }

  for (const word of ['زياد', 'ياد']) {
    const setup = setupEngine(word, { allowUnverifiedFallback: true, connectGlyphs: true })
    assert(setup.skippedGlyphs.length === 0, `${word} has no skipped glyphs`)
    assert(
      setup.glyphs.some((glyph) => glyph.baseChar === 'د' && glyph.orderedStrokes.length > 0),
      `${word} resolves the final right-joining letter`
    )
  }

  for (const [word, expectedGlyphIds] of [
    ['لا', [73, 10]],
    ['للا', [72, 71, 11]],
    ['لآ', [73, 10, 300]],
    ['آ', [12, 300]]
  ] as const) {
    const fullSetup = setupEngine(word, { allowUnverifiedFallback: true, connectGlyphs: true })
    assert(
      fullSetup.skippedGlyphs.length === 0 &&
        fullSetup.glyphs.map((glyph) => glyph.glyphId).join(',') === expectedGlyphIds.join(','),
      `${word} resolves every special glyph without skipping`
    )
  }

  for (const [word, expectedGlyphIds] of [
    ['لا', [73, 10]],
    ['للا', [71, 11]]
  ] as const) {
    const letterModeSetup = setupEngine(word, {
      allowUnverifiedFallback: true,
      connectGlyphs: true,
      targetGlyphIndex: word === 'لا' ? 0 : 1
    })
    assert(
      letterModeSetup.glyphs.map((glyph) => glyph.glyphId).join(',') === expectedGlyphIds.join(',') &&
        letterModeSetup.timeline.steps.length > 0,
      `${word} remains a complete ligature when selected as one letter-mode item`
    )
  }

  // -------------------------------------------------------------
  // TEST 1: All 72 Verified Fixtures Render Through renderSvg
  // -------------------------------------------------------------
  console.log('--- TEST 1: All 72 Verified Fixtures Render Through renderSvg ---')
  const dataset = verifiedCandidates as unknown as ArabicStrokeDataset
  const allFixtures: CandidateEntry[] = [
    ...(dataset.letters || []),
    ...(dataset.contextual || []),
    ...(dataset.extended || []),
    ...(dataset.special || []),
    ...(dataset.diacritics || [])
  ]

  assert(
    allFixtures.length === 72,
    `Found exactly 72 verified fixtures (got ${allFixtures.length})`
  )

  let renderFailures = 0
  for (const fixture of allFixtures) {
    try {
      const query = 'word' in fixture ? fixture.word : fixture.char || fixture.id
      const comp = composeText(query)
      const timeline = buildTimeline(comp.glyphs)
      const svg0 = renderSvg(comp.glyphs, timeline, 0, 'test')
      const svgMid = renderSvg(comp.glyphs, timeline, timeline.totalDurationMs / 2, 'test')
      const svgFull = renderSvg(comp.glyphs, timeline, timeline.totalDurationMs, 'test')

      if (!svg0.includes('<svg') || !svgMid.includes('<svg') || !svgFull.includes('<svg')) {
        renderFailures++
      }
    } catch (err: unknown) {
      console.error(`Error rendering fixture ${fixture.id}:`, err)
      renderFailures++
    }
  }
  assert(
    renderFailures === 0,
    `All 72 verified fixtures rendered successfully at progress 0, 50%, 100%`
  )

  // -------------------------------------------------------------
  // TEST 2: Geometry Alignment for letter_ب
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Geometry Alignment for letter_ب ---')
  const compBaa = composeText('ب', { isIsolated: true })
  assert(compBaa.glyphs.length >= 1, `Composed letter_ب produced ${compBaa.glyphs.length} glyphs`)

  const baaGlyph = compBaa.glyphs[0]
  assert(baaGlyph.isSupported === true, `letter_ب is supported`)
  assert(baaGlyph.definition !== null, `letter_ب definition is resolved`)

  const outline = baaGlyph.definition?.outlinePath || ''
  assert(outline.startsWith('M390 21'), `outlinePath begins in local font units (M390 21)`)

  // Inspect stroke median coordinates
  const boatStroke = baaGlyph.orderedStrokes.find((s) => s.order === 0)
  assert(boatStroke !== undefined, `Found boat stroke (order 0)`)
  assert(boatStroke!.startPoint?.x === 851.8, `Boat startPoint.x is 851.8 (local font units)`)
  assert(boatStroke!.startPoint?.y === -387.7, `Boat startPoint.y is -387.7 (local font units)`)

  // Render SVG and verify mask stamp coordinates
  const timelineBaa = buildTimeline(compBaa.glyphs)
  const svgBaaInitial = renderSvg(compBaa.glyphs, timelineBaa, 0)
  const svgBaa = renderSvg(compBaa.glyphs, timelineBaa, timelineBaa.totalDurationMs / 2)
  assert(svgBaa.includes('maskUnits="userSpaceOnUse"'), `Mask uses maskUnits="userSpaceOnUse"`)
  assert(
    svgBaa.includes('maskContentUnits="userSpaceOnUse"'),
    `Mask uses maskContentUnits="userSpaceOnUse"`
  )
  assert(
    svgBaa.includes('transform="translate(851.8 -387.7)'),
    `Stamp 0 is located exactly at local font coordinates (851.8, -387.7)`
  )

  // -------------------------------------------------------------
  // TEST 3: Coordinate-Space Failure Prevention
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Coordinate-Space Failure Prevention ---')
  // 1. No median path rendered at root without group transform
  assert(
    !svgBaa.includes('<path d="M 851.8" class="median-path" fill="none" />\n      </svg>'),
    `Median path is not dumped untransformed at root stage`
  )
  // 2. Word group has single outer transform
  assert(
    svgBaa.includes('<g id="word-group" transform="translate('),
    `word-group has unified outer transform`
  )
  // 3. Glyphs are positioned in font units via glyph-group transform
  assert(
    svgBaa.includes(`transform="translate(${baaGlyph.glyphX}, ${baaGlyph.glyphY})"`),
    `Glyph group placed at (${baaGlyph.glyphX}, ${baaGlyph.glyphY})`
  )
  // 4. Inked path uses same outline in local font units
  assert(
    svgBaa.includes(`class="ink-outline" mask="url(#mask-g0-s0)"`),
    `Ink outline is masked via local font space mask`
  )
  assert(
    svgBaaInitial.includes(`class="ink-outline" mask="url(#mask-g0-s0)"`),
    `Initial frame mounts masked ink geometry for incremental mask updates`
  )

  // -------------------------------------------------------------
  // TEST 4: Viewport Transform Parity (Independently Derived Golden Reference)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Viewport Transform Parity (Independently Derived) ---')
  // Independently load golden metadata to derive expected viewport bounds
  const frozenRef = JSON.parse(
    fs.readFileSync('data/golden/verified-reference.json', 'utf8')
  ) as VerifiedInventory
  const frozenBaa = frozenRef.letters.find((l: LetterEntry) => l.id === 'letter_ب')
  if (!frozenBaa || !frozenBaa.boundingBox) {
    throw new Error('letter_ب or boundingBox not found in verified-reference.json')
  }
  const bb = frozenBaa.boundingBox // font units (y points up)

  // Independent coordinate conversion (+Y down):
  const INDEPENDENT_GOLDEN_MIN_X = bb.x1
  const INDEPENDENT_GOLDEN_MAX_X = bb.x2
  const INDEPENDENT_GOLDEN_MIN_Y = -bb.y2
  const INDEPENDENT_GOLDEN_MAX_Y = -bb.y1
  const INDEPENDENT_GOLDEN_WIDTH = INDEPENDENT_GOLDEN_MAX_X - INDEPENDENT_GOLDEN_MIN_X
  const INDEPENDENT_GOLDEN_HEIGHT = INDEPENDENT_GOLDEN_MAX_Y - INDEPENDENT_GOLDEN_MIN_Y

  // Independent standard stage calculation (600 x 300)
  const PADDING_X = 120
  const PADDING_Y = 110
  const INDEPENDENT_GOLDEN_SCALE = Math.min(
    0.28,
    (600 - PADDING_X) / INDEPENDENT_GOLDEN_WIDTH,
    (300 - PADDING_Y) / INDEPENDENT_GOLDEN_HEIGHT
  )

  // Height from baseline to maxY (INDEPENDENT_GOLDEN_MAX_Y is below baseline)
  const contentHeightAboveBaseline = Math.abs(INDEPENDENT_GOLDEN_MIN_Y)
  const scaledAbove = contentHeightAboveBaseline * INDEPENDENT_GOLDEN_SCALE
  const scaledTotal = INDEPENDENT_GOLDEN_HEIGHT * INDEPENDENT_GOLDEN_SCALE

  // Center vertically based on visible bounds, but keep 35px top margin minimum
  const extraVerticalSpace = 300 - 40 - scaledTotal
  const INDEPENDENT_GOLDEN_BASELINE_Y = Math.round(35 + scaledAbove + extraVerticalSpace / 2)
  const INDEPENDENT_GOLDEN_TX = Math.round(
    (600 - INDEPENDENT_GOLDEN_WIDTH * INDEPENDENT_GOLDEN_SCALE) / 2 -
      INDEPENDENT_GOLDEN_MIN_X * INDEPENDENT_GOLDEN_SCALE
  )

  const transformBaa = computeViewportTransform(compBaa.glyphs, 600, 300)

  assert(
    transformBaa.minX === INDEPENDENT_GOLDEN_MIN_X,
    `minX matches independent golden outline (${transformBaa.minX} === ${INDEPENDENT_GOLDEN_MIN_X})`
  )
  assert(
    transformBaa.maxX === INDEPENDENT_GOLDEN_MAX_X,
    `maxX matches independent golden outline (${transformBaa.maxX} === ${INDEPENDENT_GOLDEN_MAX_X})`
  )
  assert(
    transformBaa.minY === INDEPENDENT_GOLDEN_MIN_Y,
    `minY matches independent golden outline (${transformBaa.minY} === ${INDEPENDENT_GOLDEN_MIN_Y})`
  )
  assert(
    transformBaa.maxY === INDEPENDENT_GOLDEN_MAX_Y,
    `maxY matches independent golden outline (${transformBaa.maxY} === ${INDEPENDENT_GOLDEN_MAX_Y})`
  )
  assert(
    transformBaa.boundsWidth === INDEPENDENT_GOLDEN_WIDTH,
    `boundsWidth matches independent golden geometry (${transformBaa.boundsWidth} === ${INDEPENDENT_GOLDEN_WIDTH})`
  )
  assert(
    transformBaa.boundsHeight === INDEPENDENT_GOLDEN_HEIGHT,
    `boundsHeight matches independent golden geometry (${transformBaa.boundsHeight} === ${INDEPENDENT_GOLDEN_HEIGHT})`
  )
  assert(
    transformBaa.scale === INDEPENDENT_GOLDEN_SCALE,
    `scale matches independent golden calculation (${transformBaa.scale} === ${INDEPENDENT_GOLDEN_SCALE})`
  )
  assert(
    transformBaa.baselineY === INDEPENDENT_GOLDEN_BASELINE_Y,
    `baselineY matches independent golden calculation (${transformBaa.baselineY} === ${INDEPENDENT_GOLDEN_BASELINE_Y})`
  )
  assert(
    transformBaa.tx === INDEPENDENT_GOLDEN_TX,
    `tx matches independent golden calculation (${transformBaa.tx} === ${INDEPENDENT_GOLDEN_TX})`
  )

  // Verify that SVG markup strictly reflects these independent values
  const expectedGroupTransform = `transform="translate(${INDEPENDENT_GOLDEN_TX}, ${INDEPENDENT_GOLDEN_BASELINE_Y}) scale(${INDEPENDENT_GOLDEN_SCALE})"`
  assert(
    svgBaa.includes(expectedGroupTransform),
    `SVG outer word-group has ${expectedGroupTransform}`
  )
  assert(
    svgBaa.includes(`y1="${INDEPENDENT_GOLDEN_BASELINE_Y}" y2="${INDEPENDENT_GOLDEN_BASELINE_Y}"`),
    `Baseline line is rendered at y=${INDEPENDENT_GOLDEN_BASELINE_Y}`
  )

  // Coordinate Space Alignment: verify outline, median strokes, and mask stamps all fall within golden bounds
  assert(
    boatStroke!.startPoint!.x >= INDEPENDENT_GOLDEN_MIN_X &&
      boatStroke!.startPoint!.x <= INDEPENDENT_GOLDEN_MAX_X,
    `Boat stroke startPoint.x (${boatStroke!.startPoint!.x}) is within [${INDEPENDENT_GOLDEN_MIN_X}, ${INDEPENDENT_GOLDEN_MAX_X}]`
  )
  assert(
    boatStroke!.startPoint!.y >= INDEPENDENT_GOLDEN_MIN_Y &&
      boatStroke!.startPoint!.y <= INDEPENDENT_GOLDEN_MAX_Y,
    `Boat stroke startPoint.y (${boatStroke!.startPoint!.y}) is within [${INDEPENDENT_GOLDEN_MIN_Y}, ${INDEPENDENT_GOLDEN_MAX_Y}]`
  )

  // -------------------------------------------------------------
  // TEST 5: Multi-Glyph Words (كتاب, ببب, باب)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Multi-Glyph Words ---')
  for (const word of ['كتاب', 'ببب', 'باب']) {
    const comp = composeText(word)
    const timeline = buildTimeline(comp.glyphs)
    const svg = renderSvg(comp.glyphs, timeline, timeline.totalDurationMs)
    const debugSvg = renderSvg(comp.glyphs, timeline, timeline.totalDurationMs, '', {
      includeMedianLayer: true
    })

    assert(comp.glyphs.length >= 3, `"${word}" composed into ${comp.glyphs.length} glyphs`)
    assert(svg.includes('class="glyph-ghost"'), `"${word}" renders ghost outlines`)
    assert(svg.includes('class="glyph-ink"'), `"${word}" renders ink layers`)
    assert(!svg.includes('id="median-layer"'), `"${word}" omits debug median paths by default`)
    assert(debugSvg.includes('class="glyph-median"'), `"${word}" renders median paths when requested`)

    // Verify each glyph has its own distinct group transform
    for (let i = 0; i < comp.glyphs.length; i++) {
      const g = comp.glyphs[i]
      assert(
        svg.includes(`transform="translate(${g.glyphX}, ${g.glyphY})"`),
        `"${word}" glyph ${i} has placement transform translate(${g.glyphX}, ${g.glyphY})`
      )
    }
  }

  // -------------------------------------------------------------
  // TEST 6: Combining Marks & Tashkeel (بِ, مُحَمَّد)
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Combining Marks & Tashkeel ---')
  const compBi = composeText('بِ')
  const timelineBi = buildTimeline(compBi.glyphs)
  const svgBi = renderSvg(compBi.glyphs, timelineBi, timelineBi.totalDurationMs)
  assert(compBi.glyphs.length === 3, `"بِ" has 3 glyphs (base, dot, kasra)`)
  assert(svgBi.includes('mask-g0-s0'), `"بِ" has mask for base stroke`)
  assert(svgBi.includes('mask-g1-s0'), `"بِ" has mask for dot stroke`)
  assert(svgBi.includes('mask-g2-s0'), `"بِ" has mask for kasra mark`)

  const compMuhammed = composeText('مُحَمَّد')
  const timelineMuhammed = buildTimeline(compMuhammed.glyphs)
  const svgMuhammed = renderSvg(
    compMuhammed.glyphs,
    timelineMuhammed,
    timelineMuhammed.totalDurationMs
  )
  assert(compMuhammed.glyphs.length === 8, `"مُحَمَّد" has 8 glyphs`)
  assert(svgMuhammed.includes('class="ink-outline"'), `"مُحَمَّد" rendered ink outline`)
  assert(svgMuhammed.includes('id="baseline"'), `"مُحَمَّد" rendered baseline`)

  // -------------------------------------------------------------
  // TEST 7: Gallery Candidate Adapter & Dot Reveal Clipping
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Gallery Candidate Adapter & Dot Reveal Clipping ---')
  const candidateBaa = (verifiedCandidates as unknown as ArabicStrokeDataset).letters?.find(
    (l) => l.id === 'letter_ب'
  )
  assert(Boolean(candidateBaa), `Found letter_ب candidate fixture`)
  if (candidateBaa) {
    const candidateComp = composeCandidateFixture(candidateBaa)
    const candidateTimeline = buildTimeline(candidateComp.glyphs)
    const dotStep = candidateTimeline.steps.find((s) => s.isDot)
    assert(candidateComp.glyphs.length === 1, `Candidate fixture composes into one canonical glyph`)
    assert(
      candidateComp.glyphs[0].orderedStrokes.length === 2,
      `Candidate fixture preserves normalized body + dot strokes`
    )
    assert(Boolean(dotStep), `Candidate fixture timeline includes a dot step`)

    if (dotStep) {
      const partialProgressMs = dotStep.startMs + (dotStep.endMs - dotStep.startMs) / 2
      const partialSvg = renderSvg(
        candidateComp.glyphs,
        candidateTimeline,
        partialProgressMs,
        'candidate-dot-partial'
      )
      const completeSvg = renderSvg(
        candidateComp.glyphs,
        candidateTimeline,
        candidateTimeline.totalDurationMs,
        'candidate-dot-complete'
      )
      assert(
        partialSvg.includes('candidate-dot-partial-mask-g0-s1-progress-clip'),
        `Partial dot render uses deterministic progress clip`
      )
      assert(
        partialSvg.includes('clip-path="url(#candidate-dot-partial-mask-g0-s1-progress-clip)"'),
        `Dot mask stamps are clipped to traveled progress at partial time`
      )

      const dotStampLayerMatch = partialSvg.match(/<g class="dot-mask-stamps"[^>]*>([\s\S]*?)<\/g>/)
      const dotStampAxes = dotStampLayerMatch
        ? Array.from(
            dotStampLayerMatch[1].matchAll(/<rect[^>]* x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)
          ).map((m) => ({
            width: Number(m[3]),
            height: Number(m[4])
          }))
        : []
      const widestDotAxis = Math.max(...dotStampAxes.flatMap((axis) => [axis.width, axis.height]))
      const widestDotBrush = Math.max(...dotStampAxes.map((axis) => axis.width))
      assert(dotStampAxes.length > 0, `Partial dot render emits dot mask brush stamps`)
      assert(
        widestDotAxis >= 100,
        `Dot mask brush height is 100 units for vertical fill (max axis ${widestDotAxis})`
      )
      assert(
        widestDotBrush <= 8,
        `Dot mask brush width stays narrow to avoid sideways overpainting (max width ${widestDotBrush})`
      )
      assert(
        !completeSvg.includes('dot-progress-clip'),
        `Complete dot render removes progress clip for full TrueType fill`
      )
    }
  }

  // -------------------------------------------------------------
  // TEST 8: Ligatures & Extended Contexts (لا, قراءة, بيئة)
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Ligatures & Extended Contexts ---')
  for (const word of ['لا', 'قراءة', 'بيئة']) {
    const comp = composeText(word)
    const timeline = buildTimeline(comp.glyphs)
    const svg = renderSvg(comp.glyphs, timeline, timeline.totalDurationMs)
    assert(comp.isFullySupported === true, `"${word}" is fully supported`)
    assert(svg.includes('id="word-group"'), `"${word}" generated complete SVG stage`)
  }

  // -------------------------------------------------------------
  // TEST 9: Formerly Unsupported Arabic Coverage (شمس)
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Formerly Unsupported Arabic Coverage (شمس) ---')
  const compShams = composeText('شمس')
  assert(compShams.isFullySupported === true, `"شمس" is fully supported without fallback`)
  assert(compShams.unsupportedCount === 0, `"شمس" has no unsupported glyphs`)
  assert(
    compShams.glyphs.every((glyph) => glyph.orderedStrokes.length > 0),
    `Every shaped "شمس" glyph has animated strokes`
  )
  assert(
    compShams.glyphs.every((glyph) => glyph.definition?.provenance !== 'unverified_fallback'),
    `"شمس" resolves without unverified fallback geometry`
  )

  const timelineShams = buildTimeline(compShams.glyphs)
  const svgShams = renderSvg(compShams.glyphs, timelineShams, timelineShams.totalDurationMs)
  assert(svgShams.includes('class="ink-outline"'), `"شمس" renders canonical ink`)

  // -------------------------------------------------------------
  // TEST 10: Long Marked Word Replay Coverage
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Long Marked Word Replay Coverage ---')
  const stressWord = 'مُسْتَشَارَاتِيُّونَ'
  const compStress = composeText(stressWord)
  assert(compStress.isFullySupported === true, `"${stressWord}" has no unsupported glyphs`)
  assert(compStress.unsupportedCount === 0, `"${stressWord}" has zero skipped glyphs`)
  assert(
    compStress.glyphs.some(
      (glyph) => glyph.glyphId === 80 && glyph.definition?.provenance === 'canonical_runtime'
    ),
    `"${stressWord}" resolves isolated noon GID 80 canonically`
  )
  assert(
    compStress.glyphs.some((glyph) => glyph.glyphId === 281 && glyph.semanticRole === 'dot'),
    `"${stressWord}" keeps the noon dot as a separate mark`
  )
  const stressTimeline = buildTimeline(compStress.glyphs)
  assert(stressTimeline.steps.length > 0, `"${stressWord}" produces replayable timeline steps`)

  // -------------------------------------------------------------
  // TEST 11: Strict Byte-Identical SVG Determinism
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Strict Byte-Identical SVG Determinism ---')
  const compDet = composeText('مُحَمَّد')
  const timelineDet = buildTimeline(compDet.glyphs)

  const svgRun1 = renderSvg(compDet.glyphs, timelineDet, 1250)
  const svgRun2 = renderSvg(compDet.glyphs, timelineDet, 1250)
  const svgRun3 = renderSvg(compDet.glyphs, timelineDet, 1250)

  assert(svgRun1 === svgRun2, `Run 1 and Run 2 produced byte-identical SVG strings`)
  assert(svgRun2 === svgRun3, `Run 2 and Run 3 produced byte-identical SVG strings`)

  const hashRun1 = crypto.createHash('sha256').update(svgRun1).digest('hex')
  const hashRun2 = crypto.createHash('sha256').update(svgRun2).digest('hex')
  assert(hashRun1 === hashRun2, `SVG SHA-256 hash is deterministic (${hashRun1})`)
  assert(svgRun1.includes('mask-g0-s0'), `Mask IDs are deterministic and session-independent`)

  // -------------------------------------------------------------
  // TEST 12: Frozen Datasets SHA-256 Integrity
  // -------------------------------------------------------------
  console.log('\n--- TEST 11: Frozen Datasets SHA-256 Integrity ---')
  const EXPECTED_GOLDEN_HASH = '7cb3754490ba7e1a5dcf4c719d53659a9b1db4650ba194493781f193802731a0'
  const EXPECTED_CANDIDATE_HASH = 'd3d101f42fb3697fa1b7b856213e9593bad1070e6e27a51eff9a0c4f4c39b751'

  const actualGoldenHash = sha256('data/golden/verified-reference.json')
  assert(
    actualGoldenHash === EXPECTED_GOLDEN_HASH,
    `Golden reference SHA-256 is unchanged (${actualGoldenHash.slice(0, 16)}...)`
  )

  const actualCandidateHash = sha256('data/tegaki/candidates/arabic-strokes.candidates.json')
  assert(
    actualCandidateHash === EXPECTED_CANDIDATE_HASH,
    `Candidate dataset SHA-256 is unchanged (${actualCandidateHash.slice(0, 16)}...)`
  )

  const actualRuntimeCandidateHash = sha256(
    'src/renderer/src/assets/candidates/arabic-strokes.candidates.json'
  )
  assert(
    actualRuntimeCandidateHash === EXPECTED_CANDIDATE_HASH,
    `Runtime candidate copy SHA-256 is unchanged (${actualRuntimeCandidateHash.slice(0, 16)}...)`
  )

  // -------------------------------------------------------------
  // TEST 13: App.css Untouched Integrity
  // -------------------------------------------------------------
  console.log('\n--- TEST 12: App.css Untouched Integrity ---')
  const appCssPath = 'src/renderer/src/App.css'
  assert(fs.existsSync(appCssPath), `App.css exists`)
  const appCssContent = fs.readFileSync(appCssPath, 'utf8')
  assert(appCssContent.includes('.ghost-outline'), `App.css preserves .ghost-outline`)
  assert(appCssContent.includes('.ink-outline'), `App.css preserves .ink-outline`)
  assert(appCssContent.includes('.mask-base'), `App.css preserves .mask-base`)
  assert(appCssContent.includes('.body-mask-stamps'), `App.css preserves .body-mask-stamps`)

  const studioViewSource = fs.readFileSync('src/renderer/src/components/StudioView.jsx', 'utf8')
  assert(
    studioViewSource.includes('const [showFullPreview, setShowFullPreview] = useState(false)'),
    `Studio board initial state starts at zero ink progress`
  )
  assert(
    studioViewSource.includes('xmlns:xlink="http://www.w3.org/1999/xlink"'),
    `Standalone export SVG declares the xlink namespace used by SVG use elements`
  )
  assert(
    !studioViewSource.includes('setShowFullPreview(true)'),
    `Studio board does not force the full ink layer before playback`
  )
  assert(
    studioViewSource.includes('const canvasPixelScale = 1'),
    `Animated exports rasterize at the selected output resolution without redundant 2x oversampling`
  )

  // -------------------------------------------------------------
  // TEST 14: Animation Clock and Cursor Regression Guard
  // -------------------------------------------------------------
  console.log('\n--- TEST 13: Animation Clock and Cursor Regression Guard ---')
  const animationEngineSource = fs.readFileSync(
    'src/renderer/src/engine/animation/animation-engine.ts',
    'utf8'
  )
  assert(
    !animationEngineSource.includes('Math.min(Math.max(rawDelta, 0), 33)'),
    `Animation clock does not reintroduce the 33ms slow-frame clamp`
  )
  assert(
    animationEngineSource.includes('private stepCursor'),
    `Animation engine retains its bidirectional timeline cursor`
  )
  const tegakiBoardSource = fs.readFileSync(
    'src/renderer/src/components/TegakiBoard.jsx',
    'utf8'
  )
  assert(
    tegakiBoardSource.includes('const isReplayStart ='),
    `Live board explicitly detects replay from the completed timeline`
  )
  assert(
    tegakiBoardSource.includes('activeStrokeCursorRef.current = 0'),
    `Live board resets its active stroke cursor before replay synchronization`
  )
  assert(
    tegakiBoardSource.includes('sd.stampGroup.replaceChildren(headGroup)'),
    `Live board reattaches each head stamp after clearing a replay mask`
  )
  assert(
    tegakiBoardSource.includes("fill(showFullPreview ? 999999 : -1)"),
    `Live board tracks an empty mask with a distinct pre-stamp cursor`
  )
  assert(
    studioViewSource.includes('currentEngineState.isComplete'),
    `Play control explicitly resets a completed timeline before replay`
  )

  // -------------------------------------------------------------
  // TEST 15: Trusted Geometry Source Verification (Zero Legacy Access)
  // -------------------------------------------------------------
  console.log('\n--- TEST 14: Trusted Geometry Source Verification ---')
  const svgRendererPath = 'src/renderer/src/engine/renderer/svg-renderer.ts'
  const svgRendererSource = fs.readFileSync(svgRendererPath, 'utf8')
  assert(
    !svgRendererSource.includes('fixture_db'),
    `svg-renderer.ts has ZERO references to fixture_db`
  )
  assert(
    !svgRendererSource.includes('shaping_fixture'),
    `svg-renderer.ts has ZERO references to shaping_fixture`
  )
  assert(
    !svgRendererSource.includes('../data/stroke-db'),
    `svg-renderer.ts has ZERO imports from legacy stroke-db`
  )
  assert(
    svgRendererSource.includes('../data/stroke-registry'),
    `svg-renderer.ts imports trusted stroke-registry types`
  )

  console.log('\n=================================================================')
  console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`)
  console.log('=================================================================')

  if (failedChecks > 0) {
    process.exit(1)
  }
}

runPhase3Tests().catch((err) => {
  console.error('Test run failed:', err)
  process.exit(1)
})
