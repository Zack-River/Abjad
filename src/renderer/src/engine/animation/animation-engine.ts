import { ComposedGlyph } from '../composition/glyph-composer'
import { Stroke } from '../data/stroke-db'
import { svgPathProperties } from 'svg-path-properties'

const RAA_REFERENCE_INK_UNITS_PER_MS = 0.177012621
const HANDOFF_START_INSET_UNITS = 32
const MAX_HANDOFF_START_PROGRESS = 0.1

function inkDurationMs(stroke: Stroke, endProgress: number = 1, startProgress: number = 0): number {
  if (!stroke.medianPath) return 1200
  const props = new svgPathProperties(stroke.medianPath)
  const length = props.getTotalLength()
  const start = Math.max(0, Math.min(1, startProgress))
  const end = Math.max(start, Math.min(1, endProgress))
  const visibleLength = length * (end - start)
  return visibleLength > 0 ? visibleLength / RAA_REFERENCE_INK_UNITS_PER_MS : 1200
}

export type AnimationMode = 'idle' | 'play' | 'step' | 'repeat-step' | 'auto-repeat'

export interface AnimationState {
  mode: AnimationMode
  currentStep: number
  progressMs: number
  durationMs: number
  isPaused: boolean
  isComplete: boolean
}

export interface CursorTransition {
  id: string
  kind: 'bridge' | 'lift'
  startMs: number
  endMs: number
  path: string
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
}

export interface AnimationStep {
  id: string
  startMs: number
  endMs: number
  glyphIndex: number
  stroke: Stroke
  isDot: boolean
  /** Initial fraction skipped when entering a normalized connected handoff. */
  startProgress: number
  /** Terminal fraction of the authored path to reveal before a normalized handoff. */
  endProgress: number
  /** Movement before this authored stroke. It is not an educational step. */
  transition?: CursorTransition
}

export interface AnimationTimeline {
  steps: AnimationStep[]
  totalDurationMs: number
}

export const INTER_STROKE_PAUSE_MS = 140
export const PEN_TRAVEL_SPEED = 0.9 // font-units per ms
export const MIN_INTER_GLYPH_PAUSE_MS = 150
export const MAX_INTER_GLYPH_PAUSE_MS = 800
export const CONNECTION_THRESHOLD_UNITS = 120
export const MIN_CONTINUITY_BRIDGE_MS = 24
export const MAX_CONTINUITY_BRIDGE_MS = 96
export const CONTINUITY_TRAVEL_SPEED = 1.6
export const MIN_BRIDGE_TANGENT_ALIGNMENT = 0.25
export const MIN_BRIDGE_FORWARD_PROJECTION = 0.15
/** Small initial brush exposure used while the cursor crosses a bridge. */
export const BRIDGE_HANDOFF_PROGRESS = 0.0001
const MIN_HANDOFF_PROGRESS = 0.55
const MAX_HANDOFF_DISTANCE_UNITS = 36
const MIN_HANDOFF_BACKTRACK_UNITS = 2
const HANDOFF_SEARCH_SAMPLES = 128
const HANDOFF_SEARCH_REFINEMENTS = 8

interface NormalizedHandoff {
  endProgress: number
  startProgress: number
}

interface StrokePointData {
  point: { x: number; y: number }
  tangent: { x: number; y: number }
}

function getStrokePointData(
  stroke: Stroke,
  atEnd: boolean,
  endProgress: number = 1,
  startProgress: number = 0
): StrokePointData | null {
  if (!stroke?.medianPath) return null

  try {
    const props = new svgPathProperties(stroke.medianPath)
    const length = props.getTotalLength()
    if (!length) return null

    const startLength = length * Math.max(0, Math.min(1, startProgress))
    const terminalLength = length * Math.max(startProgress, Math.min(1, endProgress))
    const pointLength = atEnd ? terminalLength : startLength
    const tangentWindow = Math.min(12, Math.max(2, length * 0.02))
    const beforeLength = Math.max(atEnd ? startLength : 0, pointLength - tangentWindow)
    const afterLength = Math.min(terminalLength, pointLength + tangentWindow)
    const before = props.getPointAtLength(beforeLength)
    const after = props.getPointAtLength(afterLength)
    const dx = after.x - before.x
    const dy = after.y - before.y
    const magnitude = Math.hypot(dx, dy)

    return {
      point: props.getPointAtLength(pointLength),
      tangent: magnitude > 0 ? { x: dx / magnitude, y: dy / magnitude } : { x: 1, y: 0 }
    }
  } catch {
    return null
  }
}

function getWorldStrokePoint(
  glyph: ComposedGlyph,
  stroke: Stroke,
  atEnd: boolean,
  endProgress: number = 1,
  startProgress: number = 0
): StrokePointData | null {
  const local = getStrokePointData(stroke, atEnd, endProgress, startProgress)
  if (!local) return null
  return {
    point: {
      x: (glyph.glyphX || 0) + local.point.x,
      y: (glyph.glyphY || 0) + local.point.y
    },
    tangent: local.tangent
  }
}

function isDotStroke(
  stroke: { isCandidateDot?: boolean; type?: string },
  glyph: ComposedGlyph
): boolean {
  return stroke.isCandidateDot === true || stroke.type === 'dot' || glyph.semanticRole === 'dot'
}

function findNextBaseBodyStroke(
  composed: ComposedGlyph[],
  glyphIndex: number
): { glyph: ComposedGlyph; stroke: ComposedGlyph['orderedStrokes'][number] } | null {
  for (let index = glyphIndex + 1; index < composed.length; index += 1) {
    const glyph = composed[index]
    if (glyph.semanticRole !== 'base') continue
    const stroke = glyph.orderedStrokes.find((candidate) => !isDotStroke(candidate, glyph))
    if (stroke) return { glyph, stroke }
  }
  return null
}

function getNormalizedHandoff(
  glyph: ComposedGlyph,
  stroke: ComposedGlyph['orderedStrokes'][number],
  nextGlyph: ComposedGlyph,
  nextStroke: ComposedGlyph['orderedStrokes'][number]
): NormalizedHandoff | null {
  if (!stroke.medianPath || !nextStroke.medianPath) return null

  const fullEnd = getWorldStrokePoint(glyph, stroke as unknown as Stroke, true)
  let nextStartProgress = 0
  try {
    const nextPath = new svgPathProperties(nextStroke.medianPath)
    const nextLength = nextPath.getTotalLength()
    if (!nextLength) return null
    nextStartProgress = Math.min(MAX_HANDOFF_START_PROGRESS, HANDOFF_START_INSET_UNITS / nextLength)
  } catch {
    return null
  }

  const nextStart = getWorldStrokePoint(
    nextGlyph,
    nextStroke as unknown as Stroke,
    false,
    1,
    nextStartProgress
  )
  if (!fullEnd || !nextStart) return null

  const remainingVector = {
    x: nextStart.point.x - fullEnd.point.x,
    y: nextStart.point.y - fullEnd.point.y
  }
  if (dot(fullEnd.tangent, remainingVector) >= -MIN_HANDOFF_BACKTRACK_UNITS) return null

  try {
    const path = new svgPathProperties(stroke.medianPath)
    const length = path.getTotalLength()
    if (!length) return null

    const distanceSquaredAt = (progress: number): number => {
      const point = path.getPointAtLength(length * progress)
      const dx = glyph.glyphX + point.x - nextStart.point.x
      const dy = glyph.glyphY + point.y - nextStart.point.y
      return dx * dx + dy * dy
    }

    let nearestProgress = 1
    let nearestDistanceSquared = Infinity
    const searchStep = (1 - MIN_HANDOFF_PROGRESS) / HANDOFF_SEARCH_SAMPLES
    for (let index = 0; index <= HANDOFF_SEARCH_SAMPLES; index += 1) {
      const progress =
        MIN_HANDOFF_PROGRESS + ((1 - MIN_HANDOFF_PROGRESS) * index) / HANDOFF_SEARCH_SAMPLES
      const distanceSquared = distanceSquaredAt(progress)
      if (distanceSquared < nearestDistanceSquared) {
        nearestProgress = progress
        nearestDistanceSquared = distanceSquared
      }
    }

    // The coarse scan locates the right neighborhood. Refine it so the
    // outgoing terminal is aligned to the incoming start instead of landing
    // several units away because of sample quantization.
    let lower = Math.max(MIN_HANDOFF_PROGRESS, nearestProgress - searchStep)
    let upper = Math.min(1, nearestProgress + searchStep)
    for (let iteration = 0; iteration < HANDOFF_SEARCH_REFINEMENTS; iteration += 1) {
      const left = lower + (upper - lower) / 3
      const right = upper - (upper - lower) / 3
      if (distanceSquaredAt(left) <= distanceSquaredAt(right)) {
        upper = right
      } else {
        lower = left
      }
    }
    const refinedProgress = (lower + upper) / 2
    const refinedDistanceSquared = distanceSquaredAt(refinedProgress)
    if (refinedDistanceSquared < nearestDistanceSquared) {
      nearestProgress = refinedProgress
      nearestDistanceSquared = refinedDistanceSquared
    }

    if (nearestProgress >= 0.99 || nearestDistanceSquared > MAX_HANDOFF_DISTANCE_UNITS ** 2) {
      return null
    }

    return {
      endProgress: nearestProgress,
      startProgress: nextStartProgress
    }
  } catch {
    return null
  }
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y
}

function normalize(point: { x: number; y: number }): { x: number; y: number } {
  const magnitude = Math.hypot(point.x, point.y)
  return magnitude > 0 ? { x: point.x / magnitude, y: point.y / magnitude } : { x: 1, y: 0 }
}

function getBridgeDirections(
  start: StrokePointData,
  end: StrokePointData
): {
  chord: { x: number; y: number }
  startTangent: { x: number; y: number }
  endTangent: { x: number; y: number }
  tangentAlignment: number
} {
  const chord = normalize({
    x: end.point.x - start.point.x,
    y: end.point.y - start.point.y
  })

  // A verified Arabic stroke can reverse direction at a connection. Blend
  // those endpoint tangents toward the short handoff vector so the bridge
  // never travels behind its destination or creates a loop.
  const clampTangent = (tangent: { x: number; y: number }): { x: number; y: number } => {
    const projection = dot(tangent, chord)
    if (projection >= MIN_BRIDGE_FORWARD_PROJECTION) return tangent
    const correction = MIN_BRIDGE_FORWARD_PROJECTION - projection
    return normalize({
      x: tangent.x + chord.x * correction,
      y: tangent.y + chord.y * correction
    })
  }

  return {
    chord,
    startTangent: clampTangent(start.tangent),
    endTangent: clampTangent(end.tangent),
    tangentAlignment: dot(start.tangent, end.tangent)
  }
}

function createTransition(
  id: string,
  kind: CursorTransition['kind'],
  startMs: number,
  durationMs: number,
  start: StrokePointData,
  end: StrokePointData
): CursorTransition {
  const dx = end.point.x - start.point.x
  const dy = end.point.y - start.point.y
  const distance = Math.hypot(dx, dy)
  const handle = Math.min(distance * 0.45, 72)
  const bridgeDirections = kind === 'bridge' ? getBridgeDirections(start, end) : null
  const startTangent = bridgeDirections?.startTangent || start.tangent
  const endTangent = bridgeDirections?.endTangent || end.tangent
  const path = `M ${start.point.x} ${start.point.y} C ${start.point.x + startTangent.x * handle} ${start.point.y + startTangent.y * handle}, ${end.point.x - endTangent.x * handle} ${end.point.y - endTangent.y * handle}, ${end.point.x} ${end.point.y}`

  return {
    id,
    kind,
    startMs,
    endMs: startMs + durationMs,
    path,
    startPoint: start.point,
    endPoint: end.point
  }
}

export function getInterGlyphDistance(
  prevGlyph: ComposedGlyph,
  prevStroke: Stroke,
  nextGlyph: ComposedGlyph,
  nextStroke: Stroke
): number | null {
  const end = getWorldStrokePoint(prevGlyph, prevStroke, true)
  const start = getWorldStrokePoint(nextGlyph, nextStroke, false)
  if (!end || !start) return null
  return Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y)
}

function hasFormSuffix(glyphName: string, suffix: 'init' | 'medi' | 'fina'): boolean {
  return new RegExp(`\\.${suffix}(?:\\.|$)`).test(glyphName)
}

function canConnectToNext(glyph: ComposedGlyph): boolean {
  return hasFormSuffix(glyph.glyphName, 'init') || hasFormSuffix(glyph.glyphName, 'medi')
}

function canConnectFromPrevious(glyph: ComposedGlyph): boolean {
  return hasFormSuffix(glyph.glyphName, 'fina') || hasFormSuffix(glyph.glyphName, 'medi')
}

export function smoothProgress(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

export interface TimelineOptions {
  connectGlyphs?: boolean
}

export function getBridgeHandoffProgress(
  step: AnimationStep | undefined,
  progressMs: number
): number {
  const transition = step?.transition
  if (
    transition?.kind !== 'bridge' ||
    progressMs < transition.startMs ||
    progressMs > transition.endMs
  ) {
    return 0
  }
  return BRIDGE_HANDOFF_PROGRESS
}

export function getStepStrokeProgress(step: AnimationStep, progressMs: number): number {
  const duration = step.endMs - step.startMs
  const linearProgress = Math.max(
    0,
    Math.min(1, duration > 0 ? (progressMs - step.startMs) / duration : 0)
  )
  if (progressMs <= step.startMs) return 0
  return step.startProgress + smoothProgress(linearProgress) * (step.endProgress - step.startProgress)
}

/**
 * Mask coverage follows the authored terminal handoff. A clipped terminal
 * must not reveal the remaining tail of its median path, because that tail
 * can pass beyond the next glyph's start and create an aggressive join.
 */
export function getStepInkProgress(step: AnimationStep, progressMs: number): number {
  const duration = step.endMs - step.startMs
  const linearProgress = Math.max(
    0,
    Math.min(1, duration > 0 ? (progressMs - step.startMs) / duration : 0)
  )
  if (progressMs <= step.startMs) return 0
  return step.startProgress + smoothProgress(linearProgress) * (step.endProgress - step.startProgress)
}

export function buildTimeline(
  composed: ComposedGlyph[],
  options: TimelineOptions = {}
): AnimationTimeline {
  const steps: AnimationStep[] = []
  let currentTimeMs = 0
  let previousBodyStep: AnimationStep | undefined
  const handoffStartProgresses = new Map<string, number>()

  const strokeKey = (
    glyphIndex: number,
    stroke: ComposedGlyph['orderedStrokes'][number]
  ): string =>
    `${glyphIndex}:${stroke.order ?? 0}`

  for (let i = 0; i < composed.length; i++) {
    const glyph = composed[i]

    for (const stroke of glyph.orderedStrokes || []) {
      const isDot = isDotStroke(stroke, glyph)
      const bodyStrokes = glyph.orderedStrokes.filter((candidate) => !isDotStroke(candidate, glyph))
      const isTerminalBodyStroke = !isDot && bodyStrokes[bodyStrokes.length - 1] === stroke
      const nextBody = isTerminalBodyStroke ? findNextBaseBodyStroke(composed, i) : null
      const normalizedHandoff =
        nextBody && canConnectToNext(glyph) && canConnectFromPrevious(nextBody.glyph)
          ? getNormalizedHandoff(glyph, stroke, nextBody.glyph, nextBody.stroke)
          : null
      const endProgress = normalizedHandoff?.endProgress ?? 1
      if (normalizedHandoff && nextBody) {
        handoffStartProgresses.set(strokeKey(i + 1, nextBody.stroke), normalizedHandoff.startProgress)
      }
      const startProgress = handoffStartProgresses.get(strokeKey(i, stroke)) ?? 0
      const durationMs = inkDurationMs(stroke as unknown as Stroke, endProgress, startProgress)

      // When crossing a glyph boundary, calculate physical distance and create
      // either a short cursive bridge or a lifted travel transition.
      const previousStep = steps[steps.length - 1]
      // Dots are intentionally animated between the current letter and the
      // next one. A following body must still use the previous body as its
      // connection anchor; comparing against the dot would turn every dotted
      // word boundary into a lifted move.
      const boundaryStep = isDot ? previousStep : previousBodyStep
      const crossesGlyphBoundary = boundaryStep && boundaryStep.glyphIndex !== i

      let transition: CursorTransition | undefined

      if (crossesGlyphBoundary) {
        const prevGlyph = composed[boundaryStep.glyphIndex]
        const previousStroke = boundaryStep.stroke
        const currentStroke = stroke as unknown as Stroke
        const previousEnd = getWorldStrokePoint(
          prevGlyph,
          previousStroke,
          true,
          boundaryStep.endProgress
        )
        const currentStart = getWorldStrokePoint(
          glyph,
          currentStroke,
          false,
          endProgress,
          startProgress
        )
        const dist =
          previousEnd && currentStart
            ? Math.hypot(
                previousEnd.point.x - currentStart.point.x,
                previousEnd.point.y - currentStart.point.y
              )
            : null

        if (dist !== null && previousEnd && currentStart) {
          const isBodyBoundary =
            !boundaryStep.isDot &&
            !isDot &&
            prevGlyph.semanticRole === 'base' &&
            glyph.semanticRole === 'base'

          const isShapedConnection =
            isBodyBoundary && canConnectToNext(prevGlyph) && canConnectFromPrevious(glyph)

          const bridgeDirections = getBridgeDirections(previousEnd, currentStart)
          const canUseDirectionalBridge =
            bridgeDirections.tangentAlignment >= MIN_BRIDGE_TANGENT_ALIGNMENT

          if (
            options.connectGlyphs &&
            isShapedConnection &&
            dist < CONNECTION_THRESHOLD_UNITS &&
            canUseDirectionalBridge
          ) {
            const bridgeDuration = Math.min(
              MAX_CONTINUITY_BRIDGE_MS,
              Math.max(MIN_CONTINUITY_BRIDGE_MS, dist / CONTINUITY_TRAVEL_SPEED)
            )
            transition = createTransition(
              `${glyph.hb.glyphId}-bridge-${stroke.order ?? steps.length}`,
              'bridge',
              currentTimeMs,
              bridgeDuration,
              previousEnd,
              currentStart
            )
            currentTimeMs += bridgeDuration
          } else {
            const travelDuration = Math.min(
              MAX_INTER_GLYPH_PAUSE_MS,
              Math.max(MIN_INTER_GLYPH_PAUSE_MS, dist / PEN_TRAVEL_SPEED)
            )
            transition = createTransition(
              `${glyph.hb.glyphId}-lift-${stroke.order ?? steps.length}`,
              'lift',
              currentTimeMs,
              travelDuration,
              previousEnd,
              currentStart
            )
            currentTimeMs += travelDuration
          }
        } else {
          currentTimeMs += INTER_STROKE_PAUSE_MS
        }
      } else if (steps.length > 0) {
        const previousGlyph = composed[previousStep.glyphIndex]
        const previousEnd = getWorldStrokePoint(previousGlyph, previousStep.stroke, true)
        const currentStart = getWorldStrokePoint(
          glyph,
          stroke as unknown as Stroke,
          false,
          1,
          startProgress
        )
        if (previousEnd && currentStart) {
          transition = createTransition(
            `${glyph.hb.glyphId}-stroke-lift-${stroke.order ?? steps.length}`,
            'lift',
            currentTimeMs,
            INTER_STROKE_PAUSE_MS,
            previousEnd,
            currentStart
          )
        }
        currentTimeMs += INTER_STROKE_PAUSE_MS
      }

      steps.push({
        id: `${glyph.hb.glyphId}-stroke-${stroke.order ?? steps.length}`,
        glyphIndex: i,
        stroke: stroke as unknown as Stroke,
        isDot,
        startProgress,
        endProgress,
        transition,
        // A connected handoff is an overlap, not a blank interval. Start the
        // next stroke when the bridge starts so its ink advances while the
        // cursor travels to the next glyph.
        startMs: transition?.kind === 'bridge' ? transition.startMs : currentTimeMs,
        endMs: (transition?.kind === 'bridge' ? transition.startMs : currentTimeMs) + durationMs
      })
      if (!isDot) previousBodyStep = steps[steps.length - 1]
      currentTimeMs = Math.max(
        currentTimeMs,
        (transition?.kind === 'bridge' ? transition.startMs : currentTimeMs) + durationMs
      )
    }
  }

  return {
    steps,
    totalDurationMs: currentTimeMs
  }
}

export type SpeedLevel = 'slow' | 'medium' | 'fast'

export const SPEED_MULTIPLIERS: Record<SpeedLevel, number> = {
  slow: 1.0,
  medium: 2.0,
  fast: 3.8
}

export type StateChangeListener = (state: AnimationState) => void

export class AnimationEngine {
  public timeline: AnimationTimeline
  private state: AnimationState
  private listeners: Set<StateChangeListener> = new Set()
  private speedMultiplier: number = SPEED_MULTIPLIERS.medium

  private rafId: number | null = null
  private lastTimeMs: number = 0
  private queuedStep: boolean = false

  constructor(timeline: AnimationTimeline, initialSpeed: SpeedLevel | number = 'medium') {
    this.timeline = timeline
    this.setSpeed(initialSpeed)
    this.state = {
      mode: 'idle',
      currentStep: 0,
      progressMs: 0,
      durationMs: timeline.totalDurationMs,
      isPaused: false,
      isComplete: false
    }
  }

  public setSpeed(speed: SpeedLevel | number): void {
    if (typeof speed === 'string') {
      this.speedMultiplier = SPEED_MULTIPLIERS[speed] ?? SPEED_MULTIPLIERS.medium
    } else if (typeof speed === 'number' && Number.isFinite(speed)) {
      this.speedMultiplier = Math.max(0.1, speed)
    }
  }

  public getSpeed(): number {
    return this.speedMultiplier
  }

  public getState(): AnimationState {
    return { ...this.state }
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener)
    listener(this.getState()) // initial notify
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    const s = this.getState()
    this.listeners.forEach((l) => l(s))
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private stepCursor: number = 0

  private startRaf(): void {
    if (this.rafId !== null) return // already running
    this.lastTimeMs = 0 // flag for first frame
    const loop = (time: number): void => {
      if (this.lastTimeMs === 0) {
        this.lastTimeMs = time
      }
      const rawDelta = time - this.lastTimeMs
      this.lastTimeMs = time
      // Use real elapsed time so slow frames do not artificially stretch playback duration.
      // Cap at 250ms to prevent huge jumps when the tab is backgrounded or during freeze.
      const delta = Math.min(Math.max(rawDelta, 0), 250)
      this.tick(delta)
      if (this.rafId !== null) {
        this.rafId = requestAnimationFrame(loop)
      }
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private updateCurrentStepFromProgress(): void {
    const steps = this.timeline.steps
    const n = steps.length
    if (n === 0) {
      this.state.currentStep = 0
      return
    }

    const progress = this.state.progressMs
    if (progress >= this.timeline.totalDurationMs) {
      this.state.currentStep = Math.max(0, n - 1)
      this.stepCursor = this.state.currentStep
      return
    }

    // 1. Fast sequential check from cached step cursor
    let cur = this.stepCursor
    if (cur >= 0 && cur < n) {
      const step = steps[cur]
      const nextStep = steps[cur + 1]

      if (progress >= step.startMs && progress < step.endMs) {
        this.state.currentStep = cur
        return
      }

      if (nextStep && progress >= step.endMs && progress < nextStep.startMs) {
        this.state.currentStep = cur + 1
        this.stepCursor = cur + 1
        return
      }

      // Check if advancing sequentially forward by one or few steps
      if (cur + 1 < n && progress >= steps[cur + 1].startMs) {
        cur++
        while (cur < n) {
          const s = steps[cur]
          const ns = steps[cur + 1]
          if (progress >= s.startMs && progress < s.endMs) {
            this.state.currentStep = cur
            this.stepCursor = cur
            return
          }
          if (ns && progress >= s.endMs && progress < ns.startMs) {
            this.state.currentStep = cur + 1
            this.stepCursor = cur + 1
            return
          }
          if (ns && progress >= ns.startMs) {
            cur++
          } else {
            break
          }
        }
      }
    }

    // 2. Binary search fallback for backward jumps or arbitrary seeks
    let low = 0
    let high = n - 1
    let found = 0
    while (low <= high) {
      const mid = (low + high) >> 1
      const step = steps[mid]
      if (progress < step.startMs) {
        high = mid - 1
      } else if (progress >= step.endMs) {
        const next = steps[mid + 1]
        if (next && progress < next.startMs) {
          found = mid + 1
          break
        }
        low = mid + 1
      } else {
        found = mid
        break
      }
    }
    this.state.currentStep = Math.min(n - 1, Math.max(0, found))
    this.stepCursor = this.state.currentStep
  }

  private tick(delta: number): void {
    if (this.state.isPaused || this.state.mode === 'idle') {
      this.stopRaf()
      return
    }

    this.state.progressMs += delta * this.speedMultiplier
    const needsNotify = true

    if (this.state.mode === 'play') {
      if (this.state.progressMs >= this.timeline.totalDurationMs) {
        this.state.progressMs = this.timeline.totalDurationMs
        this.state.isComplete = true
        this.state.mode = 'idle'
        this.updateCurrentStepFromProgress()
        this.stopRaf()
      } else {
        this.updateCurrentStepFromProgress()
      }
    } else if (this.state.mode === 'step') {
      const step = this.timeline.steps[this.state.currentStep]
      if (!step) {
        this.stopRaf()
        this.state.mode = 'idle'
      } else if (this.state.progressMs >= step.endMs) {
        this.state.progressMs = step.endMs

        // Step finished
        if (this.queuedStep) {
          // Consume queued step
          this.queuedStep = false
          if (this.state.currentStep < this.timeline.steps.length - 1) {
            this.state.currentStep++
            // Keep running
          } else {
            this.state.isComplete = true
            this.state.mode = 'idle'
            this.stopRaf()
          }
        } else {
          // No queue, just stop
          this.state.mode = 'idle'
          if (this.state.currentStep >= this.timeline.steps.length - 1) {
            this.state.isComplete = true
          } else {
            this.state.currentStep++ // pre-advance for next step() click
          }
          this.stopRaf()
        }
      }
    } else if (this.state.mode === 'repeat-step') {
      const step = this.timeline.steps[this.state.currentStep]
      if (step) {
        if (this.state.progressMs >= step.endMs) {
          // Stop after completing the current step once
          this.state.progressMs = step.endMs
          this.stopRaf()
          this.state.mode = 'idle'
        }
      } else {
        this.stopRaf()
        this.state.mode = 'idle'
      }
    } else if (this.state.mode === 'auto-repeat') {
      if (this.state.progressMs >= this.timeline.totalDurationMs) {
        this.state.progressMs = 0
        this.state.currentStep = 0
        this.stepCursor = 0
      } else {
        this.updateCurrentStepFromProgress()
      }
    }

    if (needsNotify) {
      this.notify()
    }
  }

  public play(): void {
    if (this.state.mode === 'play' && !this.state.isPaused) {
      this.pause()
      return
    }

    this.stopRaf()
    this.queuedStep = false
    this.state.mode = 'play'

    if (this.state.isPaused) {
      this.state.isPaused = false
    }

    if (this.state.progressMs >= this.timeline.totalDurationMs) {
      // if we are at the end, restart from beginning for play
      this.state.progressMs = 0
      this.state.currentStep = 0
      this.stepCursor = 0
      this.state.isComplete = false
    }

    this.startRaf()
    this.notify()
  }

  public pause(): void {
    if (this.state.mode === 'idle' && !this.state.isPaused) {
      return
    }

    if (this.state.isPaused) {
      // Resume
      this.state.isPaused = false
      if (this.state.mode !== 'idle') {
        this.startRaf()
      }
    } else {
      // Pause
      this.state.isPaused = true
      this.stopRaf()
    }
    this.notify()
  }

  public step(): void {
    if (this.state.mode === 'step' && !this.state.isPaused) {
      // Already running a step, queue one
      this.queuedStep = true
      return
    }

    this.stopRaf()

    this.state.mode = 'step'
    this.state.isPaused = false
    this.queuedStep = false

    if (this.state.progressMs >= this.timeline.totalDurationMs) {
      this.state.isComplete = true
      this.state.mode = 'idle'
      this.notify()
      return
    }

    this.updateCurrentStepFromProgress()
    const step = this.timeline.steps[this.state.currentStep]
    if (step && this.state.progressMs < step.startMs) {
      this.state.progressMs = step.startMs
    }
    this.startRaf()
    this.notify()
  }

  public repeatCurrentStep(): void {
    // Every request supersedes the previous animation mode and restarts the
    // current step from its own beginning.
    this.stopRaf()
    this.queuedStep = false
    this.state.mode = 'repeat-step'
    this.state.isPaused = false

    this.updateCurrentStepFromProgress()

    // Reset progress to the start of the current step
    const step = this.timeline.steps[this.state.currentStep]
    if (step) {
      this.state.progressMs = step.startMs
    }

    this.startRaf()
    this.notify()
  }

  public autoRepeat(): void {
    if (this.state.mode === 'auto-repeat' && !this.state.isPaused) {
      this.stopRaf()
      this.state.mode = 'idle'
      this.notify()
      return
    }

    this.stopRaf()
    this.queuedStep = false
    this.state.mode = 'auto-repeat'
    this.state.isPaused = false

    if (this.state.progressMs >= this.timeline.totalDurationMs) {
      this.state.progressMs = 0
      this.state.currentStep = 0
    }

    this.startRaf()
    this.notify()
  }

  public reset(): void {
    this.stopRaf()
    this.queuedStep = false
    this.stepCursor = 0
    this.state = {
      mode: 'idle',
      currentStep: 0,
      progressMs: 0,
      durationMs: this.timeline.totalDurationMs,
      isPaused: false,
      isComplete: false
    }
    this.notify()
  }
}
