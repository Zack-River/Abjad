import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Canvg } from 'canvg'
import {
  Download,
  FolderOpen,
  Info,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  Palette,
  Pencil,
  Play,
  Repeat2,
  RotateCcw,
  Settings,
  SkipForward
} from 'lucide-react'
import TegakiBoard from './TegakiBoard'
import { setupEngine, renderSvg, initHarfBuzz, harfbuzzService } from '../engine'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeDownloadName(value) {
  return (
    String(value)
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'arabic-calligraphy'
  )
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildStandaloneSvg(svgBody, strokeColor, width = 800, height = 380, raster = false) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .baseline { stroke: rgba(15, 118, 110, 0.2); stroke-dasharray: 6 4; }
      .ghost-outline { fill: #cbd5e1; opacity: 0.45; }
      .ghost-outline.unsupported { fill: #94a3b8; opacity: 0.3; }
      .ink-outline { fill: ${strokeColor};${raster ? '' : ' filter: drop-shadow(0 2px 4px rgba(15, 118, 110, 0.18));'} }
      .median-path { display: none; }
    </style>
  </defs>
  ${svgBody.replace(/<svg[^>]*>/, '').replace(/<\/svg>$/, '')}
</svg>`
}

function stripRasterFilters(svgMarkup) {
  return svgMarkup
    .replace(/\sfilter="url\([^\"]+\)"/g, '')
    .replace(/\sfilter="drop-shadow\([^\"]+\)"/g, '')
}

function nativeSvgToCanvas(svgMarkup, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas rendering is unavailable.'))
        return
      }
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      resolve(canvas)
    }
    image.onerror = () => reject(new Error('Native SVG rasterization failed.'))
    image.src = url
  })
}

function hasVisibleInk(canvas, strokeColor) {
  if (!strokeColor?.startsWith('#')) return false
  const expected = strokeColor.slice(1)
  if (expected.length !== 6) return false
  const red = Number.parseInt(expected.slice(0, 2), 16)
  const green = Number.parseInt(expected.slice(2, 4), 16)
  const blue = Number.parseInt(expected.slice(4, 6), 16)
  const context = canvas.getContext('2d')
  if (!context) return false
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    if (
      alpha > 180 &&
      Math.abs(pixels[index] - red) < 28 &&
      Math.abs(pixels[index + 1] - green) < 28 &&
      Math.abs(pixels[index + 2] - blue) < 28
    ) {
      return true
    }
  }
  return false
}

async function svgToCanvas(
  svgMarkup,
  width = 800,
  height = 380,
  strokeColor,
  expectInk = false
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')

  context.clearRect(0, 0, width, height)

  const rasterSvg = stripRasterFilters(svgMarkup)
  try {
    const nativeCanvas = await nativeSvgToCanvas(rasterSvg, width, height)
    if (!expectInk || hasVisibleInk(nativeCanvas, strokeColor)) return nativeCanvas
  } catch {
    // Fall through to the canonical mask renderer.
  }

  const renderer = await Canvg.fromString(context, rasterSvg, {
    ignoreAnimation: true,
    ignoreMouse: true
  })
  await renderer.render()
  renderer.stop()
  return canvas
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function recordAnimation(renderFrame, durationMs, fps, width, height, onProgress, isCancelled) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const stream = canvas.captureStream(fps)
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const stopped = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Animation recording failed.'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  recorder.start()
  // Keep enough samples for short, accelerated exports so the final completed
  // frame is recorded instead of jumping from an early partial frame to stop.
  const frameCount = Math.max(12, Math.ceil((durationMs / 1000) * fps))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')

  for (let index = 0; index < frameCount; index += 1) {
    if (isCancelled?.()) {
      recorder.stop()
      await stopped
      const error = new Error('Export cancelled.')
      error.name = 'ExportCancelled'
      throw error
    }
    const progressMs = index === frameCount - 1 ? durationMs : (index / (frameCount - 1)) * durationMs
    const frame = await renderFrame(progressMs)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(frame, 0, 0)
    onProgress?.((index + 1) / frameCount)
    await wait(1000 / fps)
  }

  if (isCancelled?.()) {
    recorder.stop()
    await stopped
    const error = new Error('Export cancelled.')
    error.name = 'ExportCancelled'
    throw error
  }

  // Let MediaRecorder capture the completed final canvas state.
  await wait(Math.max(80, 1000 / fps))
  recorder.stop()
  return stopped
}

const ANIMATED_EXPORT_SETTINGS = {
  gif: { fps: 8, width: 640, height: 304, speed: 1 },
  mp4: { fps: 12, width: 800, height: 380, speed: 1 }
}

const EXPORT_RESOLUTIONS = [
  { id: 'compact', label: 'مضغوط', width: 640, height: 304 },
  { id: 'standard', label: 'قياسي', width: 800, height: 380 },
  { id: 'high', label: 'عالٍ', width: 1280, height: 608 }
]

const EXPORT_SPEEDS = [
  { value: 0.5, label: 'بطيء جدًا (0.5x)' },
  { value: 0.75, label: 'بطيء (0.75x)' },
  { value: 1, label: 'افتراضي (1x)' },
  { value: 1.5, label: 'سريع (1.5x)' },
  { value: 2, label: 'سريع جدًا (2x)' }
]
import './StudioView.css'

const COLOR_SWATCHES = [
  { id: 'teal', value: '#0f766e', label: 'زيتي كلاسيكي' },
  { id: 'orange', value: '#ea580c', label: 'عنبري' },
  { id: 'navy', value: '#1e3a8a', label: 'كحلي داكن' },
  { id: 'blue', value: '#3b82f6', label: 'سماوي' }
]

function segmentArabicElements(value) {
  const text = value.trim()
  const clusters = []
  let i = 0

  while (i < text.length) {
    const clusterStart = i
    let char = text[i]
    const baseChar = char
    // Preserve Lam-Alef ligatures as single composite elements in letter mode
    if (char === 'ل' && i + 1 < text.length && /[اأإآ]/.test(text[i + 1])) {
      char = text.slice(i, i + 2)
      i += 2
    } else {
      i += 1
    }

    // Attach any following combining diacritics
    while (i < text.length && /[\u064B-\u065F\u0670\u06D6-\u06ED]/u.test(text[i])) {
      char += text[i]
      i += 1
    }

    clusters.push({
      base: baseChar,
      text: char,
      marks: char.slice(baseChar.length),
      clusterStart
    })
  }

  // One queue item owns the complete letter timeline:
  // body -> that letter's dots -> that letter's combining marks.
  return clusters.map((cluster, targetGlyphIndex) => ({
    text,
    label: cluster.base,
    targetCluster: cluster.clusterStart,
    targetGlyphIndex
  }))
}

export default function StudioView() {
  // Input state
  const [word, setWord] = useState('باب')
  const [elementType, setElementType] = useState('word') // 'letter' | 'word'
  const [drawMode, setDrawMode] = useState('stroke') // 'stroke' | 'connect'
  const [speed, setSpeed] = useState('medium') // 'slow' | 'medium' | 'fast'
  const [strokeWeight, setStrokeWeight] = useState(102)
  const [letterQueue, setLetterQueue] = useState([])
  const [activeLetterIndex, setActiveLetterIndex] = useState(0)
  const [strokeColor, setStrokeColor] = useState('#0f766e')
  const [exportFormat, setExportFormat] = useState('html')
  const [animatedExportDialogOpen, setAnimatedExportDialogOpen] = useState(false)
  const [animatedExportConfig, setAnimatedExportConfig] = useState({
    resolution: 'standard',
    speed: 1,
    directory: '',
    filename: ''
  })
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [exportProgress, setExportProgress] = useState({
    open: false,
    percent: 0,
    stage: '',
    detail: '',
    elapsedMs: 0,
    estimatedMs: null,
    error: ''
  })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const exportCancelledRef = useRef(false)
  const activeExportIdRef = useRef(null)
  const exportTimerRef = useRef(null)

  const openAnimatedExportDialog = () => {
    const defaults = ANIMATED_EXPORT_SETTINGS[exportFormat]
    const matchingResolution = EXPORT_RESOLUTIONS.find(
      (resolution) => resolution.width === defaults.width && resolution.height === defaults.height
    )
    setAnimatedExportConfig((state) => ({
      ...state,
      resolution: matchingResolution?.id || 'standard',
      speed: defaults.speed,
      filename: state.filename || `calligraphy-${safeDownloadName(word)}`
    }))
    setAnimatedExportDialogOpen(true)
  }

  const chooseExportDirectory = async () => {
    if (!window.api?.selectExportDirectory) return
    const directory = await window.api.selectExportDirectory()
    if (directory) setAnimatedExportConfig((state) => ({ ...state, directory }))
  }

  // Tegaki Animation State driven by canonical AnimationEngine
  const [showFullPreview, setShowFullPreview] = useState(false)
  const [engineState, setEngineState] = useState({
    mode: 'idle',
    currentStep: 0,
    progressMs: 0,
    durationMs: 0,
    isPaused: false,
    isComplete: false
  })

  const stageColumnRef = useRef(null)

  // HarfBuzz WASM readiness
  const [hbReady, setHbReady] = useState(harfbuzzService.isReady)

  useEffect(() => {
    if (!harfbuzzService.isReady) {
      initHarfBuzz()
        .then(() => setHbReady(true))
        .catch((err) => console.error('Failed to init HarfBuzz in Studio:', err))
    }
  }, [])

  useEffect(() => {
    if (elementType === 'letter') {
      setLetterQueue(segmentArabicElements(word))
    } else {
      setLetterQueue([])
    }
    setActiveLetterIndex(0)
    setEngineState((state) => ({ ...state, isComplete: false, mode: 'idle', progressMs: 0 }))
  }, [word, elementType])

  // Canonical Phase 3 Engine Setup
  const engineSetup = useMemo(() => {
    const inputText = (word || '').trim() || ' '
    const text =
      elementType === 'letter'
        ? letterQueue[activeLetterIndex]?.text || inputText
        : inputText
    return setupEngine(text, {
      connectGlyphs: drawMode === 'connect',
      allowUnverifiedFallback: true,
      targetCluster:
        elementType === 'letter' ? letterQueue[activeLetterIndex]?.targetCluster : undefined,
      targetGlyphIndex:
        elementType === 'letter' ? letterQueue[activeLetterIndex]?.targetGlyphIndex : undefined
    })
  }, [word, elementType, drawMode, letterQueue, activeLetterIndex, hbReady])

  // Sync speed changes to engine in real time
  useEffect(() => {
    if (engineSetup?.engine) {
      engineSetup.engine.setSpeed(speed)
    }
  }, [speed, engineSetup])

  // Subscribe to canonical AnimationEngine
  useEffect(() => {
    setShowFullPreview(false)
    const unsub = engineSetup.engine.subscribe((st) => {
      setEngineState(st)
    })

    return () => {
      unsub()
      engineSetup.engine.reset()
    }
  }, [engineSetup])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageColumnRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Support status
  const skippedGlyphs = engineSetup.skippedGlyphs || []
  const usesUnverifiedFallback = engineSetup.glyphs.some(
    (glyph) => glyph.definition?.provenance === 'unverified_fallback'
  )
  const isSupported = Boolean(
    engineSetup.glyphs.length > 0 && skippedGlyphs.length === 0 && !usesUnverifiedFallback
  )
  const hasRenderableContent = engineSetup.glyphs.length > 0
  const exportReady = hasRenderableContent && isSupported

  const isPlaying =
    engineState.mode === 'play' ||
    engineState.mode === 'auto-repeat' ||
    engineState.mode === 'step' ||
    engineState.mode === 'repeat-step'

  const currentQueueItem = letterQueue[activeLetterIndex]
  const hasNextLetter =
    elementType === 'letter' &&
    letterQueue.some(
      (item, index) =>
        index > activeLetterIndex && item.targetGlyphIndex !== currentQueueItem?.targetGlyphIndex
    )
  const effectiveProgressMs = showFullPreview
    ? engineSetup.timeline.totalDurationMs || 1
    : engineState.progressMs

  // Playback Control Handlers
  const handlePlay = () => {
    if (isPlaying && !engineState.isPaused) {
      engineSetup.engine.pause()
    } else {
      if (showFullPreview) {
        setShowFullPreview(false)
        engineSetup.engine.reset()
      }
      engineSetup.engine.play()
    }
  }

  const handlePause = () => {
    engineSetup.engine.pause()
  }

  const handleRestart = () => {
    setShowFullPreview(false)
    engineSetup.engine.reset()
  }

  const handleStep = () => {
    if (showFullPreview) {
      setShowFullPreview(false)
      engineSetup.engine.reset()
    }
    engineSetup.engine.step()
  }

  const handleRepeat = () => {
    if (showFullPreview) {
      setShowFullPreview(false)
      engineSetup.engine.reset()
    }
    engineSetup.engine.repeatCurrentStep()
  }

  const handleNextLetter = () => {
    if (!hasNextLetter) return
    const currentItem = letterQueue[activeLetterIndex]
    const nextLetterIndex = letterQueue.findIndex(
      (item, index) =>
        index > activeLetterIndex && item.targetGlyphIndex !== currentItem?.targetGlyphIndex
    )
    if (nextLetterIndex < 0) return

    setShowFullPreview(false)
    engineSetup.engine.reset()
    setEngineState((state) => ({
      ...state,
      mode: 'idle',
      currentStep: 0,
      progressMs: 0,
      isPaused: false,
      isComplete: false
    }))
    setActiveLetterIndex(nextLetterIndex)
  }

  const toggleFullscreen = () => {
    if (!stageColumnRef.current) return
    if (!document.fullscreenElement) {
      stageColumnRef.current.requestFullscreen?.().then(() => setIsFullscreen(true))
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false))
    }
  }

  const handleCancelExport = async () => {
    if (!exportBusy) return
    exportCancelledRef.current = true
    const exportId = activeExportIdRef.current
    if (exportId && window.api?.cancelMediaExport) {
      await window.api.cancelMediaExport(exportId).catch(() => false)
    }
    setExportStatus('تم إلغاء التصدير')
    setExportProgress((state) => ({
      ...state,
      stage: 'جارٍ إلغاء التصدير',
      detail: 'إيقاف الإطارات أو محول الوسائط...'
    }))
  }

  // Export static snapshots and full canonical animation media.
  const handleExport = async (confirmedAnimated = false) => {
    if (!exportReady || exportBusy) {
      const skippedNames = skippedGlyphs.map((glyph) => glyph.glyphName).join(', ')
      const reason = skippedNames
        ? `المحارف التي تم تجاوزها: ${skippedNames}`
        : usesUnverifiedFallback
          ? 'يحتوي النص على هندسة غير موثقة.'
          : 'لا توجد هندسة قابلة للتصدير.'
      alert(`لا يمكن تصدير هذا النص بعد. ${reason}`)
      return
    }

    if ((exportFormat === 'gif' || exportFormat === 'mp4') && !confirmedAnimated) {
      openAnimatedExportDialog()
      return
    }

    const animatedResolution = EXPORT_RESOLUTIONS.find(
      (resolution) => resolution.id === animatedExportConfig.resolution
    ) || EXPORT_RESOLUTIONS[1]
    const animatedSpeed = Number(animatedExportConfig.speed) || 1
    if (
      (exportFormat === 'gif' || exportFormat === 'mp4') &&
      (!animatedExportConfig.directory || !animatedExportConfig.filename.trim())
    ) {
      setAnimatedExportDialogOpen(true)
      return
    }

    setExportBusy(true)
    exportCancelledRef.current = false
    activeExportIdRef.current = crypto.randomUUID()
    const exportStartedAt = performance.now()
    window.clearInterval(exportTimerRef.current)
    exportTimerRef.current = window.setInterval(() => {
      setExportProgress((state) => ({
        ...state,
        elapsedMs: performance.now() - exportStartedAt
      }))
    }, 250)
    setExportStatus('جارٍ تجهيز التصدير...')
    setExportProgress({
      open: true,
      percent: 2,
      stage: 'تهيئة التصدير',
      detail: `تحضير ملف ${exportFormat.toUpperCase()}`,
      elapsedMs: 0,
      estimatedMs: null,
      error: ''
    })
    const downloadName = safeDownloadName(word)
    const renderExportFrame = (progressMs, width = 800, height = 380, raster = false) => {
      const svgBody = renderSvg(
        engineSetup.glyphs,
        engineSetup.timeline,
        progressMs,
        'export-snap',
        {
          stageWidth: width,
          stageHeight: height,
          showBaseline: false,
          centerVertically: true,
          strokeWeight
        }
      )
      return buildStandaloneSvg(svgBody, strokeColor, width, height, raster)
    }

    try {
      if (exportFormat === 'svg') {
        setExportProgress((state) => ({ ...state, percent: 55, stage: 'إنشاء ملف SVG' }))
        downloadBlob(
          new Blob([renderExportFrame(effectiveProgressMs)], { type: 'image/svg+xml;charset=utf-8' }),
          `calligraphy-${downloadName}-snapshot.svg`
        )
      } else if (exportFormat === 'html') {
        setExportProgress((state) => ({ ...state, percent: 55, stage: 'إنشاء ملف HTML' }))
        const escapedWord = escapeHtml(word)
        const svg = renderExportFrame(effectiveProgressMs)
        const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>لقطة الخط العربي: ${escapedWord}</title>
<style>
body { margin: 0; background: #f8f6f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Noto Sans Arabic', sans-serif; }
.card { background: #fff; padding: 2rem; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); width: 850px; text-align: center; }
.snapshot-notice { font-size: 0.85rem; color: #64748b; margin-top: 1rem; }
</style></head>
<body><div class="card"><h2>لقطة الخط العربي — ${escapedWord}</h2>${svg}<p class="snapshot-notice">لقطة ثابتة مطابقة للحظة الحالية (${Math.round(effectiveProgressMs)}ms)</p></div></body>
</html>`
        downloadBlob(
          new Blob([htmlContent], { type: 'text/html;charset=utf-8' }),
          `calligraphy-${downloadName}-snapshot.html`
        )
      } else if (exportFormat === 'png') {
        setExportProgress((state) => ({ ...state, percent: 15, stage: 'تحويل SVG إلى صورة' }))
        setExportStatus('جارٍ إنشاء صورة PNG...')
        const canvas = await svgToCanvas(
          renderExportFrame(effectiveProgressMs, 800, 380, true),
          800,
          380,
          strokeColor,
          effectiveProgressMs > 0
        )
        setExportProgress((state) => ({ ...state, percent: 85, stage: 'ترميز صورة PNG' }))
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('PNG encoding failed.')
        downloadBlob(blob, `calligraphy-${downloadName}-snapshot.png`)
      } else if (exportFormat === 'gif' || exportFormat === 'mp4') {
        if (!window.api?.convertMedia) {
          throw new Error('تصدير GIF وMP4 متاح من تطبيق سطح المكتب فقط. افتح التطبيق عبر Electron ثم أعد المحاولة.')
        }
        const baseDurationMs = Math.max(engineSetup.timeline.totalDurationMs || 1, 500)
        const animationDurationMs = Math.max(250, Math.round(baseDurationMs / animatedSpeed))
        const endHoldMs = 1500
        const durationMs = animationDurationMs + endHoldMs
        const defaults = ANIMATED_EXPORT_SETTINGS[exportFormat]
        const settings = {
          ...defaults,
          ...animatedResolution,
          speed: animatedSpeed
        }
        setExportStatus(`جارٍ تسجيل حركة ${exportFormat.toUpperCase()}...`)
        setExportProgress((state) => ({
          ...state,
          percent: 5,
          stage: 'رسم الإطارات',
          detail: `0 من الإطارات`
        }))
        let renderedFrames = 0
        const frameCount = Math.max(12, Math.ceil((durationMs / 1000) * settings.fps))
        const webm = await recordAnimation(
          async (progressMs) =>
            svgToCanvas(
              renderExportFrame(
                Math.min(progressMs, animationDurationMs),
                settings.width,
                settings.height,
                true
              ),
              settings.width,
              settings.height,
              strokeColor,
              progressMs > 0
            ),
          durationMs,
          settings.fps,
          settings.width,
          settings.height,
          (frameProgress) => {
            renderedFrames = Math.min(frameCount, Math.ceil(frameProgress * frameCount))
            const elapsedMs = performance.now() - exportStartedAt
            setExportProgress((state) => ({
              ...state,
              percent: 5 + Math.round(frameProgress * 73),
              stage: 'رسم الإطارات',
              detail: `${renderedFrames} من ${frameCount} إطار`,
              elapsedMs,
              estimatedMs: frameProgress > 0 ? elapsedMs / frameProgress : null
            }))
          },
          () => exportCancelledRef.current
        )
        setExportStatus(`جارٍ تحويل الحركة إلى ${exportFormat.toUpperCase()}...`)
        setExportProgress((state) => ({
          ...state,
          percent: 80,
          stage: 'تحويل الملف',
          detail: 'بدء محول الوسائط'
        }))
        const removeMediaProgress = window.api.onMediaProgress((progress) => {
          const elapsedMs = performance.now() - exportStartedAt
          setExportProgress((state) => ({
            ...state,
            percent: 80 + Math.round(progress * 18),
            stage: 'تحويل الملف',
            detail: `${Math.round(progress * 100)}% من التحويل`,
            elapsedMs,
            estimatedMs: progress > 0 ? elapsedMs / ((80 + progress * 18) / 100) : null
          }))
        })
        const converted = await window.api
          .convertMedia(
            await webm.arrayBuffer(),
            exportFormat,
            durationMs,
            activeExportIdRef.current,
            settings
          )
          .finally(removeMediaProgress)
        const bytes =
          converted instanceof Uint8Array
            ? converted
            : converted && typeof converted === 'object' && 'data' in converted
              ? new Uint8Array(converted.data)
              : new Uint8Array(converted)
        const mime = exportFormat === 'gif' ? 'image/gif' : 'video/mp4'
        if (window.api?.saveExportFile) {
          await window.api.saveExportFile(
            bytes,
            animatedExportConfig.directory,
            animatedExportConfig.filename.trim(),
            exportFormat
          )
        } else {
          downloadBlob(new Blob([bytes], { type: mime }), `${animatedExportConfig.filename.trim()}.${exportFormat}`)
        }
      }
      setExportStatus('تم التصدير بنجاح')
      setExportProgress((state) => ({
        ...state,
        open: true,
        percent: 100,
        stage: 'اكتمل التصدير',
        detail: 'تم تنزيل الملف بنجاح',
        elapsedMs: performance.now() - exportStartedAt,
        estimatedMs: performance.now() - exportStartedAt,
        error: ''
      }))
    } catch (error) {
      console.error('Export failed:', error)
      setExportStatus('فشل التصدير')
      const cancelled = exportCancelledRef.current || error?.name === 'ExportCancelled'
      setExportProgress((state) => ({
        ...state,
        open: true,
        stage: cancelled ? 'تم إلغاء التصدير' : 'فشل التصدير',
        detail: cancelled ? 'لم يتم إنشاء ملف التصدير' : 'حدث خطأ أثناء إنشاء الملف',
        elapsedMs: performance.now() - exportStartedAt,
        error: cancelled ? '' : error instanceof Error ? error.message : String(error)
      }))
      if (!cancelled) {
        alert(`تعذر إتمام التصدير: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      window.clearInterval(exportTimerRef.current)
      exportTimerRef.current = null
      activeExportIdRef.current = null
      setExportBusy(false)
    }
  }

  return (
    <div className="studio-root" dir="rtl">
      {/* Main Studio Two-Column Grid */}
      <main className="studio-layout">
        {/* Left / Center Column: Interactive Tegaki Canvas & Playback Bar */}
        <section
          className={`studio-stage-column ${isFullscreen ? 'is-fullscreen' : ''}`}
          ref={stageColumnRef}
        >
          {/* Main Display Board Card */}
          <div className="canvas-card">
            <div className="canvas-header">
              <div className="canvas-title">
                <MonitorPlay
                  className="canvas-icon"
                  size={22}
                  strokeWidth={2.1}
                  aria-hidden="true"
                />
                <h2>لوحة العرض التفاعلية</h2>
              </div>

              {isFullscreen ? (
                <button
                  type="button"
                  className="fullscreen-btn fullscreen-exit-btn"
                  onClick={toggleFullscreen}
                  title="الخروج من العرض الكامل"
                >
                  <Minimize2 className="fs-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
                  <span>خروج</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="fullscreen-btn"
                  onClick={toggleFullscreen}
                  title="ملء الشاشة"
                >
                  <Maximize2 className="fs-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
                  <span>تكبير الشاشة</span>
                </button>
              )}
            </div>

            {/* Tegaki Generator Board Viewport */}
            <div className="canvas-viewport">
              <div className="svg-container">
                <TegakiBoard
                  engineSetup={engineSetup}
                  progressMs={effectiveProgressMs}
                  strokeColor={strokeColor}
                  showShadowLayer={true}
                  showTrackingCursor={true}
                  showBaseline={false}
                  strokeWeight={strokeWeight}
                  stageWidth={800}
                  stageHeight={380}
                />
              </div>

              {/* Status callout if element is unverified */}
              {!isSupported && (
                <div className="unsupported-callout">
                  <Info className="callout-icon" size={18} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    العنصر &quot;{word}&quot; يحتوي على محارف أو هندسة غير جاهزة بالكامل. سيتم تجاوز
                    المحارف غير المعروفة، ولن يتاح التصدير حتى تكتمل الهندسة الموثقة.
                  </span>
                </div>
              )}
            </div>

            {/* Legend at bottom of canvas */}
            <div className="canvas-legend">
              <div className="legend-item">
                <span className="legend-dot teal-dot"></span>
                <span>أثر الكتابة (الجزء المنجز)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot blue-dot"></span>
                <span>مسار التتبع ورأس القلم</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot gray-dot"></span>
                <span>الشكل المرجعي (طبقة الظل)</span>
              </div>
            </div>
          </div>

          {/* Playback Controls Card */}
          <div className="playback-card">
            {/* Primary Action Button: Play/Pause */}
            <button
              type="button"
              className={`action-btn play-btn ${isPlaying && !engineState.isPaused ? 'is-playing' : ''}`}
              onClick={handlePlay}
            >
              <span className="play-icon">
                {isPlaying && !engineState.isPaused ? (
                  <Pause size={18} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={18} fill="currentColor" aria-hidden="true" />
                )}
              </span>
              <span>{isPlaying && !engineState.isPaused ? 'إيقاف' : 'تشغيل'}</span>
            </button>

            {/* Secondary Granular Controls */}
            <div className="secondary-controls">
              <button type="button" className="ctrl-btn" onClick={handlePause} title="إيقاف مؤقت">
                <Pause className="ctrl-icon" size={17} aria-hidden="true" />
                <span>إيقاف</span>
              </button>

              <button
                type="button"
                className={`ctrl-btn ${engineState.mode === 'repeat-step' ? 'active' : ''}`}
                onClick={handleRepeat}
                title="تكرار الخطوة الحالية"
              >
                <Repeat2 className="ctrl-icon" size={17} aria-hidden="true" />
                <span>تكرار الخطوة</span>
              </button>

              <button
                type="button"
                className="ctrl-btn"
                onClick={handleStep}
                title="تقديم خطوة واحدة للأمام"
              >
                <SkipForward className="ctrl-icon" size={17} aria-hidden="true" />
                <span>خطوة واحدة</span>
              </button>

              <button
                type="button"
                className="ctrl-btn"
                onClick={handleRestart}
                title="إعادة البدء من البداية"
              >
                <RotateCcw className="ctrl-icon" size={17} aria-hidden="true" />
                <span>إعادة البدء</span>
              </button>

              <button
                type="button"
                className="ctrl-btn"
                onClick={handleNextLetter}
                disabled={elementType !== 'letter' || !hasNextLetter || drawMode === 'connect'}
                title="الانتقال إلى الحرف التالي"
              >
                <SkipForward className="ctrl-icon" size={17} aria-hidden="true" />
                <span>الحرف التالي</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Sidebar: Settings & Export */}
        <aside className="studio-sidebar-column">
          {/* Card 1: Teacher / Studio Controls */}
          <div className="settings-card">
            <div className="settings-header">
              <Settings className="gear-icon" size={21} strokeWidth={2.1} aria-hidden="true" />
              <h3>إعدادات المعلم</h3>
            </div>

            {/* Text Input */}
            <div className="input-group">
              <label htmlFor="arabic-text-input" className="input-label">
                اكتب حرفاً أو كلمة
              </label>
              <div className="input-wrapper">
                <input
                  id="arabic-text-input"
                  type="text"
                  className="arabic-input"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="اكتب هنا..."
                  dir="rtl"
                />
                <Pencil
                  className="input-pencil-icon"
                  size={18}
                  strokeWidth={2.1}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Setting: Element Type */}
            <div className="setting-row">
              <span className="setting-label">نوع العنصر</span>
              <div className="segmented-toggle">
                <button
                  type="button"
                  className={`toggle-option ${elementType === 'word' ? 'selected' : ''}`}
                  onClick={() => setElementType('word')}
                >
                  كلمة
                </button>
                <button
                  type="button"
                  className={`toggle-option ${elementType === 'letter' ? 'selected' : ''} ${drawMode === 'connect' ? 'is-unavailable' : ''}`}
                  onClick={() => setElementType('letter')}
                  disabled={drawMode === 'connect'}
                  title={drawMode === 'connect' ? 'غير متاح أثناء اتصال الحروف' : 'رسم الحروف منفردة'}
                >
                  حرف
                </button>
              </div>
            </div>

            {/* Setting: Drawing Mode */}
            <div className="setting-row">
              <span className="setting-label">نمط الرسم</span>
              <div className="segmented-toggle">
                <button
                  type="button"
                  className={`toggle-option ${drawMode === 'stroke' ? 'selected' : ''} ${elementType === 'letter' ? 'is-unavailable' : ''}`}
                  onClick={() => setDrawMode('stroke')}
                  disabled={elementType === 'letter'}
                  title={elementType === 'letter' ? 'غير متاح أثناء رسم الحروف' : 'رسم الحروف'}
                >
                  رسم الحروف
                </button>
                <button
                  type="button"
                  className={`toggle-option ${drawMode === 'connect' ? 'selected' : ''} ${elementType === 'letter' ? 'is-unavailable' : ''}`}
                  onClick={() => setDrawMode('connect')}
                  disabled={elementType === 'letter'}
                  title={elementType === 'letter' ? 'غير متاح أثناء رسم الحروف' : 'اتصال الحروف'}
                >
                  اتصال الحروف
                </button>
              </div>
            </div>

            {/* Setting: Display Speed */}
            <div className="setting-row">
              <span className="setting-label">سرعة العرض</span>
              <div className="segmented-toggle three-options">
                <button
                  type="button"
                  className={`toggle-option ${speed === 'slow' ? 'selected' : ''}`}
                  onClick={() => {
                    setSpeed('slow')
                    engineSetup?.engine?.setSpeed('slow')
                  }}
                >
                  بطيء
                </button>
                <button
                  type="button"
                  className={`toggle-option ${speed === 'medium' ? 'selected' : ''}`}
                  onClick={() => {
                    setSpeed('medium')
                    engineSetup?.engine?.setSpeed('medium')
                  }}
                >
                  متوسط
                </button>
                <button
                  type="button"
                  className={`toggle-option ${speed === 'fast' ? 'selected' : ''}`}
                  onClick={() => {
                    setSpeed('fast')
                    engineSetup?.engine?.setSpeed('fast')
                  }}
                >
                  سريع
                </button>
              </div>
            </div>

            {/* Setting: Stroke Thickness (Locked to true TrueType glyph geometry) */}
            <div className="setting-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="setting-label">سماكة الخط</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  تتحكم في طبقة الظل والحبر المرسوم
                </span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min="94"
                  max="110"
                  step="2"
                  value={strokeWeight}
                  onChange={(event) => setStrokeWeight(Number(event.target.value))}
                  title="ضبط سماكة طبقة الظل والحبر"
                  className="thickness-slider"
                />
              </div>
            </div>

            {/* Setting: Stroke Color */}
            <div className="setting-row">
              <span className="setting-label">لون الخط</span>
              <div className="color-swatches-wrapper">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    className={`color-swatch ${strokeColor === swatch.value ? 'active' : ''}`}
                    style={{ backgroundColor: swatch.value }}
                    onClick={() => setStrokeColor(swatch.value)}
                    title={swatch.label}
                  />
                ))}
                <Palette
                  className="palette-icon"
                  size={19}
                  strokeWidth={2.1}
                  aria-label="لوحة الألوان"
                />
              </div>
            </div>
          </div>

          {/* Standalone Export Static Snapshot Card */}
          <div className="export-card">
            <div className="export-header">
              <div>
                <h3 className="export-title">تصدير لقطة ثابتة</h3>
                <span className="export-description">
                  لقطة هندسية من لحظة العرض الحالية ({Math.round(effectiveProgressMs)}ms)
                </span>
              </div>
              <button
                type="button"
                className="download-btn"
                onClick={handleExport}
                disabled={!exportReady || exportBusy}
                title={
                  exportReady
                    ? 'تحميل اللقطة الحالية'
                    : 'التصدير متاح فقط للنصوص ذات الهندسة الموثقة بالكامل'
                }
              >
                <Download className="dl-icon" size={17} strokeWidth={2.2} aria-hidden="true" />
                <span>{exportBusy ? 'جارٍ التصدير...' : 'تحميل'}</span>
              </button>
            </div>
            {!exportReady && (
              <div className="unsupported-callout" style={{ marginTop: '12px' }}>
                التصدير متاح فقط عندما تكون كل المحارف والهندسات موثقة بالكامل.
              </div>
            )}
            {exportStatus && (
              <div className="export-status" role="status" style={{ marginTop: '10px' }}>
                {exportStatus}
              </div>
            )}

            <div className="export-grid">
              {/* HTML Card (Static Snapshot) */}
              <div
                className={`export-tile ${exportFormat === 'html' ? 'selected' : ''}`}
                onClick={() => setExportFormat('html')}
              >
                <span className="tile-badge html-badge">HTML</span>
              </div>

              {/* SVG Card (Static Snapshot) */}
              <div
                className={`export-tile ${exportFormat === 'svg' ? 'selected' : ''}`}
                onClick={() => setExportFormat('svg')}
              >
                <span className="tile-badge svg-badge">SVG</span>
              </div>

              {/* PNG Card */}
              <div
                className={`export-tile ${exportFormat === 'png' ? 'selected' : ''}`}
                onClick={() => setExportFormat('png')}
              >
                <span className="tile-badge png-badge">PNG</span>
              </div>

              {/* GIF Card */}
              <div
                className={`export-tile ${exportFormat === 'gif' ? 'selected' : ''}`}
                onClick={() => setExportFormat('gif')}
              >
                <span className="tile-badge gif-badge">GIF</span>
              </div>

              {/* MP4 Card */}
              <div
                className={`export-tile ${exportFormat === 'mp4' ? 'selected' : ''}`}
                onClick={() => setExportFormat('mp4')}
              >
                <span className="tile-badge mp4-badge">MP4</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="studio-footer">
        <a
          href="https://www.zackriver.com"
          target="_blank"
          rel="noreferrer"
          className="studio-credit-link"
        >
          صُنع بواسطة Abdallah Wageeh
        </a>
      </footer>

      {animatedExportDialogOpen && (
        <div className="export-progress-backdrop" role="presentation">
          <section
            className="animated-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="animated-export-title"
          >
            <div className="export-progress-header">
              <div>
                <span className="export-progress-kicker">إعداد التصدير</span>
                <h2 id="animated-export-title">تصدير {exportFormat.toUpperCase()}</h2>
              </div>
              <button
                type="button"
                className="export-progress-close"
                onClick={() => setAnimatedExportDialogOpen(false)}
                aria-label="إغلاق إعدادات التصدير"
              >
                ×
              </button>
            </div>

            <div className="animated-export-form" dir="rtl">
              <label className="animated-export-field">
                <span>الدقة</span>
                <select
                  value={animatedExportConfig.resolution}
                  onChange={(event) =>
                    setAnimatedExportConfig((state) => ({ ...state, resolution: event.target.value }))
                  }
                >
                  {EXPORT_RESOLUTIONS.map((resolution) => (
                    <option key={resolution.id} value={resolution.id}>
                      {resolution.label} — {resolution.width} × {resolution.height}
                    </option>
                  ))}
                </select>
              </label>

              <label className="animated-export-field">
                <span>سرعة العرض</span>
                <select
                  value={animatedExportConfig.speed}
                  onChange={(event) =>
                    setAnimatedExportConfig((state) => ({ ...state, speed: Number(event.target.value) }))
                  }
                >
                  {EXPORT_SPEEDS.map((speedOption) => (
                    <option key={speedOption.value} value={speedOption.value}>
                      {speedOption.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="animated-export-field">
                <span>اسم الملف</span>
                <input
                  type="text"
                  value={animatedExportConfig.filename}
                  onChange={(event) =>
                    setAnimatedExportConfig((state) => ({ ...state, filename: event.target.value }))
                  }
                  placeholder={`calligraphy-${safeDownloadName(word)}`}
                  dir="ltr"
                />
              </label>

              <div className="animated-export-field">
                <span>مجلد الحفظ</span>
                <div className="export-directory-row" dir="ltr">
                  <button type="button" className="export-directory-button" onClick={chooseExportDirectory}>
                    <FolderOpen size={16} aria-hidden="true" />
                    اختيار مجلد
                  </button>
                  <span className="export-directory-value" title={animatedExportConfig.directory}>
                    {animatedExportConfig.directory || 'لم يتم اختيار مجلد'}
                  </span>
                </div>
              </div>
            </div>

            <div className="animated-export-actions">
              <button type="button" className="animated-export-cancel" onClick={() => setAnimatedExportDialogOpen(false)}>
                إلغاء
              </button>
              <button
                type="button"
                className="animated-export-confirm"
                disabled={!animatedExportConfig.directory || !animatedExportConfig.filename.trim()}
                onClick={() => {
                  setAnimatedExportDialogOpen(false)
                  handleExport(true)
                }}
              >
                تأكيد التصدير
              </button>
            </div>
          </section>
        </div>
      )}

      {exportProgress.open && (
        <div className="export-progress-backdrop" role="presentation">
          <section
            className="export-progress-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-progress-title"
          >
            <div className="export-progress-header">
              <div>
                <span className="export-progress-kicker">تصدير الملف</span>
                <h2 id="export-progress-title">{exportFormat.toUpperCase()}</h2>
              </div>
              {exportBusy ? (
                <button
                  type="button"
                  className="export-progress-cancel"
                  onClick={handleCancelExport}
                  aria-label="إلغاء التصدير"
                >
                  إلغاء
                </button>
              ) : (
                <button
                  type="button"
                  className="export-progress-close"
                  onClick={() => setExportProgress((state) => ({ ...state, open: false }))}
                  aria-label="إغلاق نافذة التصدير"
                >
                  ×
                </button>
              )}
            </div>

            <div className="export-progress-value" aria-live="polite">
              {exportProgress.percent}%
            </div>
            <div
              className="export-progress-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={exportProgress.percent}
            >
              <div
                className={`export-progress-fill ${exportProgress.error ? 'has-error' : ''}`}
                style={{ width: `${exportProgress.percent}%` }}
              />
            </div>
            <div className="export-progress-stage">{exportProgress.stage}</div>
            <div className="export-progress-detail">{exportProgress.detail}</div>
            <div className="export-progress-times" dir="ltr">
              <span>Elapsed {formatDuration(exportProgress.elapsedMs)}</span>
              <span>
                Estimated {exportProgress.estimatedMs ? formatDuration(exportProgress.estimatedMs) : '--:--'}
              </span>
            </div>
            {exportProgress.error && (
              <div className="export-progress-error" role="alert">
                {exportProgress.error}
              </div>
            )}
            {!exportBusy && !exportProgress.error && (
              <div className="export-progress-complete">يمكنك إغلاق هذه النافذة الآن.</div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
