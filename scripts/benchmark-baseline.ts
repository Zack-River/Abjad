import { composeText } from '../src/renderer/src/engine/composition/glyph-composer'
import { buildTimeline } from '../src/renderer/src/engine/animation/animation-engine'
import { renderSvg } from '../src/renderer/src/engine/renderer/svg-renderer'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'

/**
 * Phase 0 Historical Baseline Benchmark.
 * Simulates unprepared rendering by calling renderSvg without a cached scene,
 * forcing per-frame viewport bounds calculation, step-matching, and full DOM assembly.
 */
async function runBaselineBenchmark(): Promise<void> {
  await initHarfBuzz()

  const words = ['أبجد', 'مدرسة', 'مستشفى', 'اللَّٰهُ']
  console.log('=================================================================')
  console.log('PHASE 0 BASELINE BENCHMARK: UNPREPARED RENDERING')
  console.log('=================================================================')
  console.log(
    '| Word | Glyphs | Steps | Avg SVG Size (KB) | Completed SVG (KB) | Avg Render Time (ms) | 100% Render Time (ms) |'
  )
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')

  for (const word of words) {
    const comp = composeText(word)
    const timeline = buildTimeline(comp.glyphs)

    const samples = [0, 0.25, 0.5, 0.75, 1.0]
    let totalTime = 0
    let finalTime = 0
    let totalSize = 0
    let finalSvg = ''

    // Measure unprepared renderSvg calls (recomputing scene per call)
    const iterations = 20
    for (let i = 0; i < iterations; i++) {
      for (const s of samples) {
        const progressMs = timeline.totalDurationMs * s
        const t0 = performance.now()
        // Calling renderSvg without cachedScene forces full recomputation
        const svg = renderSvg(comp.glyphs, timeline, progressMs, 'baseline', {
          stageWidth: 800,
          stageHeight: 380,
          includeMedianLayer: true // Baseline originally included median layer
        })
        const dt = performance.now() - t0
        totalTime += dt
        totalSize += svg.length
        if (s === 1.0) {
          finalTime += dt
          finalSvg = svg
        }
      }
    }

    const avgRenderTimeMs = (totalTime / (iterations * samples.length)).toFixed(2)
    const finalRenderTimeMs = (finalTime / iterations).toFixed(2)
    const avgSvgSizeKb = (totalSize / (iterations * samples.length * 1024)).toFixed(1)
    const completedSizeKb = (finalSvg.length / 1024).toFixed(1)

    console.log(
      `| ${word} | ${comp.glyphs.length} | ${timeline.steps.length} | ${avgSvgSizeKb} KB | ${completedSizeKb} KB | ${avgRenderTimeMs} ms | ${finalRenderTimeMs} ms |`
    )
  }
  console.log('=================================================================')
}

runBaselineBenchmark().catch(console.error)
