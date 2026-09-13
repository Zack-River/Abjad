import fs from 'fs'
import path from 'path'
import { VerifiedInventory, ArabicStrokeDataset, LetterEntry, WordEntry } from './types'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage:')
  console.error('  npx tsx scripts/promote-to-verified.ts <char1> <char2> ...')
  console.error('  npx tsx scripts/promote-to-verified.ts all')
  console.error('  npx tsx scripts/promote-to-verified.ts --contextual <word1> <word2> ...')
  console.error('  npx tsx scripts/promote-to-verified.ts --contextual all')
  console.error('  npx tsx scripts/promote-to-verified.ts --special <word1> <word2> ...')
  console.error('  npx tsx scripts/promote-to-verified.ts --special all')
  process.exit(1)
}

const isContextual = args.includes('--contextual') || args.includes('contextual')
const isSpecial = args.includes('--special') || args.includes('special')
const targets = args.filter(
  (a) => a !== '--contextual' && a !== 'contextual' && a !== '--special' && a !== 'special'
)

const verifiedRefPath = path.resolve('data/golden/verified-reference.json')
const candidatesPath = path.resolve(
  'src/renderer/src/assets/candidates/arabic-strokes.candidates.json'
)

if (!fs.existsSync(verifiedRefPath)) {
  console.error(`Missing verified reference at: ${verifiedRefPath}`)
  process.exit(1)
}
if (!fs.existsSync(candidatesPath)) {
  console.error(`Missing candidates dataset at: ${candidatesPath}`)
  process.exit(1)
}

const verifiedRef: VerifiedInventory = JSON.parse(fs.readFileSync(verifiedRefPath, 'utf8'))
const candidates: ArabicStrokeDataset = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))

let addedCount = 0
let updatedCount = 0

if (isContextual) {
  const candidateContextualMap = new Map<string, WordEntry>(
    (candidates.contextual || []).map((w) => [w.word, w])
  )
  const verifiedContextualMap = new Map<string, WordEntry>(
    (verifiedRef.contextual || []).map((w) => [w.word, w])
  )

  const wordsToPromote =
    targets.length === 1 && targets[0] === 'all'
      ? Array.from(candidateContextualMap.keys())
      : targets

  for (const word of wordsToPromote) {
    const candidate = candidateContextualMap.get(word)
    if (!candidate) {
      console.warn(`[!] Candidate not found for contextual word: ${word}`)
      continue
    }

    const verifiedEntry: WordEntry = JSON.parse(JSON.stringify(candidate))
    verifiedEntry.validation = {
      status: 'verified',
      notes: 'Calligraphically verified contextual fixture'
    }
    verifiedEntry.animation = {
      capability: 'animated',
      notes: 'Candidate sequence'
    }

    if (verifiedEntry.glyphs) {
      for (const glyph of verifiedEntry.glyphs) {
        glyph.validation = {
          status: 'verified',
          notes: 'Contextual fixture with verified letter engines applied'
        }
        glyph.animation = {
          capability: 'animated',
          notes: 'Candidate sequence'
        }
      }
    }

    if (verifiedContextualMap.has(word)) {
      console.log(`Updating already verified contextual word: ${word}`)
      const idx = verifiedRef.contextual.findIndex((w) => w.word === word)
      verifiedRef.contextual[idx] = verifiedEntry
      updatedCount++
    } else {
      console.log(`Adding newly verified contextual word: ${word}`)
      verifiedRef.contextual.push(verifiedEntry)
      verifiedContextualMap.set(word, verifiedEntry)
      addedCount++
    }
  }
} else if (isSpecial) {
  const candidateSpecialMap = new Map<string, WordEntry>(
    (candidates.special || []).map((w) => [w.word, w])
  )
  const verifiedSpecialMap = new Map<string, WordEntry>(
    (verifiedRef.special || []).map((w) => [w.word, w])
  )

  const wordsToPromote =
    targets.length === 1 && targets[0] === 'all' ? Array.from(candidateSpecialMap.keys()) : targets

  for (const word of wordsToPromote) {
    const candidate = candidateSpecialMap.get(word)
    if (!candidate) {
      console.warn(`[!] Candidate not found for special fixture: ${word}`)
      continue
    }

    const verifiedEntry: WordEntry = JSON.parse(JSON.stringify(candidate))
    verifiedEntry.validation = {
      status: 'verified',
      notes: 'Calligraphically verified special fixture'
    }
    verifiedEntry.animation = {
      capability: 'animated',
      notes: 'Candidate sequence'
    }

    if (verifiedEntry.glyphs) {
      for (const glyph of verifiedEntry.glyphs) {
        glyph.validation = {
          status: 'verified',
          notes: 'Special fixture with verified letter engines applied'
        }
        glyph.animation = {
          capability: 'animated',
          notes: 'Candidate sequence'
        }
      }
    }

    if (verifiedSpecialMap.has(word)) {
      console.log(`Updating already verified special fixture: ${word}`)
      const idx = verifiedRef.special.findIndex((w) => w.word === word)
      verifiedRef.special[idx] = verifiedEntry
      updatedCount++
    } else {
      console.log(`Adding newly verified special fixture: ${word}`)
      verifiedRef.special.push(verifiedEntry)
      verifiedSpecialMap.set(word, verifiedEntry)
      addedCount++
    }
  }
} else {
  const candidateMap = new Map<string, LetterEntry>(
    (candidates.letters || []).map((l) => [l.char, l])
  )
  const verifiedMap = new Map<string, LetterEntry>(verifiedRef.letters.map((l) => [l.char, l]))

  const lettersToPromote =
    targets.length === 1 && targets[0] === 'all' ? Array.from(candidateMap.keys()) : targets

  for (const ch of lettersToPromote) {
    const candidate = candidateMap.get(ch)
    if (!candidate) {
      console.warn(`[!] Candidate not found for letter: ${ch}`)
      continue
    }

    const verifiedEntry: LetterEntry = JSON.parse(JSON.stringify(candidate))
    verifiedEntry.validation = {
      status: 'verified',
      notes: 'Calligraphically verified and completed'
    }
    verifiedEntry.animation = {
      capability: 'animated',
      notes: 'Verified sequence'
    }

    if (verifiedMap.has(ch)) {
      console.log(`Updating already verified entry: ${ch}`)
      const idx = verifiedRef.letters.findIndex((l) => l.char === ch)
      verifiedRef.letters[idx] = verifiedEntry
      updatedCount++
    } else {
      console.log(`Adding newly verified letter: ${ch}`)
      verifiedRef.letters.push(verifiedEntry)
      verifiedMap.set(ch, verifiedEntry)
      addedCount++
    }
  }
}

verifiedRef.snapshotDate = new Date().toISOString()
const totalFixtures =
  verifiedRef.letters.length +
  verifiedRef.contextual.length +
  verifiedRef.diacritics.length +
  verifiedRef.special.length +
  verifiedRef.extended.length

verifiedRef.description = `Protected frozen inventory of all ${totalFixtures} personally verified reference fixtures.`

fs.writeFileSync(verifiedRefPath, JSON.stringify(verifiedRef, null, 2))
console.log(
  `Successfully updated golden reference: added ${addedCount}, updated ${updatedCount} (${verifiedRef.letters.length} letters, ${verifiedRef.contextual.length} contextual, ${verifiedRef.special.length} special, ${totalFixtures} total fixtures).`
)
