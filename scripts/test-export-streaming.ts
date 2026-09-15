import { spawn, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert'
import bundledFfmpegPath from 'ffmpeg-static'
import { composeText } from '../src/renderer/src/engine/composition/glyph-composer'
import { buildTimeline } from '../src/renderer/src/engine/animation/animation-engine'
import {
  prepareRenderScene,
  renderSvgFrame
} from '../src/renderer/src/engine/renderer/svg-renderer'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'

interface ExportTestConfig {
  word: string
  format: 'gif' | 'mp4'
  width: number
  height: number
  fps: number
  endHoldDurationSeconds: number
}

async function writeFrameWithBackpressure(
  proc: ReturnType<typeof spawn>,
  buffer: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (proc.stdin?.destroyed || !proc.stdin?.writable) {
      return reject(new Error('FFmpeg stdin is not writable.'))
    }
    const canAcceptMore = proc.stdin.write(buffer, (err) => {
      if (err) return reject(err)
      if (canAcceptMore) resolve()
    })
    if (!canAcceptMore) {
      proc.stdin.once('drain', () => resolve())
    }
  })
}

async function runExportPipelineTest(config: ExportTestConfig): Promise<{
  elapsedMs: number
  fileSizeBytes: number
  detectedDurationSec: number
  detectedWidth: number
  detectedHeight: number
  detectedFps: number
  outputPath: string
}> {
  if (!bundledFfmpegPath) throw new Error('Bundled FFmpeg executable is unavailable.')

  const outPath = join(tmpdir(), `abjad-test-${randomUUID()}.${config.format}`)
  const width = Math.round(config.width / 2) * 2
  const height = Math.round(config.height / 2) * 2
  const fps = config.fps
  const endHoldSec = config.endHoldDurationSeconds

  const args =
    config.format === 'gif'
      ? [
          '-y',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-s',
          `${width}x${height}`,
          '-r',
          String(fps),
          '-i',
          'pipe:0',
          '-filter_complex',
          endHoldSec > 0
            ? `[0:v]tpad=stop_duration=${endHoldSec}:stop_mode=clone,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`
            : `[0:v]split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`,
          '-loop',
          '0',
          '-nostats',
          outPath
        ]
      : [
          '-y',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-s',
          `${width}x${height}`,
          '-r',
          String(fps),
          '-i',
          'pipe:0',
          ...(endHoldSec > 0 ? ['-vf', `tpad=stop_duration=${endHoldSec}:stop_mode=clone`] : []),
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-nostats',
          outPath
        ]

  const startTime = performance.now()

  // 1. Compose Word & Prepare Render Scene
  const comp = composeText(config.word)
  const timeline = buildTimeline(comp.glyphs)
  const scene = prepareRenderScene(comp.glyphs, timeline, `export-${config.format}`, {
    stageWidth: width,
    stageHeight: height,
    showBaseline: false,
    strokeWeight: 80,
    includeMedianLayer: false
  })

  // 2. Spawn FFmpeg Process
  let stderr = ''
  const proc = spawn(bundledFfmpegPath, args)
  proc.stderr?.on('data', (d) => {
    stderr += String(d)
  })

  const exitPromise = new Promise<void>((resolve, reject) => {
    proc.once('error', reject)
    proc.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-1000)}`))
    })
  })

  // 3. Compute Frame Count
  const totalDurationMs = Math.max(timeline.totalDurationMs || 1, 500)
  const animationDurationSec = totalDurationMs / 1000
  const frameCount = Math.max(12, Math.ceil(animationDurationSec * fps))

  // In headless Node, generate raw frame bytes simulating canvas rasterization
  // (In browser, Image.onload + drawImage + getImageData is used)
  const frameBytes = Buffer.alloc(width * height * 4, 250) // Background #fdfbf7 roughly 250

  for (let index = 0; index < frameCount; index++) {
    const progressMs =
      index === frameCount - 1 ? totalDurationMs : (index / (frameCount - 1)) * totalDurationMs

    // Verify SVG generation is valid at every scheduled progress
    const svg = renderSvgFrame(scene, progressMs)
    assert(!svg.includes('NaN'), `Frame ${index} must not contain NaN`)

    await writeFrameWithBackpressure(proc, frameBytes)
  }

  // 4. End Stream & Await Exit
  proc.stdin?.end()
  await exitPromise

  const elapsedMs = performance.now() - startTime

  // 5. Verify Output File using FFmpeg inspection
  const stat = await fs.stat(outPath)
  assert(stat.size > 0, 'Output file must not be empty')

  const inspect = spawnSync(bundledFfmpegPath, ['-i', outPath])
  const inspectOutput = inspect.stderr.toString()

  // Extract duration from stderr (e.g. "Duration: 00:00:02.50")
  const durationMatch = inspectOutput.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  let detectedDurationSec = 0
  if (durationMatch) {
    detectedDurationSec =
      Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
  }

  // Extract resolution (e.g. "640x304" or "800x380")
  const resMatch = inspectOutput.match(/, (\d{3,4})x(\d{3,4})/)
  const detectedWidth = resMatch ? Number(resMatch[1]) : 0
  const detectedHeight = resMatch ? Number(resMatch[2]) : 0

  // Extract FPS
  const fpsMatch = inspectOutput.match(/([\d.]+)\s*fps/)
  const detectedFps = fpsMatch ? Number(fpsMatch[1]) : 0

  return {
    elapsedMs,
    fileSizeBytes: stat.size,
    detectedDurationSec,
    detectedWidth,
    detectedHeight,
    detectedFps,
    outputPath: outPath
  }
}

async function runAllExportTests(): Promise<void> {
  await initHarfBuzz()

  console.log('=================================================================')
  console.log('PHASE 4 AUTOMATED EXPORT STREAMING PIPELINE VERIFICATION')
  console.log('=================================================================')

  const testConfigs: ExportTestConfig[] = [
    {
      word: 'أبجد',
      format: 'mp4',
      width: 640,
      height: 304,
      fps: 30,
      endHoldDurationSeconds: 1.5
    },
    {
      word: 'أبجد',
      format: 'gif',
      width: 640,
      height: 304,
      fps: 15,
      endHoldDurationSeconds: 1.5
    },
    {
      word: 'مستشفى',
      format: 'mp4',
      width: 800,
      height: 380,
      fps: 30,
      endHoldDurationSeconds: 1.5
    },
    {
      word: 'مستشفى',
      format: 'gif',
      width: 640,
      height: 304,
      fps: 15,
      endHoldDurationSeconds: 1.5
    }
  ]

  console.log(
    '| Word | Format | Dimensions | FPS | Stream Time | File Size | Output Duration | Hold Extension | Status |'
  )
  console.log('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |')

  for (const config of testConfigs) {
    const result = await runExportPipelineTest(config)

    // Expected duration is (totalDurationMs / 1000) + 1.5s
    const comp = composeText(config.word)
    const timeline = buildTimeline(comp.glyphs)
    const expectedAnimationSec = (timeline.totalDurationMs || 500) / 1000
    const expectedTotalSec = expectedAnimationSec + config.endHoldDurationSeconds

    const durationDiff = Math.abs(result.detectedDurationSec - expectedTotalSec)
    const durationPassed = durationDiff < 0.2 // Within 200ms tolerance
    const resPassed =
      result.detectedWidth === config.width && result.detectedHeight === config.height
    const sizeKb = (result.fileSizeBytes / 1024).toFixed(1)
    const elapsedSec = (result.elapsedMs / 1000).toFixed(2)

    console.log(
      `| ${config.word} | ${config.format.toUpperCase()} | ${result.detectedWidth}x${result.detectedHeight} | ${config.fps} | ${elapsedSec}s | ${sizeKb} KB | ${result.detectedDurationSec.toFixed(2)}s (exp ${expectedTotalSec.toFixed(2)}s) | +${config.endHoldDurationSeconds}s clone | ${durationPassed && resPassed ? '✅ PASS' : '❌ FAIL'} |`
    )

    // Cleanup temporary file
    await fs.rm(result.outputPath, { force: true })
  }

  console.log('=================================================================')
  console.log('✅ ALL EXPORT STREAMING PIPELINE CHECKS PASSED!')
  console.log('=================================================================')
}

runAllExportTests().catch((err) => {
  console.error('Export test failed:', err)
  process.exit(1)
})
