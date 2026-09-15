import React, { useEffect, useRef } from 'react'
import { PenTool } from 'lucide-react'
import { svgPathProperties } from 'svg-path-properties'
import {
  DEFAULT_STROKE_WEIGHT,
  getBridgeHandoffProgress,
  getBrushSquareGeometry,
  prepareRenderScene,
  renderSvgFrame
} from '../engine'

function fmtNum(n) {
  return String(Math.round(n * 100) / 100)
}

function clamp(value) {
  return Math.max(0, Math.min(1, value))
}

const MAX_BODY_TANGENT_WINDOW = 0.014
const MAX_DOT_TANGENT_WINDOW = 0.08
const BODY_TANGENT_WINDOW_UNITS = 9
const DOT_TANGENT_WINDOW_UNITS = 6

function tangentWindow(profile, isDot, length) {
  const configured = profile?.tangentWindow
  if (typeof configured === 'number') return Math.max(0.001, configured)
  const maxWindow = isDot ? MAX_DOT_TANGENT_WINDOW : MAX_BODY_TANGENT_WINDOW
  const windowUnits = isDot ? DOT_TANGENT_WINDOW_UNITS : BODY_TANGENT_WINDOW_UNITS
  return Math.min(maxWindow, windowUnits / length)
}

function getProgressClipPolygon(pathProps, length, progress) {
  if (!length || progress <= 0 || progress >= 1) return null

  const point = pathProps.getPointAtLength(length * progress)
  const halfWin = Math.min(0.08, 6 / length)
  let t0 = progress - halfWin
  let t1 = progress + halfWin
  if (t0 < 0) {
    t1 = Math.min(1, t1 - t0)
    t0 = 0
  } else if (t1 > 1) {
    t0 = Math.max(0, t0 - (t1 - 1))
    t1 = 1
  }

  const before = pathProps.getPointAtLength(length * t0)
  const after = pathProps.getPointAtLength(length * t1)
  const dx = after.x - before.x
  const dy = after.y - before.y
  const magnitude = Math.hypot(dx, dy)
  if (!magnitude) return null

  const tangentX = dx / magnitude
  const tangentY = dy / magnitude
  const normalX = -tangentY
  const normalY = tangentX
  const extent = 10000
  const p1 = { x: point.x + normalX * extent, y: point.y + normalY * extent }
  const p2 = { x: point.x - normalX * extent, y: point.y - normalY * extent }
  const p3 = { x: point.x - tangentX * extent - normalX * extent, y: point.y - tangentY * extent - normalY * extent }
  const p4 = { x: point.x - tangentX * extent + normalX * extent, y: point.y - tangentY * extent + normalY * extent }

  return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`
}

function precomputeCursorTimeline(engineSetup) {
  if (!engineSetup?.timeline?.steps?.length || !engineSetup?.glyphs?.length) return null

  const steps = engineSetup.timeline.steps
  const transitions = []
  const stepData = []

  for (const step of steps) {
    const transition = step.transition
    if (!transition || transition.endMs <= transition.startMs) continue
    try {
      const pathProps = new svgPathProperties(transition.path)
      transitions.push({
        transition,
        pathProps,
        length: pathProps.getTotalLength()
      })
    } catch {
      // A malformed transition must not stop the board from rendering its stroke.
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const glyph = engineSetup.glyphs[s.glyphIndex]
    if (glyph && s.stroke?.medianPath) {
      try {
        const props = new svgPathProperties(s.stroke.medianPath)
        const length = props.getTotalLength()
        stepData.push({
          step: s,
          length,
          pathProps: props,
          glyphX: glyph.glyphX || 0,
          glyphY: glyph.glyphY || 0
        })
      } catch {
        stepData.push(null)
      }
    } else {
      stepData.push(null)
    }
  }

  return { steps, transitions, stepData, totalDurationMs: engineSetup.timeline.totalDurationMs }
}

function getPrecomputedCursor(cursorTimeline, progressMs) {
  if (!cursorTimeline) return null
  const { steps, transitions, stepData, totalDurationMs } = cursorTimeline

  // The animation timeline is the only source of truth for pen travel. This
  // keeps bridge motion and lifted motion identical in the board and exports.
  for (const item of transitions) {
    const transition = item.transition
    if (progressMs > transition.startMs && progressMs < transition.endMs) {
      const duration = transition.endMs - transition.startMs
      const transitionT = duration > 0 ? (progressMs - transition.startMs) / duration : 0
      const easedT = transitionT * transitionT * (3 - 2 * transitionT)
      const point = item.pathProps.getPointAtLength(item.length * easedT)
      return { x: point.x, y: point.y, isLifted: transition.kind === 'lift' }
    }
  }

  // 2. Check active step
  let targetStepIdx = -1
  let stepProgress = 0
  if (progressMs <= 0) {
    targetStepIdx = 0
    stepProgress = 0
  } else if (progressMs >= totalDurationMs) {
    targetStepIdx = steps.length - 1
    stepProgress = 1
  } else {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      if (progressMs >= s.startMs && progressMs <= s.endMs) {
        targetStepIdx = i
        const dur = s.endMs - s.startMs
        stepProgress = dur > 0 ? (progressMs - s.startMs) / dur : 0
        break
      }
    }
    if (targetStepIdx === -1) {
      for (let i = steps.length - 1; i >= 0; i--) {
        if (progressMs >= steps[i].endMs) {
          targetStepIdx = i
          stepProgress = 1
          break
        }
      }
      if (targetStepIdx === -1) {
        targetStepIdx = 0
        stepProgress = 0
      }
    }
  }

  const sd = stepData[targetStepIdx]
  if (!sd) return null

  const clampedProgress = Math.max(0, Math.min(1, stepProgress))
  const easedProgress = clampedProgress * clampedProgress * (3 - 2 * clampedProgress)
  const pt = sd.pathProps.getPointAtLength(sd.length * easedProgress)
  return {
    x: pt.x + sd.glyphX,
    y: pt.y + sd.glyphY,
    isLifted: false
  }
}

/**
 * High-performance TegakiBoard Component.
 * Employs an Incremental SVG Live Adapter:
 * - Mounts static SVG tree once per word composition.
 * - Subscribes to AnimationEngine ticks directly (0 parent StudioView rerenders).
 * - Appends newly crossed fixed stamps only to the active stroke mask.
 * - Updates one movable "head stamp" at the active position.
 * - Directly updates the tracking cursor transform via SVG attributes.
 */
export default function TegakiBoard({
  engineSetup,
  progressMs = 0,
  showFullPreview = false,
  strokeColor = '#0f766e',
  shadowColor = '#cbd5e1',
  shadowOpacity = 0.45,
  showShadowLayer = true,
  showTrackingCursor = true,
  showBaseline = false,
  strokeWeight = DEFAULT_STROKE_WEIGHT,
  stageWidth = 800,
  stageHeight = 380
}) {
  const wrapperRef = useRef(null)
  const sceneRef = useRef(null)
  const cursorTimelineRef = useRef(null)
  const committedCountsRef = useRef([])
  const lastProgressRef = useRef(-1)
  const activeStrokeCursorRef = useRef(0)
  const domRefs = useRef(null)

  const hasGlyphs = Boolean(engineSetup?.glyphs && engineSetup.glyphs.length > 0)
  const liveStampSpacingScale = 3

  // Build narrow-brush stamp HTML for sample index i of a prepared stroke
  const buildStampHtml = (stroke, sampleIdx, weight) => {
    const offset = sampleIdx * 4
    const clampedProg = stroke.samples[offset]
    const px = stroke.samples[offset + 1]
    const py = stroke.samples[offset + 2]
    const angle = stroke.samples[offset + 3]

    const { width, height } = getBrushSquareGeometry(stroke, clampedProg, weight)
    return `<rect x="${fmtNum(-width / 2)}" y="${fmtNum(-height / 2)}" width="${fmtNum(width)}" height="${fmtNum(height)}" transform="translate(${fmtNum(px)} ${fmtNum(py)}) rotate(${fmtNum(angle)})" />`
  }

  // Build head stamp HTML at arbitrary progress
  const buildHeadStampHtml = (stroke, prog, weight) => {
    const clampedProg = clamp(prog)
    const point = stroke.pathProps.getPointAtLength(stroke.length * clampedProg)
    const halfWin = tangentWindow(stroke.brushProfile, stroke.isDot, stroke.length)
    let t0 = clampedProg - halfWin
    let t1 = clampedProg + halfWin
    if (t0 < 0) {
      t1 = Math.min(1, t1 - t0)
      t0 = 0
    } else if (t1 > 1) {
      t0 = Math.max(0, t0 - (t1 - 1))
      t1 = 1
    }
    const before = stroke.pathProps.getPointAtLength(stroke.length * t0)
    const after = stroke.pathProps.getPointAtLength(stroke.length * t1)
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * (180 / Math.PI)
    const { width, height } = getBrushSquareGeometry(stroke, clampedProg, weight)
    return `<rect x="${fmtNum(-width / 2)}" y="${fmtNum(-height / 2)}" width="${fmtNum(width)}" height="${fmtNum(height)}" transform="translate(${fmtNum(point.x)} ${fmtNum(point.y)}) rotate(${fmtNum(angle)})" />`
  }

  // 1. Mount static SVG tree when composition or dimensions change
  useEffect(() => {
    if (!hasGlyphs || !wrapperRef.current) return

    let scene = prepareRenderScene(
      engineSetup.glyphs,
      engineSetup.timeline,
      'studio-live',
      {
        stageWidth,
        stageHeight,
        showBaseline,
        strokeWeight,
        includeMedianLayer: false,
        stampSpacingScale: 1
      }
    )

    // Long words can create thousands of SVG mask rectangles. The live board
    // only needs overlapping brush coverage, so use fewer larger-overlap
    // stamps there; exports keep the canonical spacing and full fidelity.
    const liveStampCount = scene.strokes.reduce(
      (total, stroke) => total + stroke.fixedCount + 1,
      0
    )
    if (liveStampCount > 2500) {
      scene = prepareRenderScene(
        engineSetup.glyphs,
        engineSetup.timeline,
        'studio-live',
        {
          stageWidth,
          stageHeight,
          showBaseline,
          strokeWeight,
          includeMedianLayer: false,
          stampSpacingScale: liveStampSpacingScale
        }
      )
    }
    sceneRef.current = scene
    cursorTimelineRef.current = precomputeCursorTimeline(engineSetup)

    // The parent intentionally receives only semantic engine updates, so its
    // progressMs prop can lag behind the live animation clock. Rebuilding the
    // scene for a brush-weight change must restore the engine's real position;
    // otherwise both the ink and its mask-backed frame appear to disappear.
    const liveProgressMs = engineSetup.engine?.getState?.().progressMs ?? progressMs
    const initialMs = showFullPreview ? (engineSetup.timeline?.totalDurationMs || 1) : liveProgressMs
    let initialSvg = renderSvgFrame(scene, initialMs)

    // Add cursor markup container inside word-group
    if (showTrackingCursor) {
      const cursorRadius = Math.max(20, strokeWeight / 2)
      const cursorOutline = Math.max(3, strokeWeight * 0.055)
      const cursorMarkup = `
        <g id="tracking-cursor-layer">
          <g id="tracking-cursor" class="tracking-cursor" transform="translate(-10000, -10000)">
            <circle
              r="${fmtNum(cursorRadius)}"
              fill="#a16207"
              fill-opacity="0.05"
              stroke="#a16207"
              stroke-opacity="0.32"
              stroke-width="${fmtNum(cursorOutline)}"
            />
            <circle
              r="${fmtNum(Math.max(4, strokeWeight * 0.08))}"
              fill="var(--active-ink-color, #0d9488)"
              fill-opacity="0.88"
              stroke="#fef3c7"
              stroke-width="2"
            />
          </g>
        </g>`
      initialSvg = initialSvg.replace(/<\/g>\s*<\/svg>\s*$/, `${cursorMarkup}\n        </g>\n      </svg>`)
    }

    initialSvg = initialSvg.replace('<svg id="writing-stage"', '<svg id="writing-stage" class="tegaki-board-svg"')

    wrapperRef.current.innerHTML = initialSvg

    // Apply shadow / ghost layer visibility
    const ghostEl = wrapperRef.current.querySelector('#ghost-layer')
    if (ghostEl) {
      ghostEl.style.display = showShadowLayer ? '' : 'none'
    }

    // Cache DOM references for rapid incremental mutations
    const strokes = scene.strokes
    const strokeDoms = strokes.map((stroke) => {
      const maskEl = wrapperRef.current.querySelector(`#${stroke.maskId}`)
      const stampGroup = maskEl?.querySelector('.dot-mask-stamps, .body-mask-stamps')
      const clipPoly = wrapperRef.current.querySelector(`#${stroke.progressClipId} polygon`)
      return {
        maskEl,
        stampGroup,
        clipPoly,
        headEl: null
      }
    })

    // Create a dedicated head-stamp container in each mask group
    strokeDoms.forEach((sd) => {
      if (sd.stampGroup) {
        let headGroup = sd.stampGroup.querySelector('.head-stamp-group')
        if (!headGroup) {
          headGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          headGroup.setAttribute('class', 'head-stamp-group')
          sd.stampGroup.appendChild(headGroup)
        }
        sd.headEl = headGroup
      }
    })

    const cursorEl = wrapperRef.current.querySelector('#tracking-cursor')

    domRefs.current = {
      ghostEl,
      strokeDoms,
      cursorEl
    }

    // Initialize committed counts
    // -1 means that no fixed stamp has been committed yet. Keeping index 0
    // distinct prevents the first brush stamp from being skipped on replay.
    committedCountsRef.current = new Array(strokes.length).fill(showFullPreview ? 999999 : -1)
    activeStrokeCursorRef.current = 0
    lastProgressRef.current = initialMs

    // Position cursor for initial frame
    if (cursorEl && cursorTimelineRef.current) {
      const pos = getPrecomputedCursor(cursorTimelineRef.current, initialMs)
      if (pos) {
        cursorEl.setAttribute('transform', `translate(${fmtNum(pos.x)}, ${fmtNum(pos.y)})`)
        cursorEl.classList.toggle('pen-lifted', Boolean(pos.isLifted))
      }
    }
  }, [
    hasGlyphs,
    engineSetup,
    stageWidth,
    stageHeight,
    showBaseline,
    strokeWeight,
    showShadowLayer
  ])

  // 2. High-Frequency Direct Subscription to AnimationEngine
  useEffect(() => {
    if (!hasGlyphs || !engineSetup?.engine) return

    const unsub = engineSetup.engine.subscribe((st) => {
      if (showFullPreview) return
      const currentMs = st.progressMs
      const scene = sceneRef.current
      const dom = domRefs.current
      if (!scene || !dom) return

      const strokes = scene.strokes
      const committed = committedCountsRef.current
      const isBackward = currentMs < lastProgressRef.current
      const isReplayStart =
        currentMs === 0 &&
        (lastProgressRef.current > 0 ||
          activeStrokeCursorRef.current > 0 ||
          committed.some((count) => count > 0))
      lastProgressRef.current = currentMs

      // If playback jumped backward (repeat-step, seek, reset), re-synchronize all masks
      if (isBackward || isReplayStart) {
        activeStrokeCursorRef.current = 0
        for (let sIdx = 0; sIdx < strokes.length; sIdx++) {
          const stroke = strokes[sIdx]
          const sd = dom.strokeDoms[sIdx]
          if (!sd?.stampGroup) continue

          let prog = 0
          if (stroke.step) {
            const duration = stroke.step.endMs - stroke.step.startMs
            const t = currentMs - stroke.step.startMs
            const linearT = clamp(duration > 0 ? t / duration : 0)
            prog = linearT * linearT * (3 - 2 * linearT)
          } else if (currentMs > 0) {
            prog = 1
          }

          if (prog <= 0) {
            // Clearing innerHTML detaches the cached head node. Recreate and
            // attach it atomically so the next forward frame has a valid
            // insertion anchor after reset/replay.
            const headGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
            headGroup.setAttribute('class', 'head-stamp-group')
            sd.stampGroup.replaceChildren(headGroup)
            sd.headEl = headGroup
            committed[sIdx] = -1
            if (sd.clipPoly) sd.clipPoly.removeAttribute('points')
          } else {
            const activeCount = Math.min(stroke.fixedCount, Math.floor((stroke.length * prog) / stroke.spacing))
            let stampsHtml = ''
            for (let i = 0; i <= activeCount; i++) {
              stampsHtml += buildStampHtml(stroke, i, scene.strokeWeight)
            }
            sd.stampGroup.innerHTML = stampsHtml
            const headGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
            headGroup.setAttribute('class', 'head-stamp-group')
            sd.stampGroup.appendChild(headGroup)
            sd.headEl = headGroup

            const lastFixed = Math.min(1, (activeCount * stroke.spacing) / stroke.length)
            if (prog > lastFixed && prog < 1) {
              headGroup.innerHTML = buildHeadStampHtml(stroke, prog, scene.strokeWeight)
            }
            committed[sIdx] = activeCount

            if (sd.clipPoly && stroke.isDot) {
              const poly = getProgressClipPolygon(stroke.pathProps, stroke.length, prog)
              if (poly) sd.clipPoly.setAttribute('points', poly)
              else sd.clipPoly.removeAttribute('points')
            }
          }
        }
      } else {
        // Forward Playback: Strictly O(1) active-stroke tracking cursor!
        // 1. Finalize newly passed strokes up to currentMs
        while (
          activeStrokeCursorRef.current < strokes.length &&
          strokes[activeStrokeCursorRef.current].step &&
          strokes[activeStrokeCursorRef.current].step.endMs <= currentMs
        ) {
          const sIdx = activeStrokeCursorRef.current
          const stroke = strokes[sIdx]
          const sd = dom.strokeDoms[sIdx]
          const curCommitted = committed[sIdx] ?? -1
          if (sd && curCommitted < stroke.fixedCount) {
            let newStamps = ''
            for (let i = curCommitted + 1; i <= stroke.fixedCount; i++) {
              newStamps += buildStampHtml(stroke, i, scene.strokeWeight)
            }
            if (sd.headEl) {
              sd.headEl.insertAdjacentHTML('beforebegin', newStamps)
              sd.headEl.innerHTML = ''
            } else if (sd.stampGroup) {
              sd.stampGroup.insertAdjacentHTML('beforeend', newStamps)
            }
            committed[sIdx] = stroke.fixedCount
            if (sd.clipPoly) sd.clipPoly.removeAttribute('points')
          }
          activeStrokeCursorRef.current++
        }

        // 2. Active stroke is precisely at activeStrokeCursorRef.current (single O(1) update)
        const sIdx = activeStrokeCursorRef.current
        if (sIdx < strokes.length) {
          const stroke = strokes[sIdx]
          const sd = dom.strokeDoms[sIdx]
          if (sd?.stampGroup) {
            let prog = 0
            if (stroke.step) {
              const duration = stroke.step.endMs - stroke.step.startMs
              const t = currentMs - stroke.step.startMs
              const linearT = clamp(duration > 0 ? t / duration : 0)
              prog = linearT * linearT * (3 - 2 * linearT)
            } else if (currentMs > 0) {
              prog = 1
            }
            prog = Math.max(prog, getBridgeHandoffProgress(stroke.step, currentMs))

            const curCommitted = committed[sIdx] ?? -1
            if (prog > 0 && prog < 1) {
              const targetCount = Math.min(
                stroke.fixedCount,
                Math.floor((stroke.length * prog) / stroke.spacing)
              )
              if (targetCount > curCommitted) {
                let newStamps = ''
                for (let i = curCommitted + 1; i <= targetCount; i++) {
                  newStamps += buildStampHtml(stroke, i, scene.strokeWeight)
                }
                if (sd.headEl) {
                  sd.headEl.insertAdjacentHTML('beforebegin', newStamps)
                } else {
                  sd.stampGroup.insertAdjacentHTML('beforeend', newStamps)
                }
                committed[sIdx] = targetCount
              }

              // Move the head stamp to the exact continuous position
              const lastFixed = Math.min(1, (targetCount * stroke.spacing) / stroke.length)
              if (sd.headEl) {
                if (prog > lastFixed) {
                  sd.headEl.innerHTML = buildHeadStampHtml(stroke, prog, scene.strokeWeight)
                } else {
                  sd.headEl.innerHTML = ''
                }
              }

              // Update dot progress clip
              if (sd.clipPoly && stroke.isDot) {
                const poly = getProgressClipPolygon(stroke.pathProps, stroke.length, prog)
                if (poly) sd.clipPoly.setAttribute('points', poly)
              }
            } else if (prog >= 1 && curCommitted < stroke.fixedCount) {
              let newStamps = ''
              for (let i = curCommitted + 1; i <= stroke.fixedCount; i++) {
                newStamps += buildStampHtml(stroke, i, scene.strokeWeight)
              }
              if (sd.headEl) {
                sd.headEl.insertAdjacentHTML('beforebegin', newStamps)
                sd.headEl.innerHTML = ''
              } else {
                sd.stampGroup.insertAdjacentHTML('beforeend', newStamps)
              }
              committed[sIdx] = stroke.fixedCount
              if (sd.clipPoly) sd.clipPoly.removeAttribute('points')
            }
          }
        }
      }

      // Update Cursor directly
      if (showTrackingCursor && dom.cursorEl && cursorTimelineRef.current) {
        const pos = getPrecomputedCursor(cursorTimelineRef.current, currentMs)
        if (pos) {
          dom.cursorEl.setAttribute('transform', `translate(${fmtNum(pos.x)}, ${fmtNum(pos.y)})`)
          dom.cursorEl.classList.toggle('pen-lifted', Boolean(pos.isLifted))
        }
      }
    })

    return () => unsub()
  }, [hasGlyphs, engineSetup, showFullPreview, showTrackingCursor])

  // Update strokeColor dynamically via CSS variable
  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.setProperty('--active-ink-color', strokeColor)
      wrapperRef.current.style.setProperty('--shadow-layer-color', shadowColor)
      wrapperRef.current.style.setProperty('--shadow-layer-opacity', String(shadowOpacity))
    }
  }, [shadowColor, shadowOpacity, strokeColor])

  if (!hasGlyphs) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--studio-text-muted, #64748b)',
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
      ref={wrapperRef}
      className="tegaki-board-wrapper"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '--active-ink-color': strokeColor,
        '--shadow-layer-color': shadowColor,
        '--shadow-layer-opacity': shadowOpacity
      }}
    />
  )
}
