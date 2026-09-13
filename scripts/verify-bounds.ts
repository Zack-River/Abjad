import * as fs from 'fs'
import { PathBounds, VerifiedInventory } from './types'

function getPathBounds(d: string): PathBounds | null {
  if (!d) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  function addPt(x: number, y: number): void {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  function addQuadExtrema(p0: number, p1: number, p2: number): number[] {
    const res: number[] = []
    const denom = p0 - 2 * p1 + p2
    if (Math.abs(denom) > 1e-12) {
      const t = (p0 - p1) / denom
      if (t > 0 && t < 1) {
        res.push((1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2)
      }
    }
    return res
  }

  function addCubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
    const res: number[] = []
    const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3)
    const b = 6 * (p0 - 2 * p1 + p2)
    const c = 3 * (p1 - p0)

    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) {
        const t = -c / b
        if (t > 0 && t < 1) res.push(t)
      }
    } else {
      const d2 = b * b - 4 * a * c
      if (d2 >= 0) {
        const sd = Math.sqrt(d2)
        const t1 = (-b - sd) / (2 * a)
        const t2 = (-b + sd) / (2 * a)
        if (t1 > 0 && t1 < 1) res.push(t1)
        if (t2 > 0 && t2 < 1) res.push(t2)
      }
    }
    return res.map(
      (t) =>
        (1 - t) * (1 - t) * (1 - t) * p0 +
        3 * (1 - t) * (1 - t) * t * p1 +
        3 * (1 - t) * t * t * p2 +
        t * t * t * p3
    )
  }

  const cmdRegex = /([A-Za-z])([^A-Za-z]*)/g
  let curX = 0
  let curY = 0
  let match: RegExpExecArray | null

  while ((match = cmdRegex.exec(d)) !== null) {
    const cmd = match[1]
    const numMatches = match[2].match(/-?(?:\d*\.\d+|\d+)/g)
    const nums = numMatches ? numMatches.map(Number) : []

    switch (cmd) {
      case 'M':
      case 'L':
        for (let i = 0; i < nums.length; i += 2) {
          curX = nums[i]
          curY = nums[i + 1]
          addPt(curX, curY)
        }
        break
      case 'm':
      case 'l':
        for (let i = 0; i < nums.length; i += 2) {
          curX += nums[i]
          curY += nums[i + 1]
          addPt(curX, curY)
        }
        break
      case 'H':
        for (let i = 0; i < nums.length; i++) {
          curX = nums[i]
          addPt(curX, curY)
        }
        break
      case 'h':
        for (let i = 0; i < nums.length; i++) {
          curX += nums[i]
          addPt(curX, curY)
        }
        break
      case 'V':
        for (let i = 0; i < nums.length; i++) {
          curY = nums[i]
          addPt(curX, curY)
        }
        break
      case 'v':
        for (let i = 0; i < nums.length; i++) {
          curY += nums[i]
          addPt(curX, curY)
        }
        break
      case 'Q':
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = nums[i],
            y1 = nums[i + 1]
          const x = nums[i + 2],
            y = nums[i + 3]
          addPt(x, y)
          addQuadExtrema(curX, x1, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addQuadExtrema(curY, y1, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'q':
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = curX + nums[i],
            y1 = curY + nums[i + 1]
          const x = curX + nums[i + 2],
            y = curY + nums[i + 3]
          addPt(x, y)
          addQuadExtrema(curX, x1, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addQuadExtrema(curY, y1, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'C':
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = nums[i],
            y1 = nums[i + 1]
          const x2 = nums[i + 2],
            y2 = nums[i + 3]
          const x = nums[i + 4],
            y = nums[i + 5]
          addPt(x, y)
          addCubicExtrema(curX, x1, x2, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addCubicExtrema(curY, y1, y2, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'c':
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = curX + nums[i],
            y1 = curY + nums[i + 1]
          const x2 = curX + nums[i + 2],
            y2 = curY + nums[i + 3]
          const x = curX + nums[i + 4],
            y = curY + nums[i + 5]
          addPt(x, y)
          addCubicExtrema(curX, x1, x2, x).forEach((ex) => {
            if (ex < minX) minX = ex
            if (ex > maxX) maxX = ex
          })
          addCubicExtrema(curY, y1, y2, y).forEach((ey) => {
            if (ey < minY) minY = ey
            if (ey > maxY) maxY = ey
          })
          curX = x
          curY = y
        }
        break
      case 'Z':
      case 'z':
        break
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
  return { minX, maxX, minY, maxY }
}

const ref = JSON.parse(
  fs.readFileSync('data/golden/verified-reference.json', 'utf8')
) as VerifiedInventory

console.log('--- PARSER COMMAND VERIFICATION ---')
const commandTypes = new Set<string>()
const outlinePaths: string[] = []
for (const letter of ref.letters || []) {
  if (letter.outlinePath) outlinePaths.push(letter.outlinePath)
}
for (const word of [
  ...(ref.contextual || []),
  ...(ref.extended || []),
  ...(ref.special || []),
  ...(ref.diacritics || [])
]) {
  for (const g of word.glyphs || []) {
    if (g.outlinePath) outlinePaths.push(g.outlinePath)
  }
}

for (const pathStr of outlinePaths) {
  const cmdRegex = /([A-Za-z])/g
  let match
  while ((match = cmdRegex.exec(pathStr)) !== null) {
    commandTypes.add(match[1])
  }
}
const sortedCommands = Array.from(commandTypes).sort()
console.log('Commands present in trusted dataset:', sortedCommands.join(', '))
const unsupported = sortedCommands.filter((c) => ['S', 's', 'T', 't', 'A', 'a'].includes(c))
if (unsupported.length > 0) {
  console.log('UNSUPPORTED COMMANDS DETECTED:', unsupported.join(', '))
} else {
  console.log('SUCCESS: All commands are supported by the parser.')
}

console.log('\n--- BOUNDS METRICS ---')

let fixturesChecked = 0
let matchingFourCoords = 0
let mismatches = 0
let maxErrX = 0
let maxErrY = 0

for (const f of ref.letters || []) {
  if (f.outlinePath && f.boundingBox) {
    fixturesChecked++
    const b = getPathBounds(f.outlinePath)!

    // Invert Y because boundingBox is font space (Y up) and SVG is Y down
    // SVG minY matches -boundingBox.y2
    // SVG maxY matches -boundingBox.y1
    const expectedMinX = f.boundingBox.x1
    const expectedMaxX = f.boundingBox.x2
    const expectedMinY = -f.boundingBox.y2
    const expectedMaxY = -f.boundingBox.y1

    const errMinX = Math.abs(b.minX - expectedMinX)
    const errMaxX = Math.abs(b.maxX - expectedMaxX)
    const errMinY = Math.abs(b.minY - expectedMinY)
    const errMaxY = Math.abs(b.maxY - expectedMaxY)

    maxErrX = Math.max(maxErrX, errMinX, errMaxX)
    maxErrY = Math.max(maxErrY, errMinY, errMaxY)

    const TOLERANCE = 1e-6
    if (
      errMinX <= TOLERANCE &&
      errMaxX <= TOLERANCE &&
      errMinY <= TOLERANCE &&
      errMaxY <= TOLERANCE
    ) {
      matchingFourCoords++
    } else {
      mismatches++
      console.log(`Mismatch in ${f.id}:`)
      console.log(
        `  Expected (from boundingBox): minX=${expectedMinX}, maxX=${expectedMaxX}, minY=${expectedMinY}, maxY=${expectedMaxY}`
      )
      console.log(
        `  Actual exact bounds        : minX=${b.minX}, maxX=${b.maxX}, minY=${b.minY}, maxY=${b.maxY}`
      )
    }
  }
}

const baa = ref.letters.find((l) => l.id === 'letter_ب')
if (!baa || !baa.outlinePath || !baa.boundingBox) throw new Error('letter_ب not found')
const baaBounds = getPathBounds(baa.outlinePath)

console.log('\n--- FINAL REPORT DATA ---')
console.log('1. Number of fixtures checked:', fixturesChecked)
console.log('2. Number matching all four coordinates:', matchingFourCoords)
console.log('3. Number with any mismatch:', mismatches)
console.log('4. Max absolute error (X, Y):', maxErrX, maxErrY)
console.log('5. Actual exact letter_ب bounds:', baaBounds)
console.log('6. Metadata-derived letter_ب bounds:', {
  minX: baa.boundingBox.x1,
  maxX: baa.boundingBox.x2,
  minY: -baa.boundingBox.y2,
  maxY: -baa.boundingBox.y1
})
