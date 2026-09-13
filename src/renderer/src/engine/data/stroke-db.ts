import dbFixture from '../../assets/fixture_db.json'

export interface Point {
  x: number
  y: number
}

export interface Transform {
  translate?: Point
  scale?: number | Point
}

export interface RenderSpace {
  viewBox: { width: number; height: number }
  baselineY: number
  coordinateSystem: string
  outlineTransform?: Transform
}

export interface BrushProfileValue {
  start?: number
  body?: number
  end?: number
}

export interface BrushProfile {
  startRampEnd?: number
  endRampStart?: number
  startRadius?: number
  bodyRadius?: number
  endRadius?: number
  majorScale?: number | BrushProfileValue
  minorScale?: number | BrushProfileValue
  [key: string]: number | BrushProfileValue | undefined
}

export interface Stroke {
  id: string
  order: number
  outlinePath: string
  medianPath?: string
  outlineComponentOffset?: Point
  brushProfile?: BrushProfile
  startPoint?: Point
  endPoint?: Point
}

export interface Form {
  status: string
  renderSpace: RenderSpace
  strokes: Stroke[]
  dots?: Stroke[]
}

export interface Database {
  letters: Record<string, { forms: Record<string, Form> }>
}

export function getDatabase(): Database {
  return dbFixture as unknown as Database
}
