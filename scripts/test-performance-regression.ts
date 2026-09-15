import assert from 'node:assert'
import { composeText } from '../src/renderer/src/engine/composition/glyph-composer'
import { buildTimeline } from '../src/renderer/src/engine/animation/animation-engine'
import {
  prepareRenderScene,
  renderSvgFrame,
  RenderOptions
} from '../src/renderer/src/engine/renderer/svg-renderer'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'

const TEST_WORDS = [
  { word: 'أبجد', maxFrameMs: 5, maxSvgKb: 150 },
  { word: 'مدرسة', maxFrameMs: 5, maxSvgKb: 200 },
  { word: 'مستشفى', maxFrameMs: 5, maxSvgKb: 300 },
  { word: 'اللَّٰهُ', maxFrameMs: 2, maxSvgKb: 40 }
]

async function runRegressionValidation(): Promise<void> {
  await initHarfBuzz()

  console.log('=================================================================')
  console.log('PHASE 5 PERFORMANCE REGRESSION & BUDGET VALIDATION')
  console.log('=================================================================')

  let allPassed = true

  for (const { word, maxFrameMs, maxSvgKb } of TEST_WORDS) {
    const comp = composeText(word)
    const timeline = buildTimeline(comp.glyphs)
    const options: RenderOptions = {
      stageWidth: 800,
      stageHeight: 380,
      showBaseline: true,
      strokeWeight: 80,
      includeMedianLayer: false
    }

    const prepStart = performance.now()
    const scene = prepareRenderScene(comp.glyphs, timeline, `test-${word}`, options)
    const prepTime = performance.now() - prepStart

    // Test 1: No median layer in production by default
    const frame0 = renderSvgFrame(scene, 0)
    assert(
      !frame0.includes('id="median-layer"'),
      `Expected no median layer in default frame for ${word}`
    )

    // Test 2: Outline deduplication in defs
    assert(frame0.includes('<defs>'), `Expected defs in SVG for ${word}`)
    assert(
      frame0.includes('<use href="#test-'),
      `Expected use tags referencing defs outlines in ${word}`
    )

    // Test 3: Frame render times across 10 sample points
    const frameTimes: number[] = []
    for (let i = 0; i <= 10; i++) {
      const progress = (i / 10) * (timeline.totalDurationMs || 1000)
      const start = performance.now()
      const svg = renderSvgFrame(scene, progress)
      const time = performance.now() - start
      frameTimes.push(time)

      // No NaNs or infinities in SVG coordinates
      assert(!svg.includes('NaN'), `SVG must not contain NaN for ${word} at progress ${progress}`)
      assert(
        !svg.includes('Infinity'),
        `SVG must not contain Infinity for ${word} at progress ${progress}`
      )
    }

    const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
    const maxTime = Math.max(...frameTimes)

    // Test 4: Final SVG size budget
    const finalSvg = renderSvgFrame(scene, timeline.totalDurationMs)
    const finalSizeKb = Buffer.byteLength(finalSvg, 'utf8') / 1024

    const avgPassed = avgTime <= maxFrameMs
    const maxPassed = maxTime <= maxFrameMs * 1.8
    const sizePassed = finalSizeKb <= maxSvgKb

    console.log(`\nWord: "${word}" (${comp.glyphs.length} glyphs, ${timeline.steps.length} steps)`)
    console.log(`  Prep Time: ${prepTime.toFixed(2)} ms`)
    console.log(
      `  Avg Frame Time: ${avgTime.toFixed(2)} ms (Budget: <= ${maxFrameMs} ms) -> ${avgPassed ? '✅ PASS' : '❌ FAIL'}`
    )
    console.log(
      `  Max Frame Time: ${maxTime.toFixed(2)} ms (Budget: <= ${(maxFrameMs * 1.8).toFixed(1)} ms) -> ${maxPassed ? '✅ PASS' : '❌ FAIL'}`
    )
    console.log(
      `  Final SVG Size: ${finalSizeKb.toFixed(1)} KB (Budget: <= ${maxSvgKb} KB) -> ${sizePassed ? '✅ PASS' : '❌ FAIL'}`
    )

    if (!avgPassed || !maxPassed || !sizePassed) {
      allPassed = false
    }
  }

  console.log('\n=================================================================')
  if (allPassed) {
    console.log('✅ ALL PHASE 5 PERFORMANCE BUDGETS & REGRESSION CHECKS PASSED!')
  } else {
    console.error('❌ SOME PERFORMANCE BUDGETS FAILED.')
    process.exit(1)
  }
  console.log('=================================================================')
}

runRegressionValidation().catch((err) => {
  console.error('Validation failed:', err)
  process.exit(1)
})
