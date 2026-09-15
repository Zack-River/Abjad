/**
 * Real HarfBuzz WASM Shaping Service
 *
 * Loads the pinned font (NotoSansArabic-Regular.ttf) and initializes harfbuzzjs exactly once.
 * Provides synchronous text shaping after asynchronous initialization.
 */

export interface ShapedGlyphRecord {
  glyphId: number
  glyphName: string
  cluster: number
  xAdvance: number
  yAdvance: number
  xOffset: number
  yOffset: number
}

interface HarfBuzzGlyphInfo {
  codepoint: number
  cluster: number
}

interface HarfBuzzGlyphPosition {
  xAdvance: number
  yAdvance: number
  xOffset: number
  yOffset: number
}

interface HarfBuzzBuffer {
  addText(text: string): void
  guessSegmentProperties(): void
  getGlyphInfos(): HarfBuzzGlyphInfo[]
  getGlyphPositions(): HarfBuzzGlyphPosition[]
  destroy?: () => void
}

interface HarfBuzzFont {
  setScale(xScale: number, yScale: number): void
  glyphName(glyphId: number): string
}

interface HarfBuzzApi {
  Blob: new (buffer: ArrayBuffer) => object
  Face: new (blob: object, index?: number) => object
  Font: new (face: object) => HarfBuzzFont
  Buffer: new () => HarfBuzzBuffer
  shape(font: HarfBuzzFont, buffer: HarfBuzzBuffer): void
}

export class HarfBuzzService {
  private static instance: HarfBuzzService
  private font: HarfBuzzFont | null = null
  private hb: HarfBuzzApi | null = null
  private initPromise: Promise<void> | null = null
  public isReady: boolean = false
  public initCount: number = 0

  private constructor() {
    // Singleton service.
  }

  public static getInstance(): HarfBuzzService {
    if (!HarfBuzzService.instance) {
      HarfBuzzService.instance = new HarfBuzzService()
    }
    return HarfBuzzService.instance
  }

  /**
   * Initializes HarfBuzz and loads the pinned Noto Sans Arabic font.
   * Safe to call multiple times concurrently; initialization executes exactly once.
   */
  public async init(customFontBuffer?: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.isReady) {
      return
    }
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      this.initCount++
      const hbModule = await import('harfbuzzjs')
      const hb = ((hbModule as unknown as { default?: HarfBuzzApi }).default ||
        hbModule) as HarfBuzzApi
      const { Blob, Face, Font: HbFont } = hb

      const toArrayBuffer = (buf: Uint8Array | ArrayBuffer): ArrayBuffer => {
        if (buf instanceof ArrayBuffer) return buf
        const copy = new ArrayBuffer(buf.byteLength)
        new Uint8Array(copy).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
        return copy
      }

      let fontBuffer: ArrayBuffer

      if (customFontBuffer) {
        fontBuffer = toArrayBuffer(customFontBuffer)
      } else if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        const electronApi = (window as Window & { api?: { loadFont?: () => Promise<Uint8Array> } }).api
        if (window.location.protocol === 'file:' && electronApi?.loadFont) {
          // Chromium blocks fetch(file://...) in the built Electron renderer.
          // Read the bundled font through the preload bridge instead.
          fontBuffer = toArrayBuffer(await electronApi.loadFont())
        } else {
          const fontUrl = '/fonts/NotoSansArabic-Regular.ttf'
          const response = await fetch(fontUrl)
          if (!response.ok) {
            throw new Error(`Failed to load font from ${fontUrl}: ${response.statusText}`)
          }
          fontBuffer = await response.arrayBuffer()
        }
      } else {
        // Node.js environment (tests, scripts, CLI)
        const fs = await import(/* @vite-ignore */ 'node:fs')
        const path = await import(/* @vite-ignore */ 'node:path')
        const candidatePaths = [
          path.resolve(process.cwd(), 'public/fonts/NotoSansArabic-Regular.ttf'),
          path.resolve(process.cwd(), 'arabic-stroke/public/fonts/NotoSansArabic-Regular.ttf')
        ]
        const fontPath = candidatePaths.find((p) => fs.existsSync(p))
        if (!fontPath) {
          throw new Error(
            `Cannot locate NotoSansArabic-Regular.ttf in Node environment. Tried: ${candidatePaths.join(', ')}`
          )
        }
        const fileBuf = fs.readFileSync(fontPath)
        fontBuffer = toArrayBuffer(fileBuf)
      }

      const blob = new Blob(fontBuffer)
      const face = new Face(blob, 0)
      this.font = new HbFont(face)
      this.font.setScale(1000, 1000)
      this.hb = hb
      this.isReady = true
    })()

    return this.initPromise
  }

  /**
   * Shapes an arbitrary Arabic Unicode string into shaped glyph records in visual buffer order.
   * Requires init() to have been called and resolved beforehand.
   */
  public shapeText(text: string): ShapedGlyphRecord[] {
    if (!this.isReady || !this.font || !this.hb) {
      console.warn('HarfBuzzService: shapeText called before initialization completed.')
      return []
    }

    if (!text) {
      return []
    }

    const buffer = new this.hb.Buffer()
    try {
      buffer.addText(text)
      buffer.guessSegmentProperties()
      this.hb.shape(this.font, buffer)

      const infos = buffer.getGlyphInfos()
      const positions = buffer.getGlyphPositions()

      const records: ShapedGlyphRecord[] = []
      for (let i = 0; i < infos.length; i++) {
        const glyphId = infos[i].codepoint
        records.push({
          glyphId,
          glyphName: this.font.glyphName(glyphId) || `gid_${glyphId}`,
          cluster: infos[i].cluster,
          xAdvance: positions[i].xAdvance,
          yAdvance: positions[i].yAdvance,
          xOffset: positions[i].xOffset,
          yOffset: positions[i].yOffset
        })
      }

      return records
    } finally {
      buffer.destroy?.()
    }
  }
}

export const harfbuzzService = HarfBuzzService.getInstance()

export async function initHarfBuzz(customFontBuffer?: ArrayBuffer | Uint8Array): Promise<void> {
  return harfbuzzService.init(customFontBuffer)
}

export function shapeText(text: string): ShapedGlyphRecord[] {
  return harfbuzzService.shapeText(text)
}
