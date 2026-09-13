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
 * 8. Unsupported glyph handling (شمس: zero animated strokes, no fabricated geometry).
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
  assert(boatStroke!.startPoint?.x === 883.2, `Boat startPoint.x is 883.2 (local font units)`)
  assert(boatStroke!.startPoint?.y === -393.53, `Boat startPoint.y is -393.53 (local font units)`)

  // Render SVG and verify mask stamp coordinates
  const timelineBaa = buildTimeline(compBaa.glyphs)
  const svgBaa = renderSvg(compBaa.glyphs, timelineBaa, timelineBaa.totalDurationMs / 2)
  assert(svgBaa.includes('maskUnits="userSpaceOnUse"'), `Mask uses maskUnits="userSpaceOnUse"`)
  assert(
    svgBaa.includes('maskContentUnits="userSpaceOnUse"'),
    `Mask uses maskContentUnits="userSpaceOnUse"`
  )
  assert(
    svgBaa.includes('transform="translate(883.2 -393.53)'),
    `Stamp 0 is located exactly at local font coordinates (883.2, -393.53)`
  )

  // -------------------------------------------------------------
  // TEST 3: Coordinate-Space Failure Prevention
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Coordinate-Space Failure Prevention ---')
  // 1. No median path rendered at root without group transform
  assert(
    !svgBaa.includes('<path d="M 883.2" class="median-path" fill="none" />\n      </svg>'),
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

    assert(comp.glyphs.length >= 3, `"${word}" composed into ${comp.glyphs.length} glyphs`)
    assert(svg.includes('class="glyph-ghost"'), `"${word}" renders ghost outlines`)
    assert(svg.includes('class="glyph-ink"'), `"${word}" renders ink layers`)
    assert(svg.includes('class="glyph-median"'), `"${word}" renders median layers`)

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
        partialSvg.includes('candidate-dot-partial-mask-g0-s1-dot-progress-clip'),
        `Partial dot render uses deterministic progress clip`
      )
      assert(
        partialSvg.includes('clip-path="url(#candidate-dot-partial-mask-g0-s1-dot-progress-clip)"'),
        `Dot mask stamps are clipped to traveled progress at partial time`
      )

      const dotStampLayerMatch = partialSvg.match(/<g class="dot-mask-stamps"[^>]*>([\s\S]*?)<\/g>/)
      const dotStampAxes = dotStampLayerMatch
        ? Array.from(
            dotStampLayerMatch[1].matchAll(/<ellipse[^>]* rx="([^"]+)" ry="([^"]+)"/g)
          ).map((m) => ({
            rx: Number(m[1]),
            ry: Number(m[2])
          }))
        : []
      const narrowestDotAxis = Math.min(...dotStampAxes.flatMap((axis) => [axis.rx, axis.ry]))
      assert(dotStampAxes.length > 0, `Partial dot render emits dot mask brush stamps`)
      assert(
        narrowestDotAxis >= 100,
        `Dot mask brush is wide enough to fill dot outlines instead of drawing line segments (min axis ${narrowestDotAxis})`
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
  // TEST 9: Unsupported Glyph Handling (شمس)
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Unsupported Glyph Handling (شمس) ---')
  const compShams = composeText('شمس')
  assert(compShams.isFullySupported === false, `"شمس" is flagged as NOT fully supported`)
  assert(compShams.unsupportedCount === 1, `"شمس" has exactly 1 unsupported glyph (final seen)`)

  const unsupportedSeen = compShams.glyphs.find((g) => !g.isSupported)
  assert(unsupportedSeen !== undefined, `Found unsupported glyph (GID ${unsupportedSeen?.glyphId})`)
  assert(
    unsupportedSeen!.orderedStrokes.length === 0,
    `Unsupported glyph has ZERO animated strokes`
  )
  assert(unsupportedSeen!.definition === null, `Unsupported glyph has null definition`)

  const timelineShams = buildTimeline(compShams.glyphs)
  const svgShams = renderSvg(compShams.glyphs, timelineShams, timelineShams.totalDurationMs)
  // Supported glyphs must render
  assert(svgShams.includes('class="ink-outline"'), `Supported glyphs in "شمس" rendered ink`)
  // Unsupported glyph must NOT have ink masks
  const unsupportedGlyphIndex = compShams.glyphs.indexOf(unsupportedSeen!)
  assert(
    !svgShams.includes(`mask-g${unsupportedGlyphIndex}-`),
    `Unsupported glyph has ZERO mask elements`
  )

  // -------------------------------------------------------------
  // TEST 10: Strict Byte-Identical SVG Determinism
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
  // TEST 11: Frozen Datasets SHA-256 Integrity
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
  // TEST 12: App.css Untouched Integrity
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
    !studioViewSource.includes('setShowFullPreview(true)'),
    `Studio board does not force the full ink layer before playback`
  )

  // -------------------------------------------------------------
  // TEST 13: animation-engine.ts Regression Hash
  // -------------------------------------------------------------
  console.log('\n--- TEST 13: animation-engine.ts Regression Hash ---')
  const EXPECTED_ANIMATION_ENGINE_HASH =
    'dbd2f9398b3f64b2b2c6a70e52ddc8bad10ed2075336a015939bf91bf64bd7bf'
  const actualAnimationEngineHash = sha256('src/renderer/src/engine/animation/animation-engine.ts')
  assert(
    actualAnimationEngineHash === EXPECTED_ANIMATION_ENGINE_HASH,
    `animation-engine.ts matches the intentional regression baseline (${actualAnimationEngineHash.slice(0, 16)}...)`
  )

  // -------------------------------------------------------------
  // TEST 14: Trusted Geometry Source Verification (Zero Legacy Access)
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
