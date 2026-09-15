import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Check,
  Download,
  FolderOpen,
  Info,
  Maximize2,
  Minimize2,
  Moon,
  MonitorPlay,
  Pause,
  Palette,
  Pencil,
  Play,
  Repeat2,
  RotateCcw,
  Settings,
  SkipForward,
  Sun
} from 'lucide-react'
import TegakiBoard from './TegakiBoard'
import {
  setupEngine,
  renderSvg,
  prepareRenderScene,
  renderSvgFrame,
  initHarfBuzz,
  harfbuzzService,
  getBridgeHandoffProgress,
  getBrushSquareGeometry,
  DEFAULT_STROKE_WEIGHT
} from '../engine'

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

const RASTER_EXPORT_BACKGROUND = '#f3ece4'
const RASTER_EXPORT_EDGE_BLUR = 0.35
const HTML_EXPORT_FPS = 24
const SHADOW_STYLES = Object.freeze({
  default: { color: '#cbd5e1', opacity: 0.45 },
  white: { color: '#ffffff', opacity: 0.2 }
})

function getShadowStyle(mode) {
  return SHADOW_STYLES[mode] || SHADOW_STYLES.default
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function yieldToRenderer() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildStandaloneSvg(
  svgBody,
  strokeColor,
  width = 800,
  height = 380,
  raster = false,
  shadowMode = 'default'
) {
  const shadowStyle = getShadowStyle(shadowMode)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .baseline { stroke: rgba(15, 118, 110, 0.2); stroke-dasharray: 6 4; }
      .ghost-outline { fill: ${shadowStyle.color}; opacity: ${shadowStyle.opacity}; }
      .ghost-outline.unsupported { fill: #94a3b8; opacity: 0.3; }
      .ink-outline { fill: ${strokeColor}; filter: blur(${RASTER_EXPORT_EDGE_BLUR}px)${raster ? ';' : ' drop-shadow(0 2px 4px rgba(15, 118, 110, 0.18));'} }
      .ink-connection-bridge { fill: none; stroke: ${strokeColor}; stroke-linecap: butt; stroke-linejoin: round; filter: blur(${RASTER_EXPORT_EDGE_BLUR}px); }
      .median-path { display: none; }
    </style>
  </defs>
  ${raster ? `<rect width="${width}" height="${height}" fill="${RASTER_EXPORT_BACKGROUND}"/>` : ''}
  ${svgBody.replace(/<svg[^>]*>/, '').replace(/<\/svg>$/, '')}
</svg>`
}

function buildAnimatedHtml({ word, frameSvgs, durationMs, fps }) {
  const escapedWord = escapeHtml(word)
  const frameData = JSON.stringify(frameSvgs).replaceAll('<', '\\u003c')
  const safeDurationMs = Math.max(1, Math.round(durationMs))
  const safeFps = Math.max(1, Math.round(fps))
  const durationLabel = (safeDurationMs / 1000).toFixed(1)

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مخطط الخط العربي: ${escapedWord}</title>
  <style>
    :root { color-scheme: light; font-family: 'Noto Sans Arabic', 'Segoe UI', sans-serif; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 1rem;
      display: grid;
      place-items: center;
      background: #f8f6f0;
      color: #1e293b;
    }
    .card {
      width: min(900px, 100%);
      padding: clamp(1rem, 4vw, 2rem);
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    h1 { margin: 0 0 1rem; font-size: clamp(1.1rem, 2.5vw, 1.5rem); text-align: center; }
    .stage {
      width: 100%;
      aspect-ratio: 800 / 380;
      overflow: hidden;
      border-radius: 12px;
      background: #f3ece4;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .stage svg { display: block; width: 100%; height: 100%; }
    .controls { display: flex; align-items: center; gap: 0.65rem; margin-top: 1rem; }
    button {
      min-height: 2.4rem;
      padding: 0.5rem 0.9rem;
      border: 1px solid #0d9488;
      border-radius: 8px;
      background: #0d9488;
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    button.secondary { border-color: #cbd5e1; background: #f8fafc; color: #334155; }
    button:hover, button:focus-visible { filter: brightness(0.96); outline: 2px solid rgba(13, 148, 136, 0.25); outline-offset: 2px; }
    .time { min-width: 7rem; color: #64748b; font: 700 0.8rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; direction: ltr; }
    input[type="range"] { flex: 1; min-width: 5rem; accent-color: #0d9488; cursor: pointer; }
    .notice { margin: 0.8rem 0 0; color: #64748b; font-size: 0.8rem; text-align: center; }
    @media (max-width: 560px) {
      .controls { flex-wrap: wrap; justify-content: center; }
      input[type="range"] { order: 3; flex-basis: 100%; }
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>مخطط الخط العربي — ${escapedWord}</h1>
    <div id="stage" class="stage" aria-label="Animated calligraphy preview"></div>
    <div class="controls">
      <button id="toggle" type="button">تشغيل</button>
      <button id="restart" class="secondary" type="button">إعادة</button>
      <input id="scrubber" type="range" min="0" max="${Math.max(0, frameSvgs.length - 1)}" value="0" step="1" aria-label="Animation position">
      <span id="time" class="time">00:00 / 00:${durationLabel.padStart(4, '0')}</span>
    </div>
    <p class="notice">ملف HTML مستقل يعمل دون اتصال بالإنترنت.</p>
  </main>
  <script>
    (() => {
      const frames = ${frameData};
      const fps = ${safeFps};
      const durationMs = ${safeDurationMs};
      const stage = document.getElementById('stage');
      const toggle = document.getElementById('toggle');
      const restart = document.getElementById('restart');
      const scrubber = document.getElementById('scrubber');
      const time = document.getElementById('time');
      let frameIndex = 0;
      let playing = false;
      let animationFrame = 0;
      let startedAt = 0;

      const formatTime = (milliseconds) => {
        const seconds = Math.max(0, Math.floor(milliseconds / 1000));
        return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      };

      const updateTime = () => {
        const currentMs = Math.min(durationMs, (frameIndex / Math.max(1, fps)) * 1000);
        time.textContent = formatTime(currentMs) + ' / ' + formatTime(durationMs);
        scrubber.value = String(frameIndex);
      };

      const showFrame = (nextIndex) => {
        frameIndex = Math.max(0, Math.min(frames.length - 1, nextIndex));
        stage.innerHTML = frames[frameIndex] || '';
        updateTime();
      };

      const stop = () => {
        playing = false;
        cancelAnimationFrame(animationFrame);
        toggle.textContent = frameIndex >= frames.length - 1 ? 'تشغيل من البداية' : 'تشغيل';
      };

      const tick = (now) => {
        if (!playing) return;
        const elapsed = now - startedAt;
        const nextIndex = Math.min(frames.length - 1, Math.floor((elapsed / 1000) * fps));
        showFrame(nextIndex);
        if (nextIndex >= frames.length - 1 || elapsed >= durationMs) {
          stop();
          return;
        }
        animationFrame = requestAnimationFrame(tick);
      };

      const play = () => {
        if (frameIndex >= frames.length - 1) showFrame(0);
        playing = true;
        toggle.textContent = 'إيقاف';
        startedAt = performance.now() - (frameIndex / Math.max(1, fps)) * 1000;
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(tick);
      };

      toggle.addEventListener('click', () => (playing ? stop() : play()));
      restart.addEventListener('click', () => {
        stop();
        showFrame(0);
      });
      scrubber.addEventListener('input', () => {
        stop();
        showFrame(Number(scrubber.value));
      });
      document.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' || event.target === scrubber) return;
        event.preventDefault();
        playing ? stop() : play();
      });

      showFrame(0);
    })();
  </script>
</body>
</html>`
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
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
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

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, width, height)

  const rasterSvg = stripRasterFilters(svgMarkup)
  try {
    const nativeCanvas = await nativeSvgToCanvas(rasterSvg, width, height)
    if (!expectInk || hasVisibleInk(nativeCanvas, strokeColor)) return nativeCanvas
  } catch {
    // Fall through to the canonical mask renderer.
  }

  const { Canvg } = await import('canvg')
  const renderer = await Canvg.fromString(context, rasterSvg, {
    ignoreAnimation: true,
    ignoreMouse: true
  })
  await renderer.render()
  renderer.stop()
  return canvas
}

function rasterizeSvgNative(svgMarkup, ctx, width, height, img = new Image()) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const cleanup = () => {
      img.onload = null
      img.onerror = null
      img.src = ''
      URL.revokeObjectURL(url)
    }
    img.onload = () => {
      try {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        cleanup()
        resolve()
      } catch (error) {
        cleanup()
        reject(error)
      }
    }
    img.onerror = () => {
      cleanup()
      reject(new Error('Native SVG rasterization failed.'))
    }
    img.src = url
  })
}

async function rasterizeSvgCanvg(CanvgClass, svgMarkup, ctx, width, height) {
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, width, height)
  const renderer = await CanvgClass.fromString(ctx, svgMarkup, {
    ignoreAnimation: true,
    ignoreMouse: true
  })
  await renderer.render()
  renderer.stop()
}

function parseTranslate(transform) {
  const match = String(transform).match(/translate\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/)
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 }
}

function smoothProgress(progress) {
  const value = Math.max(0, Math.min(1, progress))
  return value * value * (3 - 2 * value)
}

function preparedStrokeProgress(stroke, progressMs) {
  if (!stroke.step) return progressMs > 0 ? 1 : 0
  const duration = stroke.step.endMs - stroke.step.startMs
  const linear = Math.max(0, Math.min(1, duration > 0 ? (progressMs - stroke.step.startMs) / duration : 0))
  if (progressMs <= stroke.step.startMs) return 0
  const startProgress = stroke.step.startProgress ?? 0
  const terminalProgress = stroke.step.endProgress ?? 1
  return Math.max(
    startProgress + smoothProgress(linear) * (terminalProgress - startProgress),
    getBridgeHandoffProgress(stroke.step, progressMs)
  )
}

function addCanvasBrush(context, x, y, angle, width, height) {
  context.save()
  context.translate(x, y)
  context.rotate((angle * Math.PI) / 180)
  context.rect(-width / 2, -height / 2, width, height)
  context.restore()
}

function clipDotProgress(context, stroke, progress) {
  if (!stroke.isDot || progress <= 0 || progress >= 1 || !stroke.length) return
  const point = stroke.pathProps.getPointAtLength(stroke.length * progress)
  const halfWindow = Math.min(0.08, 6 / stroke.length)
  let start = Math.max(0, progress - halfWindow)
  let end = Math.min(1, progress + halfWindow)
  if (progress < halfWindow) end = Math.min(1, end + (halfWindow - progress))
  if (progress + halfWindow > 1) start = Math.max(0, start - (progress + halfWindow - 1))
  const before = stroke.pathProps.getPointAtLength(stroke.length * start)
  const after = stroke.pathProps.getPointAtLength(stroke.length * end)
  const dx = after.x - before.x
  const dy = after.y - before.y
  const magnitude = Math.hypot(dx, dy)
  if (!magnitude) return
  const tangentX = dx / magnitude
  const tangentY = dy / magnitude
  const normalX = -tangentY
  const normalY = tangentX
  const extent = 10000
  const x = point.x
  const y = point.y
  context.beginPath()
  context.moveTo(x + normalX * extent, y + normalY * extent)
  context.lineTo(x - normalX * extent, y - normalY * extent)
  context.lineTo(x - tangentX * extent - normalX * extent, y - tangentY * extent - normalY * extent)
  context.lineTo(x - tangentX * extent + normalX * extent, y - tangentY * extent + normalY * extent)
  context.closePath()
  context.clip()
}

/**
 * Rasterizes the prepared scene without reparsing a full SVG for every frame.
 * Path2D keeps the TrueType outlines intact while Canvas clips each outline
 * with the same progressive brush stamps used by the canonical SVG renderer.
 */
function rasterizePreparedSceneToCanvas(
  scene,
  progressMs,
  context,
  width,
  height,
  strokeColor,
  pathCache,
  pixelScale = 1,
  shadowMode = 'default'
) {
  const shadowStyle = getShadowStyle(shadowMode)
  const outlinePaths = new Map()
  for (const [path, id] of scene.outlineMap.entries()) {
    if (!pathCache.has(id)) pathCache.set(id, new Path2D(path))
    outlinePaths.set(id, pathCache.get(id))
  }

  context.clearRect(0, 0, width * pixelScale, height * pixelScale)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.filter = 'none'
  context.globalAlpha = 1
  context.fillStyle = RASTER_EXPORT_BACKGROUND
  context.fillRect(0, 0, width * pixelScale, height * pixelScale)
  context.fillStyle = shadowStyle.color
  context.globalAlpha = shadowStyle.opacity

  const viewport = scene.viewport
  context.save()
  context.scale(pixelScale, pixelScale)
  context.translate(viewport.tx, viewport.baselineY)
  context.scale(viewport.scale, viewport.scale)

  for (const glyph of scene.glyphs) {
    const position = parseTranslate(glyph.glyphTransform)
    context.save()
    context.translate(position.x, position.y)
    if (!glyph.isSupported) {
      context.globalAlpha = 0.3
      const unsupportedPath = glyph.unsupportedOutlineId
        ? outlinePaths.get(glyph.unsupportedOutlineId)
        : null
      if (unsupportedPath) context.fill(unsupportedPath)
      context.globalAlpha = shadowStyle.opacity
      context.restore()
      continue
    }
    for (const outlineId of glyph.ghostOutlineIds) {
      const path = outlinePaths.get(outlineId)
      if (path) context.fill(path)
    }
    context.restore()
  }

  context.globalAlpha = 1
  context.fillStyle = strokeColor

  for (const glyph of scene.glyphs) {
    const position = parseTranslate(glyph.glyphTransform)
    context.save()
    context.translate(position.x, position.y)

    for (const strokeIndex of glyph.strokeIndices) {
      const stroke = scene.strokes[strokeIndex]
      const progress = preparedStrokeProgress(stroke, progressMs)
      if (progress <= 0) continue

      const startProgress = stroke.step?.startProgress ?? 0
      const startCount = Math.min(
        stroke.fixedCount,
        Math.ceil((stroke.length * startProgress) / stroke.spacing)
      )
      const activeCount = Math.min(
        stroke.fixedCount,
        Math.floor((stroke.length * progress) / stroke.spacing)
      )
      context.save()
      clipDotProgress(context, stroke, progress)
      context.beginPath()

      for (let index = startCount; index <= activeCount; index++) {
        const offset = index * 4
        const geometry = getBrushSquareGeometry(stroke, stroke.samples[offset], scene.strokeWeight)
        addCanvasBrush(
          context,
          stroke.samples[offset + 1],
          stroke.samples[offset + 2],
          stroke.samples[offset + 3],
          geometry.width,
          geometry.height
        )
      }

      const lastFixed = Math.min(1, (activeCount * stroke.spacing) / stroke.length)
      if (progress > lastFixed && progress > startProgress) {
        const pointProgress = Math.max(0, Math.min(1, progress))
        const point = stroke.pathProps.getPointAtLength(stroke.length * pointProgress)
        const halfWindow = Math.min(stroke.isDot ? 0.08 : 0.014, (stroke.isDot ? 6 : 9) / stroke.length)
        const before = stroke.pathProps.getPointAtLength(
          stroke.length * Math.max(0, pointProgress - halfWindow)
        )
        const after = stroke.pathProps.getPointAtLength(
          stroke.length * Math.min(1, pointProgress + halfWindow)
        )
        const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI
        const geometry = getBrushSquareGeometry(stroke, pointProgress, scene.strokeWeight)
        addCanvasBrush(context, point.x, point.y, angle, geometry.width, geometry.height)
      }

      context.clip()
      context.filter = `blur(${RASTER_EXPORT_EDGE_BLUR}px)`
      for (const outlineId of stroke.outlineIds) {
        const path = outlinePaths.get(outlineId)
        if (path) context.fill(path)
      }
      for (const connection of scene.connections) {
        if (connection.connMaskId !== stroke.maskId) continue
        const path = outlinePaths.get(connection.nextOutlineId)
        if (!path) continue
        context.save()
        context.translate(connection.dx, connection.dy)
        context.fill(path)
        context.restore()
      }
      context.restore()
    }
    context.restore()
  }

  // Paint only the measured terminal-to-start handoff during its own interval.
  // This keeps the connector smooth without revealing any future glyph area.
  context.save()
  context.strokeStyle = strokeColor
  context.lineCap = 'butt'
  context.lineJoin = 'round'
  context.filter = `blur(${RASTER_EXPORT_EDGE_BLUR}px)`
  for (const connection of scene.connections) {
    if (
      !connection.bridgePath ||
      !connection.bridgeLength ||
      connection.bridgeStartMs === undefined ||
      connection.bridgeEndMs === undefined
    ) {
      continue
    }

    const duration = connection.bridgeEndMs - connection.bridgeStartMs
    const progress =
      duration > 0
        ? progressMs <= connection.bridgeStartMs
          ? 0
          : progressMs >= connection.bridgeEndMs
            ? 1
            : smoothProgress((progressMs - connection.bridgeStartMs) / duration)
        : progressMs >= connection.bridgeEndMs
          ? 1
          : 0
    if (progress <= 0) continue

    const sourceGlyph = scene.glyphs[connection.fromGlyphIndex]
    if (!sourceGlyph) continue
    const position = parseTranslate(sourceGlyph.glyphTransform)
    const pathId = `__handoff__${connection.connMaskId}`
    let bridgePath = pathCache.get(pathId)
    if (!bridgePath) {
      bridgePath = new Path2D(connection.bridgePath)
      pathCache.set(pathId, bridgePath)
    }

    context.save()
    context.translate(position.x, position.y)
    context.lineWidth = connection.bridgeBrushHeight || DEFAULT_STROKE_WEIGHT
    context.setLineDash([
      connection.bridgeLength * progress,
      Math.max(connection.bridgeLength * (1 - progress), 0.001)
    ])
    context.stroke(bridgePath)
    context.restore()
  }
  context.setLineDash([])
  context.filter = 'none'
  context.restore()

  context.restore()
}

const ANIMATED_EXPORT_SETTINGS = {
  gif: { fps: 24, width: 1280, height: 720, videoBitrate: 0 },
  mp4: { fps: 30, width: 1280, height: 720, videoBitrate: 12_000_000 }
}

const EXPORT_RESOLUTIONS = [
  { id: 'p480', label: '480p', width: 854, height: 480, videoBitrate: 6_000_000 },
  { id: 'p720', label: '720p', width: 1280, height: 720, videoBitrate: 12_000_000 },
  { id: 'p1080', label: '1080p / FHD', width: 1920, height: 1080, videoBitrate: 20_000_000 }
]

const PNG_EXPORT_RESOLUTION = { width: 1920, height: 1080 }

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

export default function StudioView({ theme = 'light', onToggleTheme }) {
  // Input state
  const [word, setWord] = useState('أبجد')
  const [pendingWord, setPendingWord] = useState('أبجد')
  const [elementType, setElementType] = useState('word') // 'letter' | 'word'
  const [drawMode, setDrawMode] = useState('stroke') // 'stroke' | 'connect'
  const [speed, setSpeed] = useState('medium') // 'slow' | 'medium' | 'fast'
  const strokeWeight = DEFAULT_STROKE_WEIGHT
  const [activeLetterIndex, setActiveLetterIndex] = useState(0)
  const [strokeColor, setStrokeColor] = useState('#0f766e')
  const [shadowMode, setShadowMode] = useState('default')
  const shadowStyle = getShadowStyle(shadowMode)
  const [exportFormat, setExportFormat] = useState('html')
  const [animatedExportDialogOpen, setAnimatedExportDialogOpen] = useState(false)
  const [animatedExportConfig, setAnimatedExportConfig] = useState({
    resolution: 'standard',
    fps: 30,
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

  const applyPendingWord = () => {
    const nextWord = pendingWord.trim()
    if (!nextWord) return
    setWord(nextWord)
  }

  const openAnimatedExportDialog = (format = exportFormat) => {
    const defaults = ANIMATED_EXPORT_SETTINGS[format]
    const matchingResolution = EXPORT_RESOLUTIONS.find(
      (resolution) => resolution.width === defaults.width && resolution.height === defaults.height
    )
    setAnimatedExportConfig((state) => ({
      ...state,
      resolution: matchingResolution?.id || 'standard',
      fps: defaults.fps,
      filename: `calligraphy-${safeDownloadName(word)}`
    }))
    setAnimatedExportDialogOpen(true)
  }

  const selectExportFormat = (format) => {
    setExportFormat(format)
    if ((format === 'gif' || format === 'mp4') && !exportBusy) {
      openAnimatedExportDialog(format)
    }
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

  const letterQueue = useMemo(
    () => (elementType === 'letter' ? segmentArabicElements(word) : []),
    [word, elementType]
  )

  useEffect(() => {
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

  const prevSemanticRef = useRef(null)

  // Subscribe to canonical AnimationEngine (semantic state only, zero renders during visual progress ticks)
  useEffect(() => {
    setShowFullPreview(false)
    prevSemanticRef.current = null
    const unsub = engineSetup.engine.subscribe((st) => {
      const prev = prevSemanticRef.current
      if (
        !prev ||
        prev.mode !== st.mode ||
        prev.isPaused !== st.isPaused ||
        prev.isComplete !== st.isComplete ||
        prev.currentStep !== st.currentStep
      ) {
        prevSemanticRef.current = {
          mode: st.mode,
          isPaused: st.isPaused,
          isComplete: st.isComplete,
          currentStep: st.currentStep
        }
        setEngineState(st)
      }
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

      // Send a distinct reset notification before replaying a completed
      // timeline so the live SVG adapter clears its masks and stroke cursor.
      const currentEngineState = engineSetup.engine.getState()
      if (
        currentEngineState.isComplete ||
        currentEngineState.progressMs >= currentEngineState.durationMs
      ) {
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

  const handleCancelExport = () => {
    if (!exportBusy) return
    exportCancelledRef.current = true
    const exportId = activeExportIdRef.current

    // Update the UI immediately. Do not make the cancel button wait for the
    // encoder process or filesystem cleanup to finish.
    setExportStatus('تم إلغاء التصدير')
    setExportProgress((state) => ({
      ...state,
      stage: 'جارٍ إلغاء التصدير',
      detail: 'إيقاف الإطارات أو محول الوسائط...'
    }))

    if (exportId) {
      if (window.api?.cancelExportStream) {
        void window.api.cancelExportStream(exportId).catch(() => false)
      } else if (window.api?.cancelMediaExport) {
        void window.api.cancelMediaExport(exportId).catch(() => false)
      }
    }
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
      return buildStandaloneSvg(svgBody, strokeColor, width, height, raster, shadowMode)
    }
    const totalDurationMs = Math.max(engineSetup.timeline.totalDurationMs || 1, 500)

    try {
      if (exportFormat === 'svg') {
        setExportProgress((state) => ({ ...state, percent: 55, stage: 'إنشاء ملف SVG' }))
        downloadBlob(
          new Blob([renderExportFrame(effectiveProgressMs)], { type: 'image/svg+xml;charset=utf-8' }),
          `calligraphy-${downloadName}-snapshot.svg`
        )
      } else if (exportFormat === 'html') {
        const frameCount = Math.max(2, Math.ceil((totalDurationMs / 1000) * HTML_EXPORT_FPS) + 1)
        const frameSvgs = []

        setExportProgress((state) => ({
          ...state,
          percent: 8,
          stage: 'إنشاء إطارات HTML المتحركة',
          detail: `تحضير ${frameCount} إطاراً مستقلاً...`
        }))

        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          if (exportCancelledRef.current) {
            const error = new Error('Export cancelled.')
            error.name = 'ExportCancelled'
            throw error
          }

          const progressMs =
            frameIndex === frameCount - 1
              ? totalDurationMs
              : (frameIndex / (frameCount - 1)) * totalDurationMs
          frameSvgs.push(renderExportFrame(progressMs))

          if (frameIndex % 4 === 0 || frameIndex === frameCount - 1) {
            setExportProgress((state) => ({
              ...state,
              percent: 8 + Math.round(((frameIndex + 1) / frameCount) * 72),
              stage: 'إنشاء إطارات HTML المتحركة',
              detail: `الإطار ${frameIndex + 1} من ${frameCount}`
            }))
            await yieldToRenderer()
          }
        }

        setExportProgress((state) => ({ ...state, percent: 88, stage: 'تجميع ملف HTML' }))
        const htmlContent = buildAnimatedHtml({
          word,
          frameSvgs,
          durationMs: totalDurationMs,
          fps: HTML_EXPORT_FPS
        })
        downloadBlob(
          new Blob([htmlContent], { type: 'text/html;charset=utf-8' }),
          `calligraphy-${downloadName}.html`
        )
      } else if (exportFormat === 'png') {
        setExportProgress((state) => ({ ...state, percent: 15, stage: 'تحويل SVG إلى صورة' }))
        setExportStatus('جارٍ إنشاء صورة PNG...')
        const canvas = await svgToCanvas(
          renderExportFrame(
            effectiveProgressMs,
            PNG_EXPORT_RESOLUTION.width,
            PNG_EXPORT_RESOLUTION.height,
            true
          ),
          PNG_EXPORT_RESOLUTION.width,
          PNG_EXPORT_RESOLUTION.height,
          strokeColor,
          effectiveProgressMs > 0
        )
        setExportProgress((state) => ({ ...state, percent: 85, stage: 'ترميز صورة PNG' }))
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('PNG encoding failed.')
        downloadBlob(blob, `calligraphy-${downloadName}-1080p.png`)
      } else if (exportFormat === 'gif' || exportFormat === 'mp4') {
        if (!window.api?.startExportStream && !window.api?.convertMedia) {
          throw new Error('تصدير GIF وMP4 متاح من تطبيق سطح المكتب فقط. افتح التطبيق عبر Electron ثم أعد المحاولة.')
        }
        const defaults = ANIMATED_EXPORT_SETTINGS[exportFormat]
        const settings = {
          ...defaults,
          ...animatedResolution,
          fps: Number(animatedExportConfig.fps) || defaults.fps
        }
        const width = Math.round(settings.width / 2) * 2
        const height = Math.round(settings.height / 2) * 2
        const fps = settings.fps

        const animationDurationSec = totalDurationMs / 1000
        const frameCount = Math.max(12, Math.ceil(animationDurationSec * fps))

        setExportStatus(`جارٍ بدء تصدير ${exportFormat.toUpperCase()}...`)
        setExportProgress((state) => ({
          ...state,
          percent: 5,
          stage: 'تهيئة محول الوسائط',
          detail: 'بدء بث الإطارات...'
        }))

        // Precompute canonical export render scene once
        const preparedExportScene = prepareRenderScene(
          engineSetup.glyphs,
          engineSetup.timeline,
          `export-${exportFormat}-${width}x${height}`,
          {
            stageWidth: width,
            stageHeight: height,
            showBaseline: false,
            centerVertically: true,
            strokeWeight,
            includeMedianLayer: false
          }
        )

        const exportId = activeExportIdRef.current
        await window.api.startExportStream({
          exportId,
          format: exportFormat,
          width,
          height,
          fps,
          videoBitrate: settings.videoBitrate || animatedResolution.videoBitrate,
          directory: animatedExportConfig.directory,
          filename: animatedExportConfig.filename.trim(),
          endHoldDurationSeconds: 1.5
        })

        // Reusable Canvas for offline frame rasterization
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = width
        exportCanvas.height = height
        const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true })
        if (!exportCtx) throw new Error('Canvas rendering is unavailable.')

        // Prefer the prepared Canvas compositor for animated exports. It keeps
        // the TrueType paths and progressive masks but avoids decoding a full
        // XML mask tree for every frame. SVG remains the fallback for engines
        // without Path2D and for non-default outline morphology filters.
        const canvasPathCache = new Map()
        let useCanvasRaster =
          typeof Path2D !== 'undefined' && preparedExportScene.weightFilterRadius === 0
        let useCanvg = false
        let rasterBackend = useCanvasRaster ? 'Canvas / Path2D' : 'SVG native'
        const nativeRasterImage = new Image()
        // The selected media resolution is already the final delivery size.
        // Render and read from the same canvas so 1x exports cannot accidentally
        // read a separate, untouched canvas.
        const canvasPixelScale = 1

        if (!useCanvasRaster) {
          const frame0Svg = buildStandaloneSvg(
            renderSvgFrame(preparedExportScene, 0),
            strokeColor,
            width,
            height,
            true,
            shadowMode
          )
          try {
            await rasterizeSvgNative(frame0Svg, exportCtx, width, height, nativeRasterImage)
          } catch {
            useCanvg = true
            rasterBackend = 'Canvg fallback'
          }
        }
        setExportProgress((state) => ({
          ...state,
          detail: `المعالج: ${rasterBackend}`
        }))
        let canvgClass = null
        if (useCanvg) {
          const { Canvg } = await import('canvg')
          canvgClass = Canvg
        }

        let lastSvg = ''
        let lastRawFrame = null
        let lastProgressUpdate = performance.now()

        // Offline direct frame rasterization & bounded streaming loop
        for (let index = 0; index < frameCount; index++) {
          // Give the renderer a macrotask boundary before each heavy frame so
          // cancel clicks and window events can be delivered during export.
          await yieldToRenderer()
          if (exportCancelledRef.current) {
            await window.api.cancelExportStream(exportId).catch(() => {})
            const error = new Error('Export cancelled.')
            error.name = 'ExportCancelled'
            throw error
          }

          const timelineProgressMs =
            index === frameCount - 1 ? totalDurationMs : (index / (frameCount - 1)) * totalDurationMs

          const rawSvg = useCanvasRaster ? '' : renderSvgFrame(preparedExportScene, timelineProgressMs)
          let frameBytes = null

          if (!useCanvasRaster && rawSvg === lastSvg && lastRawFrame && lastRawFrame.byteLength > 0) {
            // The transport may transfer its buffer, so keep the cache detached
            // from the buffer handed to Electron.
            frameBytes = lastRawFrame.slice()
          } else {
            if (useCanvasRaster) {
              try {
                rasterizePreparedSceneToCanvas(
                  preparedExportScene,
                  timelineProgressMs,
                  exportCtx,
                  width,
                  height,
                  strokeColor,
                  canvasPathCache,
                  canvasPixelScale,
                  shadowMode
                )
              } catch {
                // Path2D is supported by Chromium, but keep the existing SVG
                // path as a defensive fallback for unusual path data.
                useCanvasRaster = false
                rasterBackend = 'SVG native'
                const fallbackSvg = rawSvg || renderSvgFrame(preparedExportScene, timelineProgressMs)
                const standaloneSvg = buildStandaloneSvg(
                  fallbackSvg,
                  strokeColor,
                  width,
                  height,
                  true,
                  shadowMode
                )
                try {
                  await rasterizeSvgNative(
                    standaloneSvg,
                    exportCtx,
                    width,
                    height,
                    nativeRasterImage
                  )
                } catch {
                  useCanvg = true
                  rasterBackend = 'Canvg fallback'
                  const { Canvg } = await import('canvg')
                  canvgClass = Canvg
                  await rasterizeSvgCanvg(canvgClass, standaloneSvg, exportCtx, width, height)
                }
              }
            } else if (!useCanvg) {
              const standaloneSvg = buildStandaloneSvg(
                rawSvg,
                strokeColor,
                width,
                height,
                true,
                shadowMode
              )
              await rasterizeSvgNative(standaloneSvg, exportCtx, width, height, nativeRasterImage)
            } else {
              const standaloneSvg = buildStandaloneSvg(
                rawSvg,
                strokeColor,
                width,
                height,
                true,
                shadowMode
              )
              await rasterizeSvgCanvg(canvgClass, standaloneSvg, exportCtx, width, height)
            }
            const imgData = exportCtx.getImageData(0, 0, width, height)
            frameBytes = new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength)
            lastSvg = rawSvg
            lastRawFrame = frameBytes.slice()
          }

          // Stream to FFmpeg with backpressure
          await window.api.writeExportFrame({
            exportId,
            frameData: frameBytes
          })

          const now = performance.now()
          if (now - lastProgressUpdate > 100 || index === frameCount - 1) {
            lastProgressUpdate = now
            const frameProgress = (index + 1) / frameCount
            const elapsedMs = now - exportStartedAt
            setExportProgress((state) => ({
              ...state,
              percent: 5 + Math.round(frameProgress * 80),
              stage: 'رسم وبث الإطارات',
              detail: `${index + 1} من ${frameCount} إطار · ${rasterBackend}`,
              elapsedMs,
              estimatedMs: frameProgress > 0 ? elapsedMs / frameProgress : null
            }))
          }
        }

        // Release the last frame references before waiting for FFmpeg to close.
        lastSvg = ''
        lastRawFrame = null

        // Close stream & wait for FFmpeg to finish encoding & final hold
        setExportStatus(`جارٍ إتمام وحفظ ملف ${exportFormat.toUpperCase()}...`)
        setExportProgress((state) => ({
          ...state,
          percent: 88,
          stage: 'إتمام ملف الوسائط',
          detail: 'إغلاق البث وحفظ الإخراج...'
        }))

        await window.api.finishExportStream({ exportId })
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
      const failedExportId = activeExportIdRef.current
      if (!cancelled && failedExportId && window.api?.cancelExportStream) {
        void window.api.cancelExportStream(failedExportId).catch(() => false)
      }
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

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="theme-toggle"
                  onClick={onToggleTheme}
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-pressed={theme === 'dark'}
                >
                  {theme === 'dark' ? (
                    <Sun size={16} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <Moon size={16} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </button>
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
            </div>

            {/* Tegaki Generator Board Viewport */}
            <div className="canvas-viewport">
              <div className="svg-container">
                <TegakiBoard
                  engineSetup={engineSetup}
                  progressMs={effectiveProgressMs}
                  showFullPreview={showFullPreview}
                  strokeColor={strokeColor}
                  shadowColor={shadowStyle.color}
                  shadowOpacity={shadowStyle.opacity}
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
            <form
              className="input-group"
              onSubmit={(event) => {
                event.preventDefault()
                applyPendingWord()
              }}
            >
              <label htmlFor="arabic-text-input" className="input-label">
                اكتب حرفاً أو كلمة
              </label>
              <div className="input-action-row">
                <div className="input-wrapper">
                  <input
                    id="arabic-text-input"
                    type="text"
                    className="arabic-input"
                    value={pendingWord}
                    onChange={(e) => setPendingWord(e.target.value)}
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
                <button
                  type="submit"
                  className="apply-word-btn"
                  disabled={!pendingWord.trim()}
                  title="تطبيق النص وبدء تجهيز الرسم"
                >
                  <Check size={17} strokeWidth={2.4} aria-hidden="true" />
                  <span>تطبيق</span>
                </button>
              </div>
            </form>

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

            {/* Setting: Shadow Color */}
            <div className="setting-row">
              <span className="setting-label">لون الظل</span>
              <div className="segmented-toggle two-options">
                <button
                  type="button"
                  className={`toggle-option ${shadowMode === 'default' ? 'selected' : ''}`}
                  onClick={() => setShadowMode('default')}
                  title="Use the default shadow color"
                >
                  <span className="shadow-option-swatch shadow-option-swatch-default" aria-hidden="true" />
                  <span>الافتراضي</span>
                </button>
                <button
                  type="button"
                  className={`toggle-option ${shadowMode === 'white' ? 'selected' : ''}`}
                  onClick={() => setShadowMode('white')}
                  title="Use a low-opacity white shadow"
                >
                  <span className="shadow-option-swatch shadow-option-swatch-white" aria-hidden="true" />
                  <span>أبيض خفيف</span>
                </button>
              </div>
            </div>
          </div>

          {/* Standalone Export Card */}
          <div className="export-card">
            <div className="export-header">
              <div>
                <h3 className="export-title">
                  {exportFormat === 'html' ? 'تصدير ملف تفاعلي' : 'تصدير لقطة ثابتة'}
                </h3>
                <span className="export-description">
                  {exportFormat === 'html'
                    ? 'ملف HTML مستقل يحتوي على حركة الرسم وأدوات التشغيل'
                    : `لقطة هندسية من لحظة العرض الحالية (${Math.round(effectiveProgressMs)}ms)`}
                </span>
              </div>
              <button
                type="button"
                className="download-btn"
                onClick={handleExport}
                disabled={!exportReady || exportBusy}
                title={
                  exportReady
                    ? exportFormat === 'html'
                      ? 'تحميل ملف HTML تفاعلي'
                      : 'تحميل اللقطة الحالية'
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
              {/* HTML Card (self-contained animation) */}
              <div
                className={`export-tile ${exportFormat === 'html' ? 'selected' : ''}`}
                onClick={() => selectExportFormat('html')}
              >
                <span className="tile-badge html-badge">HTML</span>
              </div>

              {/* SVG Card (static snapshot) */}
              <div
                className={`export-tile ${exportFormat === 'svg' ? 'selected' : ''}`}
                onClick={() => selectExportFormat('svg')}
              >
                <span className="tile-badge svg-badge">SVG</span>
              </div>

              {/* PNG Card */}
              <div
                className={`export-tile ${exportFormat === 'png' ? 'selected' : ''}`}
                onClick={() => selectExportFormat('png')}
              >
                <span className="tile-badge png-badge">PNG</span>
              </div>

              {/* GIF Card */}
              <div
                className={`export-tile ${exportFormat === 'gif' ? 'selected' : ''}`}
                onClick={() => selectExportFormat('gif')}
              >
                <span className="tile-badge gif-badge">GIF</span>
              </div>

              {/* MP4 Card */}
              <div
                className={`export-tile ${exportFormat === 'mp4' ? 'selected' : ''}`}
                onClick={() => selectExportFormat('mp4')}
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
                <span>معدل الإطارات</span>
                <select
                  value={animatedExportConfig.fps}
                  onChange={(event) =>
                    setAnimatedExportConfig((state) => ({ ...state, fps: Number(event.target.value) }))
                  }
                >
                  {(() => {
                    const baseFps = ANIMATED_EXPORT_SETTINGS[exportFormat]?.fps || 30
                    const options = [baseFps, Math.max(1, Math.floor(baseFps / 2))]
                    return options.map((fpsOption, index) => (
                      <option key={fpsOption} value={fpsOption}>
                        {index === 0 ? `الحالي — ${fpsOption} FPS` : `النصف — ${fpsOption} FPS`}
                      </option>
                    ))
                  })()}
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
