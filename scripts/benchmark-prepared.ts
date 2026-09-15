import { composeText } from '../src/renderer/src/engine/composition/glyph-composer'
import { buildTimeline } from '../src/renderer/src/engine/animation/animation-engine'
import {
  prepareRenderScene,
  renderSvgFrame
} from '../src/renderer/src/engine/renderer/svg-renderer'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'

async function runPreparedBenchmark(): Promise<void> {
  await initHarfBuzz()

  const words = ['أبجد', 'مدرسة', 'مستشفى', 'اللَّٰهُ']
  console.log(
    '| Word | Glyphs | Steps | Prepare Time (ms) | Avg Frame Time (ms) | 100% Frame Time (ms) | Completed SVG (KB) | Reduction vs Baseline |'
  )
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')

  const baselineSizes: Record<string, number> = {
    أبجد: 221.2,
    مدرسة: 316.0,
    مستشفى: 490.0,
    اللَّٰهُ: 49.4
  }

  for (const word of words) {
    const comp = composeText(word)
    const timeline = buildTimeline(comp.glyphs)

    // Measure prepareRenderScene once
    const tPrep0 = performance.now()
    const scene = prepareRenderScene(comp.glyphs, timeline, 'bench')
    const tPrep1 = performance.now()
    const prepTimeMs = (tPrep1 - tPrep0).toFixed(2)

    // Measure frame renders
    const samples = [0, 0.25, 0.5, 0.75, 1.0]
    let totalFrameTime = 0
    let finalFrameTime = 0
    let finalSvg = ''

    const iterations = 100
    for (let i = 0; i < iterations; i++) {
      for (const s of samples) {
        const t0 = performance.now()
        const svg = renderSvgFrame(scene, timeline.totalDurationMs * s)
        const dt = performance.now() - t0
        totalFrameTime += dt
        if (s === 1.0) {
          finalFrameTime += dt
          finalSvg = svg
        }
      }
    }

    const avgFrameTimeMs = (totalFrameTime / (iterations * samples.length)).toFixed(2)
    const finalFrameTimeMs = (finalFrameTime / iterations).toFixed(2)
    const completedSizeKb = (finalSvg.length / 1024).toFixed(1)
    const baseline = baselineSizes[word] || Number(completedSizeKb)
    const reduction = `${(((baseline - Number(completedSizeKb)) / baseline) * 100).toFixed(1)}%`

    console.log(
      `| ${word} | ${comp.glyphs.length} | ${timeline.steps.length} | ${prepTimeMs} ms | ${avgFrameTimeMs} ms | ${finalFrameTimeMs} ms | ${completedSizeKb} KB | -${reduction} |`
    )
  }
}

runPreparedBenchmark().catch(console.error)
