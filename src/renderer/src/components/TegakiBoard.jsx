import React, { useMemo } from 'react'
import { PenTool } from 'lucide-react'
import { svgPathProperties } from 'svg-path-properties'
import { renderSvg } from '../engine'

/**
 * Calculates the local word-group coordinates for the tracking cursor
 * during animation playback.
 */
function getTrackingCursor(engineSetup, progressMs, strokeColor) {
  if (!engineSetup?.timeline?.steps?.length || !engineSetup?.glyphs?.length) {
    return ''
  }

  const steps = engineSetup.timeline.steps
  const totalDuration = engineSetup.timeline.totalDurationMs

  let step = null
  let stepProgress = 0

  if (progressMs <= 0) {
    step = steps[0]
    stepProgress = 0
  } else if (progressMs >= totalDuration) {
    step = steps[steps.length - 1]
    stepProgress = 1
  } else {
    // 1. Check if progress falls into an inter-stroke pause between steps
    for (let i = 0; i < steps.length - 1; i++) {
      const cur = steps[i]
      const next = steps[i + 1]
      if (progressMs > cur.endMs && progressMs < next.startMs) {
        const curGlyph = engineSetup.glyphs[cur.glyphIndex]
        const nextGlyph = engineSetup.glyphs[next.glyphIndex]
        if (curGlyph && nextGlyph) {
          try {
            let p0 = null
            if (cur.stroke?.medianPath) {
              const curProps = new svgPathProperties(cur.stroke.medianPath)
              p0 = curProps.getPointAtLength(curProps.getTotalLength())
            } else if (cur.stroke?.endPoint) {
              p0 = cur.stroke.endPoint
            }

            let p1 = null
            if (next.stroke?.medianPath) {
              const nextProps = new svgPathProperties(next.stroke.medianPath)
              p1 = nextProps.getPointAtLength(0)
            } else if (next.stroke?.startPoint) {
              p1 = next.stroke.startPoint
            }

            if (p0 && p1) {
              const startX = p0.x + (curGlyph.glyphX || 0)
              const startY = p0.y + (curGlyph.glyphY || 0)
              const endX = p1.x + (nextGlyph.glyphX || 0)
              const endY = p1.y + (nextGlyph.glyphY || 0)

              const dist = Math.hypot(endX - startX, endY - startY)
              const pauseDur = next.startMs - cur.endMs
              const pauseT = pauseDur > 0 ? (progressMs - cur.endMs) / pauseDur : 0
              const easeT = pauseT * pauseT * (3 - 2 * pauseT)

              // Calligraphic arc lift: upward in SVG font coordinates (negative Y is up)
              const arcHeight = Math.min(120, dist * 0.3)
              const midX = (startX + endX) / 2
              const midY = (startY + endY) / 2 - arcHeight

              // Quadratic Bézier curve for natural pen lift and travel
              const cursorX =
                (1 - easeT) * (1 - easeT) * startX +
                2 * (1 - easeT) * easeT * midX +
                easeT * easeT * endX
              const cursorY =
                (1 - easeT) * (1 - easeT) * startY +
                2 * (1 - easeT) * easeT * midY +
                easeT * easeT * endY

              return `<g id="tracking-cursor" class="tracking-cursor pen-lifted" transform="translate(${cursorX}, ${cursorY})">
                <circle r="8" fill="#d97706" fill-opacity="0.2" stroke="#d97706" stroke-dasharray="2.5 2.5" stroke-width="1.2" />
                <circle r="3.2" fill="#f59e0b" stroke="#ffffff" stroke-width="1.4" />
              </g>`
            }
          } catch {
            // fallback to step matching below
          }
        }
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      if (progressMs >= s.startMs && progressMs <= s.endMs) {
        step = s
        const dur = s.endMs - s.startMs
        stepProgress = dur > 0 ? (progressMs - s.startMs) / dur : 0
        break
      }
    }

    // Fallback if progress falls in an inter-step interval
    if (!step) {
      for (let i = steps.length - 1; i >= 0; i--) {
        if (progressMs >= steps[i].endMs) {
          step = steps[i]
          stepProgress = 1
          break
        }
      }
      if (!step) {
        step = steps[0]
        stepProgress = 0
      }
    }
  }

  if (!step || !step.stroke?.medianPath) {
    return ''
  }

  const glyph = engineSetup.glyphs[step.glyphIndex]
  if (!glyph) return ''

  try {
    const props = new svgPathProperties(step.stroke.medianPath)
    const len = props.getTotalLength()
    if (!len || isNaN(len)) return ''

    const clampedProgress = Math.max(0, Math.min(1, stepProgress))
    // Synchronize with smoothstep easing in svg-renderer for lockstep movement
    const easedProgress = clampedProgress * clampedProgress * (3 - 2 * clampedProgress)
    const pt = props.getPointAtLength(len * easedProgress)
    const gx = glyph.glyphX || 0
    const gy = glyph.glyphY || 0

    const cursorX = pt.x + gx
    const cursorY = pt.y + gy

    return `<g id="tracking-cursor" class="tracking-cursor" transform="translate(${cursorX}, ${cursorY})">
      <circle r="10" fill="#d97706" fill-opacity="0.30" />
      <circle r="4.2" fill="${strokeColor || '#0d9488'}" stroke="#ffffff" stroke-width="1.8" />
    </g>`
  } catch {
    return ''
  }
}

/**
 * Interactive Tegaki Board Component.
 * Stateless presenter wrapping the canonical Phase 3 renderSvg() engine.
 * Renders verified TrueType outline geometry, progressive mask-revealed ink,
 * reference ghost layer, baseline, and presentation tracking cursor.
 */
export default function TegakiBoard({
  engineSetup,
  progressMs = 0,
  strokeColor = '#0f766e',
  showShadowLayer = true,
  showTrackingCursor = true,
  showBaseline = true,
  strokeWeight = 102,
  stageWidth = 800,
  stageHeight = 380
}) {
  const hasGlyphs = Boolean(engineSetup?.glyphs && engineSetup.glyphs.length > 0)

  const renderedSvgHtml = useMemo(() => {
    if (!hasGlyphs) return ''

    let svgStr = renderSvg(
      engineSetup.glyphs,
      engineSetup.timeline,
      progressMs,
      'studio-live',
      {
        stageWidth,
        stageHeight,
        showBaseline,
        strokeWeight
      }
    )

    // Apply shadow / ghost layer visibility
    if (!showShadowLayer) {
      svgStr = svgStr.replace('id="ghost-layer"', 'id="ghost-layer" style="display: none;"')
    }

    // Attach tracking cursor inside word-group
    if (showTrackingCursor) {
      const cursorMarkup = getTrackingCursor(engineSetup, progressMs, strokeColor)
      if (cursorMarkup) {
        svgStr = svgStr.replace(/<\/g>\s*<\/svg>\s*$/, `${cursorMarkup}\n        </g>\n      </svg>`)
      }
    }

    // Ensure tegaki-board-svg class is present
    svgStr = svgStr.replace('<svg id="writing-stage"', '<svg id="writing-stage" class="tegaki-board-svg"')

    return svgStr
  }, [
    hasGlyphs,
    engineSetup,
    progressMs,
    strokeColor,
    showShadowLayer,
    showTrackingCursor,
    showBaseline,
    strokeWeight,
    stageWidth,
    stageHeight
  ])

  if (!hasGlyphs) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#64748b',
          fontSize: '1rem',
          fontWeight: 600
        }}
      >
        <PenTool size={40} strokeWidth={1.8} style={{ marginBottom: '0.5rem' }} aria-hidden="true" />
        <span>جاري تجهيز مسارات الخط العربي الموثقة...</span>
      </div>
    )
  }

  return (
    <div
      className="tegaki-board-wrapper"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '--active-ink-color': strokeColor
      }}
      dangerouslySetInnerHTML={{ __html: renderedSvgHtml }}
    />
  )
}
