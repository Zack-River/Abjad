import { ComposedGlyph } from '../composition/glyph-composer'
import { Stroke } from '../data/stroke-db'
import { svgPathProperties } from 'svg-path-properties'

const RAA_REFERENCE_INK_UNITS_PER_MS = 0.177012621

function inkDurationMs(stroke: Stroke): number {
  if (!stroke.medianPath) return 1200
  const props = new svgPathProperties(stroke.medianPath)
  const length = props.getTotalLength()
  return length > 0 ? length / RAA_REFERENCE_INK_UNITS_PER_MS : 1200
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

export interface AnimationStep {
  id: string
  startMs: number
  endMs: number
  glyphIndex: number
  stroke: Stroke
  isDot: boolean
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

export function getInterGlyphDistance(
  prevGlyph: ComposedGlyph,
  prevStroke: Stroke,
  nextGlyph: ComposedGlyph,
  nextStroke: Stroke
): number | null {
  let endPt = prevStroke?.endPoint
  if (!endPt && prevStroke?.medianPath) {
    try {
      const p = new svgPathProperties(prevStroke.medianPath)
      endPt = p.getPointAtLength(p.getTotalLength())
    } catch {
      // ignore
    }
  }

  let startPt = nextStroke?.startPoint
  if (!startPt && nextStroke?.medianPath) {
    try {
      const p = new svgPathProperties(nextStroke.medianPath)
      startPt = p.getPointAtLength(0)
    } catch {
      // ignore
    }
  }

  if (!endPt || !startPt) return null

  const ex = (prevGlyph.glyphX || 0) + endPt.x
  const ey = (prevGlyph.glyphY || 0) + endPt.y
  const sx = (nextGlyph.glyphX || 0) + startPt.x
  const sy = (nextGlyph.glyphY || 0) + startPt.y

  return Math.hypot(ex - sx, ey - sy)
}

export function smoothProgress(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

export interface TimelineOptions {
  connectGlyphs?: boolean
}

export function buildTimeline(
  composed: ComposedGlyph[],
  options: TimelineOptions = {}
): AnimationTimeline {
  const steps: AnimationStep[] = []
  let currentTimeMs = 0

  for (let i = 0; i < composed.length; i++) {
    const glyph = composed[i]

    for (const stroke of glyph.orderedStrokes || []) {
      const isDot = stroke.isCandidateDot ?? (stroke.type === 'dot' || glyph.semanticRole === 'dot')
      const durationMs = inkDurationMs(stroke as unknown as Stroke)

      // When crossing a glyph boundary, calculate physical distance to determine
      // travel duration, or 0ms in connected mode if touching (< CONNECTION_THRESHOLD_UNITS).
      const previousStep = steps[steps.length - 1]
      const crossesGlyphBoundary = previousStep && previousStep.glyphIndex !== i

      if (crossesGlyphBoundary) {
        const prevGlyph = composed[previousStep.glyphIndex]
        const dist = getInterGlyphDistance(
          prevGlyph,
          previousStep.stroke,
          glyph,
          stroke as unknown as Stroke
        )

        if (dist !== null) {
          if (options.connectGlyphs && dist < CONNECTION_THRESHOLD_UNITS) {
            // Truly touching glyphs in connected mode: seamless transition (0ms pause)
          } else {
            // Dynamic travel pause proportional to physical distance
            const travelDuration = Math.min(
              MAX_INTER_GLYPH_PAUSE_MS,
              Math.max(MIN_INTER_GLYPH_PAUSE_MS, dist / PEN_TRAVEL_SPEED)
            )
            currentTimeMs += travelDuration
          }
        } else {
          // Null-safe fallback: if endPoint/startPoint missing → use 140ms default pause
          currentTimeMs += INTER_STROKE_PAUSE_MS
        }
      } else if (steps.length > 0) {
        // Intra-glyph pause (between strokes of same letter) — educational pause
        currentTimeMs += INTER_STROKE_PAUSE_MS
      }

      steps.push({
        id: `${glyph.hb.glyphId}-stroke-${stroke.order ?? steps.length}`,
        glyphIndex: i,
        stroke: stroke as unknown as Stroke,
        isDot,
        startMs: currentTimeMs,
        endMs: currentTimeMs + durationMs
      })
      currentTimeMs += durationMs
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

  private startRaf(): void {
    if (this.rafId !== null) return // already running
    this.lastTimeMs = 0 // flag for first frame
    const loop = (time: number): void => {
      if (this.lastTimeMs === 0) {
        this.lastTimeMs = time
      }
      const rawDelta = time - this.lastTimeMs
      this.lastTimeMs = time
      // Clamp delta to prevent jerky jumps from dropped frames or background tab throttles
      const delta = Math.min(Math.max(rawDelta, 0), 33)
      this.tick(delta)
      if (this.rafId !== null) {
        this.rafId = requestAnimationFrame(loop)
      }
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private updateCurrentStepFromProgress(): void {
    // Determine currentStep based on progressMs. During an inter-stroke pause,
    // keep the next step selected so the step controls do not jump back to the
    // stroke that has already finished.
    for (let i = 0; i < this.timeline.steps.length; i++) {
      const step = this.timeline.steps[i]
      const nextStep = this.timeline.steps[i + 1]
      if (
        this.state.progressMs >= step.startMs &&
        this.state.progressMs < step.endMs
      ) {
        this.state.currentStep = i
        return
      }

      if (
        nextStep &&
        this.state.progressMs >= step.endMs &&
        this.state.progressMs < nextStep.startMs
      ) {
        this.state.currentStep = i + 1
        return
      }
    }
    // If we're exactly at the end or beyond
    if (this.state.progressMs >= this.timeline.totalDurationMs) {
      this.state.currentStep = Math.max(0, this.timeline.steps.length - 1)
    }
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
