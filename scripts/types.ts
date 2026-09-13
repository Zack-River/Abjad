/**
 * Arabic Stroke Dataset - Types and Data Transfer Objects (DTOs)
 * Defined according to arabic-strokes.schema.json and Tegaki raw data models.
 */

export type ValidationStatus = 'verified' | 'needs-review' | 'rejected' | 'incomplete'
export type AnimationCapability = 'animated' | 'static-only' | 'unsupported'
export type StrokeType = 'main_body' | 'dot' | 'mark' | 'connector' | 'accent' | 'unknown'
export type GlyphForm = 'isolated' | 'initial' | 'medial' | 'final'

export interface Point2D {
  x: number
  y: number
  anchor?: string
  semanticAnchor?: string
}

export interface PointWithWidth {
  x: number
  y: number
  t?: number
  width?: number
}

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ValidationMetadata {
  status: ValidationStatus
  notes?: string
}

export interface AnimationMetadata {
  capability: AnimationCapability
  notes?: string
}

export interface SourceMetadata {
  generator: string
  font?: string
  fontVersion?: string
  fontSha256?: string
  reviewed?: boolean
  reviewedBy?: string
  reviewedAt?: string
}

export interface CleanupLogItem {
  originalOrder: number
  length: number
  reason: string
}

export interface CleanupMetadata {
  removedSegments?: CleanupLogItem[]
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

export interface StrokeItem {
  order: number
  originalOrder?: number
  priority?: number
  type?: StrokeType
  isCandidateDot?: boolean
  direction?: string
  length?: number
  durationMs?: number
  delayMs?: number
  startPoint: Point2D | null
  endPoint: Point2D | null
  medianPath: string
  outlinePath?: string
  outlineComponentOffset?: Point2D
  points: [number, number][] | number[][]
  pointsWithWidth: PointWithWidth[]
  brushProfile?: BrushProfile
}

export interface PathBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface ViewportTransform {
  scale: number
  baselineY: number
  tx: number
  boundsWidth: number
  boundsHeight: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type CandidateEntry = LetterEntry | WordEntry
export type VerifiedCandidateEntry = CandidateEntry

export interface LetterEntry {
  id: string
  char: string
  unicode?: number
  form?: GlyphForm
  advanceWidth?: number
  boundingBox?: BoundingBox
  outlinePath?: string
  validation: ValidationMetadata
  animation: AnimationMetadata
  source: SourceMetadata
  cleanup?: CleanupMetadata
  strokes: StrokeItem[]
}

export interface GlyphInstance {
  glyphId: number
  cluster: number
  xAdvance?: number
  yAdvance?: number
  xOffset?: number
  yOffset?: number
  xPosition?: number
  yPosition?: number
  char?: string
  outlinePath?: string | null
  validation?: ValidationMetadata
  animation?: AnimationMetadata
  source?: SourceMetadata
  strokes?: StrokeItem[]
}

export interface WordEntry {
  id: string
  word: string
  glyphCount: number
  validation: ValidationMetadata
  animation: AnimationMetadata
  source: SourceMetadata
  cleanup?: CleanupMetadata
  glyphs: GlyphInstance[]
}

export interface DatasetMeta {
  schemaVersion: string
  datasetVersion?: string
  language?: string
  script?: string
  coordinateSpace: string
  coordinateSystem?: string
  unitsPerEm: number
  ascender?: number
  descender?: number
  fontFamily?: string
  fontVersion?: string
  fontSha256?: string
  generator?: string
  generatedAt?: string
}

export interface ArabicStrokeDataset {
  $schema?: string
  meta: DatasetMeta
  letters?: LetterEntry[]
  contextual?: WordEntry[]
  diacritics?: WordEntry[]
  special?: WordEntry[]
  extended?: WordEntry[]
}

/**
 * Raw Tegaki input data structures
 */
export interface RawPoint {
  x: number
  y: number
  t: number
  width: number
}

export interface RawStroke {
  order: number
  priority: number
  length: number
  animationDuration: number
  delay: number
  points: RawPoint[]
}

export interface RawGlyphData {
  char?: string
  unicode?: number
  advanceWidth?: number
  boundingBox?: BoundingBox
  pathString?: string
  lineCap?: string
  subPathsCount?: number
  strokes: RawStroke[]
}

export interface RawHarfbuzzGlyph {
  codepoint: number
  cluster: number
  xAdvance?: number
  yAdvance?: number
  xOffset?: number
  yOffset?: number
  char?: string
  glyphData: RawGlyphData | null
}

export interface RawWordFixture {
  word: string
  glyphCount: number
  glyphs: RawHarfbuzzGlyph[]
}

export interface RawFontMetadata {
  family?: string
  style?: string
  version?: string
  uniqueID?: string
  sha256?: string
  unitsPerEm?: number
  ascender?: number
  descender?: number
  lineCap?: string
}

export interface RawTegakiDataset {
  metadata: {
    generator: string
    timestamp: string
    font: RawFontMetadata
  }
  fixtures: {
    isolated: Record<string, RawGlyphData>
    contextual: Record<string, RawWordFixture>
    diacritics: Record<string, RawWordFixture>
    special: Record<string, RawWordFixture>
    extended: Record<string, RawWordFixture>
  }
}

/**
 * Conversion report and validation types
 */
export interface WordCleanupItem {
  gid: number
  removed: CleanupLogItem[]
}

export interface KnownFailure {
  id: string
  char: string
  category: string
  reason: string
}

export interface ConversionStats {
  totalEntries: number
  verifiedCount: number
  needsReviewCount: number
  rejectedCount: number
  incompleteCount: number
  animatedCount: number
  totalStrokes: number
  removedSpursCount: number
}

export interface ConversionReport {
  generatedAt: string
  generator: string
  stats: ConversionStats
  cleanupLog: {
    isolated: Record<string, CleanupLogItem[]>
    contextual: WordCleanupItem[]
    diacritics: WordCleanupItem[]
    special: WordCleanupItem[]
    extended: WordCleanupItem[]
  }
  knownFailures: KnownFailure[]
}

export interface ValidationIssue {
  type: 'ERROR' | 'WARNING'
  fixture: string
  field: string
  message: string
}

export interface VerifiedInventory {
  version: string
  snapshotDate: string
  description: string
  letters: LetterEntry[]
  contextual: WordEntry[]
  diacritics: WordEntry[]
  special: WordEntry[]
  extended: WordEntry[]
}

export type JoiningType = 'dual' | 'right' | 'none'

export interface FormCoverage {
  isolated: ValidationStatus | 'unsupported'
  initial: ValidationStatus | 'unsupported'
  medial: ValidationStatus | 'unsupported'
  final: ValidationStatus | 'unsupported'
}

export interface LetterCoverage {
  char: string
  name: string
  unicode: string
  joiningType: JoiningType
  forms: FormCoverage
}

export interface CoverageCategoryStats {
  total: number
  verified: number
  needsReview: number
  incomplete: number
  rejected: number
  unsupported: number
}

export interface FullCoverageReport {
  generatedAt: string
  summary: CoverageCategoryStats
  letters: LetterCoverage[]
  diacritics: { mark: string; name: string; status: ValidationStatus | 'incomplete' }[]
  specialCompositions: {
    word: string
    description: string
    status: ValidationStatus | 'incomplete'
  }[]
}
