import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import type {
  ArabicStrokeDataset,
  ValidationIssue,
  WordEntry,
  StrokeItem,
  LetterEntry,
  VerifiedInventory,
  LetterCoverage,
  JoiningType,
  FullCoverageReport,
  ValidationStatus
} from './types'

const issues: ValidationIssue[] = []

function validateGeometryNumber(val: unknown, fixture: string, field: string): void {
  if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
    issues.push({
      type: 'ERROR',
      fixture,
      field,
      message: `Invalid geometry value: ${String(val)} (must be a finite number)`
    })
  }
}

function normalizePath(d: string): string {
  return d.trim().replace(/\s+/g, ' ')
}

interface GoldenBaDatabase {
  letters?: {
    ba?: {
      forms?: {
        isolated?: {
          strokes?: StrokeItem[]
          dots?: StrokeItem[]
        }
      }
    }
  }
}

// Complete 36 Arabic letters (28 base + 8 special forms)
interface ArabicLetterDefinition {
  char: string
  name: string
  unicode: string
  joiningType: JoiningType
}

const ARABIC_ALPHABET_MATRIX: ArabicLetterDefinition[] = [
  // 28 Base Letters
  { char: 'ا', name: 'Alif', unicode: 'U+0627', joiningType: 'right' },
  { char: 'ب', name: 'Baa', unicode: 'U+0628', joiningType: 'dual' },
  { char: 'ت', name: 'Taa', unicode: 'U+062A', joiningType: 'dual' },
  { char: 'ث', name: 'Thaa', unicode: 'U+062B', joiningType: 'dual' },
  { char: 'ج', name: 'Jeem', unicode: 'U+062C', joiningType: 'dual' },
  { char: 'ح', name: 'Haa', unicode: 'U+062D', joiningType: 'dual' },
  { char: 'خ', name: 'Khaa', unicode: 'U+062E', joiningType: 'dual' },
  { char: 'د', name: 'Daal', unicode: 'U+062F', joiningType: 'right' },
  { char: 'ذ', name: 'Dhaal', unicode: 'U+0630', joiningType: 'right' },
  { char: 'ر', name: 'Raa', unicode: 'U+0631', joiningType: 'right' },
  { char: 'ز', name: 'Zaay', unicode: 'U+0632', joiningType: 'right' },
  { char: 'س', name: 'Seen', unicode: 'U+0633', joiningType: 'dual' },
  { char: 'ش', name: 'Sheen', unicode: 'U+0634', joiningType: 'dual' },
  { char: 'ص', name: 'Saad', unicode: 'U+0635', joiningType: 'dual' },
  { char: 'ض', name: 'Daad', unicode: 'U+0636', joiningType: 'dual' },
  { char: 'ط', name: 'Taa_heavy', unicode: 'U+0637', joiningType: 'dual' },
  { char: 'ظ', name: 'Zaa_heavy', unicode: 'U+0638', joiningType: 'dual' },
  { char: 'ع', name: 'Ayn', unicode: 'U+0639', joiningType: 'dual' },
  { char: 'غ', name: 'Ghayn', unicode: 'U+063A', joiningType: 'dual' },
  { char: 'ف', name: 'Faa', unicode: 'U+0641', joiningType: 'dual' },
  { char: 'ق', name: 'Qaaf', unicode: 'U+0642', joiningType: 'dual' },
  { char: 'ك', name: 'Kaaf', unicode: 'U+0643', joiningType: 'dual' },
  { char: 'ل', name: 'Laam', unicode: 'U+0644', joiningType: 'dual' },
  { char: 'م', name: 'Meem', unicode: 'U+0645', joiningType: 'dual' },
  { char: 'ن', name: 'Noon', unicode: 'U+0646', joiningType: 'dual' },
  { char: 'ه', name: 'Haa_light', unicode: 'U+0647', joiningType: 'dual' },
  { char: 'و', name: 'Waaw', unicode: 'U+0648', joiningType: 'right' },
  { char: 'ي', name: 'Yaa', unicode: 'U+064A', joiningType: 'dual' },

  // 8 Explicit Special Forms
  { char: 'ة', name: 'Taa_marbutah', unicode: 'U+0629', joiningType: 'right' },
  { char: 'ى', name: 'Alif_maqsura', unicode: 'U+0649', joiningType: 'right' },
  { char: 'ء', name: 'Hamza_isolated', unicode: 'U+0621', joiningType: 'none' },
  { char: 'أ', name: 'Alif_hamza_above', unicode: 'U+0623', joiningType: 'right' },
  { char: 'إ', name: 'Alif_hamza_below', unicode: 'U+0625', joiningType: 'right' },
  { char: 'آ', name: 'Alif_maddah', unicode: 'U+0622', joiningType: 'right' },
  { char: 'ؤ', name: 'Waaw_hamza', unicode: 'U+0624', joiningType: 'right' },
  { char: 'ئ', name: 'Yaa_hamza', unicode: 'U+0626', joiningType: 'dual' }
]

const DIACRITICS_MATRIX = [
  { mark: 'َ', name: 'Fathah' },
  { mark: 'ِ', name: 'Kasrah' },
  { mark: 'ُ', name: 'Dammah' },
  { mark: 'ْ', name: 'Sukoon' },
  { mark: 'ّ', name: 'Shaddah' },
  { mark: 'ً', name: 'Tanween Fath' },
  { mark: 'ٍ', name: 'Tanween Kasr' },
  { mark: 'ٌ', name: 'Tanween Damm' },
  { mark: 'ٰ', name: 'Dagger Alif' },
  { mark: 'ٓ', name: 'Maddah' },
  { mark: 'ـ', name: 'Tatweel' }
]

const SPECIAL_COMPOSITIONS_MATRIX = [
  { word: 'لا', description: 'Lam-Alif Isolated Ligature' },
  { word: 'لأ', description: 'Lam-Alif with Hamza Above' },
  { word: 'لإ', description: 'Lam-Alif with Hamza Below' },
  { word: 'لآ', description: 'Lam-Alif with Maddah' },
  { word: 'لال', description: 'Lam-Alif Medial Ligature' },
  { word: 'للا', description: 'Lam-Lam-Alif Ligature' },
  { word: 'بِسْمِ', description: 'Extended Word - Basmalah start' },
  { word: 'مُحَمَّد', description: 'Extended Word - Mohammad with Shaddah' },
  { word: 'سؤال', description: 'Extended Word - Hamza on Waw' },
  { word: 'قراءة', description: 'Extended Word - Hamza on line with Taa Marbutah' },
  { word: 'مؤمن', description: 'Extended Word - Waw Hamza in medial context' },
  { word: 'بيئة', description: 'Extended Word - Yaa Hamza in medial context' }
]

function compareStrokeLists(
  actualStrokes: StrokeItem[],
  expectedStrokes: StrokeItem[],
  fixtureTag: string
): void {
  if (actualStrokes.length !== expectedStrokes.length) {
    issues.push({
      type: 'ERROR',
      fixture: fixtureTag,
      field: 'strokes.length',
      message: `Stroke count mutated: expected ${expectedStrokes.length}, got ${actualStrokes.length}`
    })
    return
  }

  for (let idx = 0; idx < expectedStrokes.length; idx++) {
    const exp = expectedStrokes[idx]
    const act = actualStrokes[idx]
    const strokeTag = `${fixtureTag}.stroke[${idx + 1}]`

    if (act.order !== exp.order) {
      issues.push({
        type: 'ERROR',
        fixture: strokeTag,
        field: 'order',
        message: `Order mutated: expected ${exp.order}, got ${act.order}`
      })
    }
    if (normalizePath(act.medianPath) !== normalizePath(exp.medianPath)) {
      issues.push({
        type: 'ERROR',
        fixture: strokeTag,
        field: 'medianPath',
        message: 'Median path mutated from frozen verified baseline'
      })
    }
    if (exp.direction && act.direction !== exp.direction) {
      issues.push({
        type: 'ERROR',
        fixture: strokeTag,
        field: 'direction',
        message: `Direction mutated: expected ${exp.direction}, got ${act.direction}`
      })
    }
    if (
      exp.startPoint &&
      (act.startPoint?.x !== exp.startPoint.x || act.startPoint?.y !== exp.startPoint.y)
    ) {
      issues.push({
        type: 'ERROR',
        fixture: strokeTag,
        field: 'startPoint',
        message: `Start point mutated: expected (${exp.startPoint.x}, ${exp.startPoint.y}), got (${act.startPoint?.x}, ${act.startPoint?.y})`
      })
    }
    if (
      exp.endPoint &&
      (act.endPoint?.x !== exp.endPoint.x || act.endPoint?.y !== exp.endPoint.y)
    ) {
      issues.push({
        type: 'ERROR',
        fixture: strokeTag,
        field: 'endPoint',
        message: `End point mutated: expected (${exp.endPoint.x}, ${exp.endPoint.y}), got (${act.endPoint?.x}, ${act.endPoint?.y})`
      })
    }
  }
}

function validateFrozenVerifiedRegression(candidates: ArabicStrokeDataset): void {
  console.log('2. Running Frozen Verified Reference Regression Check...')
  const verifiedRefPath = path.resolve('data/golden/verified-reference.json')
  if (!fs.existsSync(verifiedRefPath)) {
    issues.push({
      type: 'ERROR',
      fixture: 'verified_reference',
      field: 'file',
      message: 'data/golden/verified-reference.json not found'
    })
    return
  }

  const verifiedRef: VerifiedInventory = JSON.parse(fs.readFileSync(verifiedRefPath, 'utf8'))
  const candidateLetters = new Map<string, LetterEntry>(
    (candidates.letters || []).map((l) => [l.char, l])
  )
  const candidateContextual = new Map<string, WordEntry>(
    (candidates.contextual || []).map((w) => [w.word, w])
  )
  const candidateDiacritics = new Map<string, WordEntry>(
    (candidates.diacritics || []).map((w) => [w.word, w])
  )
  const candidateSpecial = new Map<string, WordEntry>(
    (candidates.special || []).map((w) => [w.word, w])
  )
  const candidateExtended = new Map<string, WordEntry>(
    (candidates.extended || []).map((w) => [w.word, w])
  )

  // 1. Letters
  for (const expLetter of verifiedRef.letters) {
    const act = candidateLetters.get(expLetter.char)
    const tag = `frozen_letter_${expLetter.char}`
    if (!act) {
      issues.push({
        type: 'ERROR',
        fixture: tag,
        field: 'existence',
        message: `Verified letter ${expLetter.char} missing from candidates`
      })
      continue
    }
    if (act.validation.status !== 'verified') {
      issues.push({
        type: 'ERROR',
        fixture: tag,
        field: 'validation.status',
        message: `Verified letter status downgraded to ${act.validation.status}`
      })
    }
    compareStrokeLists(act.strokes || [], expLetter.strokes || [], tag)
  }

  // 2. Word Collections (contextual, diacritics, special, extended)
  const collections: { name: string; expected: WordEntry[]; actualMap: Map<string, WordEntry> }[] =
    [
      { name: 'contextual', expected: verifiedRef.contextual, actualMap: candidateContextual },
      { name: 'diacritics', expected: verifiedRef.diacritics, actualMap: candidateDiacritics },
      { name: 'special', expected: verifiedRef.special, actualMap: candidateSpecial },
      { name: 'extended', expected: verifiedRef.extended, actualMap: candidateExtended }
    ]

  for (const col of collections) {
    for (const expWord of col.expected) {
      const act = col.actualMap.get(expWord.word)
      const tag = `frozen_${col.name}_${expWord.word}`
      if (!act) {
        issues.push({
          type: 'ERROR',
          fixture: tag,
          field: 'existence',
          message: `Verified fixture ${expWord.word} missing from ${col.name}`
        })
        continue
      }
      if (act.validation.status !== 'verified') {
        issues.push({
          type: 'ERROR',
          fixture: tag,
          field: 'validation.status',
          message: `Verified status downgraded to ${act.validation.status}`
        })
      }
      if ((act.glyphs || []).length !== (expWord.glyphs || []).length) {
        issues.push({
          type: 'ERROR',
          fixture: tag,
          field: 'glyphs.length',
          message: `Glyph count mutated: expected ${expWord.glyphs.length}, got ${act.glyphs.length}`
        })
        continue
      }
      for (let gIdx = 0; gIdx < expWord.glyphs.length; gIdx++) {
        const expG = expWord.glyphs[gIdx]
        const actG = act.glyphs[gIdx]
        compareStrokeLists(actG.strokes || [], expG.strokes || [], `${tag}.glyph[${gIdx + 1}]`)
      }
    }
    const totalVerifiedCount =
      verifiedRef.letters.length +
      verifiedRef.contextual.length +
      verifiedRef.diacritics.length +
      verifiedRef.special.length +
      verifiedRef.extended.length
    console.log(
      `  -> Frozen Verified Reference Check PASSED (All ${totalVerifiedCount} fixtures intact).`
    )
  }
}

function generateCoverageMatrix(candidates: ArabicStrokeDataset): FullCoverageReport {
  const candidateLetters = new Map<string, LetterEntry>(
    (candidates.letters || []).map((l) => [l.char, l])
  )
  const candidateContextual = new Map<string, WordEntry>(
    (candidates.contextual || []).map((w) => [w.word, w])
  )
  const candidateDiacritics = new Map<string, WordEntry>(
    (candidates.diacritics || []).map((w) => [w.word, w])
  )
  const candidateSpecial = new Map<string, WordEntry>(
    (candidates.special || []).map((w) => [w.word, w])
  )
  const candidateExtended = new Map<string, WordEntry>(
    (candidates.extended || []).map((w) => [w.word, w])
  )

  const letterCoverages: LetterCoverage[] = []
  let verifiedCount = 0
  let needsReviewCount = 0
  let incompleteCount = 0
  let rejectedCount = 0
  let unsupportedCount = 0

  for (const def of ARABIC_ALPHABET_MATRIX) {
    const existingLetter = candidateLetters.get(def.char)

    let isoStatus: ValidationStatus | 'unsupported' = 'incomplete'
    if (existingLetter) {
      isoStatus = existingLetter.validation.status
    }

    let initStatus: ValidationStatus | 'unsupported' = 'incomplete'
    let medStatus: ValidationStatus | 'unsupported' = 'incomplete'
    let finStatus: ValidationStatus | 'unsupported' = 'incomplete'

    if (def.joiningType === 'right' || def.joiningType === 'none') {
      initStatus = 'unsupported'
      medStatus = 'unsupported'
    }

    if (def.joiningType === 'none') {
      finStatus = 'unsupported'
    }

    // Check if tested in verified or candidate contextual fixtures
    const isWordVerified = (w: string): boolean =>
      candidateContextual.has(w) && candidateContextual.get(w)?.validation.status === 'verified'

    const isWordCandidate = (w: string): boolean =>
      candidateContextual.has(w) &&
      (candidateContextual.get(w)?.validation.status === 'needs-review' ||
        candidateContextual.get(w)?.validation.status === 'verified')

    const getFormStatus = (words: string[]): ValidationStatus | 'incomplete' => {
      if (words.some((w) => isWordVerified(w))) return 'verified'
      if (words.some((w) => isWordCandidate(w))) return 'needs-review'
      return 'incomplete'
    }

    if (def.char === 'ب') {
      if (isWordCandidate('ببب') || isWordCandidate('باب')) {
        initStatus = getFormStatus(['ببب', 'باب'])
        medStatus = getFormStatus(['ببب'])
        finStatus = getFormStatus(['ببب', 'باب'])
      }
    } else if (def.char === 'ت') {
      if (isWordCandidate('بتث')) initStatus = getFormStatus(['بتث'])
      if (isWordCandidate('كتب')) medStatus = getFormStatus(['كتب'])
    } else if (def.char === 'ث') {
      if (isWordCandidate('بتث')) finStatus = getFormStatus(['بتث'])
    } else if (def.char === 'ن') {
      if (isWordCandidate('ننب')) {
        initStatus = getFormStatus(['ننب'])
        medStatus = getFormStatus(['ننب'])
      }
    } else if (def.char === 'س') {
      if (isWordCandidate('سلم') || isWordCandidate('مدرسة')) {
        initStatus = getFormStatus(['سلم', 'مدرسة'])
      }
    } else if (def.char === 'ل') {
      if (isWordCandidate('سلم') || isWordCandidate('علم') || isWordCandidate('على')) {
        medStatus = getFormStatus(['سلم', 'علم', 'على'])
      }
    } else if (def.char === 'م') {
      if (isWordCandidate('مدرسة')) initStatus = getFormStatus(['مدرسة'])
      if (isWordCandidate('سلم') || isWordCandidate('علم')) {
        finStatus = getFormStatus(['سلم', 'علم'])
      }
    } else if (def.char === 'ك') {
      if (isWordCandidate('كتب')) initStatus = getFormStatus(['كتب'])
    } else if (def.char === 'ع') {
      if (isWordCandidate('علم') || isWordCandidate('على')) {
        initStatus = getFormStatus(['علم', 'على'])
      }
    } else if (def.char === 'ه') {
      if (isWordCandidate('هوي')) initStatus = getFormStatus(['هوي'])
    } else if (def.char === 'و') {
      if (isWordCandidate('هوي')) finStatus = getFormStatus(['هوي'])
    } else if (def.char === 'ى') {
      if (isWordCandidate('على') || isWordCandidate('فتى')) {
        finStatus = getFormStatus(['على', 'فتى'])
      }
    } else if (def.char === 'ف') {
      if (isWordCandidate('فتى')) initStatus = getFormStatus(['فتى'])
    } else if (def.char === 'د') {
      if (isWordCandidate('مدرسة')) finStatus = getFormStatus(['مدرسة'])
    } else if (def.char === 'ر') {
      if (isWordCandidate('مدرسة')) finStatus = getFormStatus(['مدرسة'])
    } else if (def.char === 'ة') {
      if (isWordCandidate('مدرسة')) finStatus = getFormStatus(['مدرسة'])
    } else if (def.char === 'ا') {
      if (isWordCandidate('باب')) finStatus = getFormStatus(['باب'])
    }

    const formList: (ValidationStatus | 'unsupported')[] = [
      isoStatus,
      initStatus,
      medStatus,
      finStatus
    ]
    for (const f of formList) {
      if (f === 'verified') verifiedCount++
      else if (f === 'needs-review') needsReviewCount++
      else if (f === 'rejected') rejectedCount++
      else if (f === 'unsupported') unsupportedCount++
      else incompleteCount++
    }

    letterCoverages.push({
      char: def.char,
      name: def.name,
      unicode: def.unicode,
      joiningType: def.joiningType,
      forms: {
        isolated: isoStatus,
        initial: initStatus,
        medial: medStatus,
        final: finStatus
      }
    })
  }

  // Diacritics coverage
  const diacriticsReport = DIACRITICS_MATRIX.map((d) => {
    const wordKey = `ب${d.mark}`
    const entry = candidateDiacritics.get(wordKey)
    const status: ValidationStatus | 'incomplete' = entry ? entry.validation.status : 'incomplete'
    return {
      mark: d.mark,
      name: d.name,
      status
    }
  })

  // Special compositions coverage
  const specialReport = SPECIAL_COMPOSITIONS_MATRIX.map((s) => {
    const entry = candidateSpecial.get(s.word) || candidateExtended.get(s.word)
    const status: ValidationStatus | 'incomplete' = entry ? entry.validation.status : 'incomplete'
    return {
      word: s.word,
      description: s.description,
      status
    }
  })

  const totalForms = letterCoverages.length * 4
  const summary = {
    total: totalForms,
    verified: verifiedCount,
    needsReview: needsReviewCount,
    incomplete: incompleteCount,
    rejected: rejectedCount,
    unsupported: unsupportedCount
  }

  const report: FullCoverageReport = {
    generatedAt: new Date().toISOString(),
    summary,
    letters: letterCoverages,
    diacritics: diacriticsReport,
    specialCompositions: specialReport
  }

  // Save report to data/coverage-report.json & sync to renderer assets
  const outPath = path.resolve('data/coverage-report.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  const assetPath = path.resolve('src/renderer/src/assets/candidates/coverage-report.json')
  const assetDir = path.dirname(assetPath)
  if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true })
  fs.writeFileSync(assetPath, JSON.stringify(report, null, 2), 'utf8')

  return report
}

function runValidation(): void {
  console.log('=== Running Candidate Dataset & Golden Regression Validation ===\n')

  // 1. Golden Reference Regression Test
  console.log('1. Checking Golden Reference ب (fixture_db.json)...')
  const fixtureDbPath = path.resolve('src/renderer/src/assets/fixture_db.json')
  if (!fs.existsSync(fixtureDbPath)) {
    issues.push({
      type: 'ERROR',
      fixture: 'golden_ba',
      field: 'file',
      message: 'fixture_db.json not found'
    })
  } else {
    const fixtureDb: GoldenBaDatabase = JSON.parse(fs.readFileSync(fixtureDbPath, 'utf8'))
    const goldenBa = fixtureDb.letters?.ba?.forms?.isolated
    if (!goldenBa) {
      issues.push({
        type: 'ERROR',
        fixture: 'golden_ba',
        field: 'isolated',
        message: 'letters.ba.forms.isolated not found'
      })
    } else {
      const bodyStroke = goldenBa.strokes?.[0]
      const dotStroke = goldenBa.dots?.[0]

      if (!bodyStroke) {
        issues.push({
          type: 'ERROR',
          fixture: 'golden_ba',
          field: 'strokes[0]',
          message: 'Main body stroke missing'
        })
      } else {
        if (bodyStroke.direction !== 'right_to_left') {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'direction',
            message: `Expected right_to_left, got ${bodyStroke.direction}`
          })
        }
        if (bodyStroke.startPoint?.x !== 466 || bodyStroke.startPoint?.y !== 8) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'startPoint',
            message: `Start point mutated: expected (466, 8), got (${bodyStroke.startPoint?.x}, ${bodyStroke.startPoint?.y})`
          })
        }
        if (bodyStroke.endPoint?.x !== 132 || bodyStroke.endPoint?.y !== 52) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'endPoint',
            message: `End point mutated: expected (132, 52), got (${bodyStroke.endPoint?.x}, ${bodyStroke.endPoint?.y})`
          })
        }
        if (bodyStroke.order !== 1) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'order',
            message: `Body stroke order mutated: expected 1, got ${bodyStroke.order}`
          })
        }

        const expectedBodyPath =
          'M 466 8 C 460 14 454 20 450 26 C 456 48 467 78 468 105 C 469 131 456 153 431 170 C 388 190 312 195 239 194 C 185 193 148 187 130 174 C 118 164 116 145 120 122 C 123 94 126 71 132 52'
        if (normalizePath(bodyStroke.medianPath) !== normalizePath(expectedBodyPath)) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'medianPath',
            message: 'Golden body medianPath does not match reference baseline'
          })
        }
      }

      if (!dotStroke) {
        issues.push({
          type: 'ERROR',
          fixture: 'golden_ba',
          field: 'dots[0]',
          message: 'Dot stroke missing'
        })
      } else {
        if (
          dotStroke.direction &&
          dotStroke.direction !== 'top_to_bottom' &&
          dotStroke.direction !== 'center_outward'
        ) {
          issues.push({
            type: 'WARNING',
            fixture: 'golden_ba',
            field: 'dot.direction',
            message: `Unusual dot direction: ${dotStroke.direction}`
          })
        }
        if (dotStroke.startPoint?.x !== 280 || dotStroke.startPoint?.y !== 241) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'dot.startPoint',
            message: `Dot start point mutated: expected (280, 241), got (${dotStroke.startPoint?.x}, ${dotStroke.startPoint?.y})`
          })
        }
        if (dotStroke.endPoint?.x !== 315 || dotStroke.endPoint?.y !== 276) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'dot.endPoint',
            message: `Dot end point mutated: expected (315, 276), got (${dotStroke.endPoint?.x}, ${dotStroke.endPoint?.y})`
          })
        }
        if (dotStroke.order !== 2) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'dot.order',
            message: `Dot stroke order mutated: expected 2, got ${dotStroke.order}`
          })
        }

        const expectedDotPath = 'M 280 241 L 315 276'
        if (
          dotStroke.medianPath &&
          normalizePath(dotStroke.medianPath) !== normalizePath(expectedDotPath)
        ) {
          issues.push({
            type: 'ERROR',
            fixture: 'golden_ba',
            field: 'dot.medianPath',
            message: 'Golden dot medianPath does not match reference baseline'
          })
        }
      }
    }
  }

  // 2. Candidate JSON Schema Validation
  console.log('3. Validating Candidate Dataset against arabic-strokes.schema.json...')
  const schemaPath = path.resolve('arabic-strokes.schema.json')
  const candidatesPath = path.resolve('data/tegaki/candidates/arabic-strokes.candidates.json')

  if (!fs.existsSync(schemaPath)) {
    issues.push({
      type: 'ERROR',
      fixture: 'schema',
      field: 'file',
      message: 'arabic-strokes.schema.json not found'
    })
  }
  if (!fs.existsSync(candidatesPath)) {
    issues.push({
      type: 'ERROR',
      fixture: 'candidates',
      field: 'file',
      message: 'arabic-strokes.candidates.json not found'
    })
  }

  if (fs.existsSync(schemaPath) && fs.existsSync(candidatesPath)) {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
    const candidates: ArabicStrokeDataset = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))

    const ajv = new Ajv({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    const valid = validate(candidates)

    if (!valid && validate.errors) {
      for (const err of validate.errors) {
        issues.push({
          type: 'ERROR',
          fixture: 'schema_validation',
          field: err.instancePath || 'root',
          message: `${err.message || ''} (${JSON.stringify(err.params)})`
        })
      }
    } else {
      console.log('  -> JSON Schema validation PASSED (100% compliant).')
    }

    // Run Frozen Verified Regression Check
    validateFrozenVerifiedRegression(candidates)

    // 4. Domain & Geometric Semantics Validation
    console.log('4. Validating Candidate Dataset Domain & Geometric Semantics...')

    if (
      !candidates.meta?.fontSha256 ||
      !candidates.meta?.unitsPerEm ||
      !candidates.meta?.fontVersion
    ) {
      issues.push({
        type: 'ERROR',
        fixture: 'meta',
        field: 'provenance',
        message: 'Meta missing required font provenance fields'
      })
    }

    // Letters (Isolated)
    for (const letter of candidates.letters || []) {
      const tag = `letter_${letter.char}`
      if (!letter.source || letter.source.generator !== 'tegaki') {
        issues.push({
          type: 'ERROR',
          fixture: tag,
          field: 'source',
          message: 'Missing or invalid generator provenance'
        })
      }

      for (const s of letter.strokes || []) {
        if (!s.medianPath || s.medianPath.trim() === '') {
          issues.push({
            type: 'ERROR',
            fixture: tag,
            field: `stroke[${s.order}].medianPath`,
            message: 'Median path is empty or undefined'
          })
        }
        if (s.startPoint) {
          validateGeometryNumber(s.startPoint.x, tag, `stroke[${s.order}].startPoint.x`)
          validateGeometryNumber(s.startPoint.y, tag, `stroke[${s.order}].startPoint.y`)
        }
        if (s.endPoint) {
          validateGeometryNumber(s.endPoint.x, tag, `stroke[${s.order}].endPoint.x`)
          validateGeometryNumber(s.endPoint.y, tag, `stroke[${s.order}].endPoint.y`)
        }
      }
    }

    // Word Collections
    const collectionKeys: (keyof Pick<
      ArabicStrokeDataset,
      'contextual' | 'diacritics' | 'special' | 'extended'
    >)[] = ['contextual', 'diacritics', 'special', 'extended']
    for (const key of collectionKeys) {
      const collection = candidates[key] as WordEntry[] | undefined
      for (const item of collection || []) {
        const itemTag = `${key}_${item.word}`
        for (const glyph of item.glyphs || []) {
          for (const s of glyph.strokes || []) {
            if (s.startPoint) {
              validateGeometryNumber(s.startPoint.x, itemTag, 'glyph.startPoint.x')
              validateGeometryNumber(s.startPoint.y, itemTag, 'glyph.startPoint.y')
            }
            if (s.endPoint) {
              validateGeometryNumber(s.endPoint.x, itemTag, 'glyph.endPoint.x')
              validateGeometryNumber(s.endPoint.y, itemTag, 'glyph.endPoint.y')
            }
          }
        }
      }
    }

    // Generate Complete Arabic Coverage Matrix
    console.log('5. Generating Machine-Readable Arabic Coverage Matrix...')
    const coverage = generateCoverageMatrix(candidates)
    console.log('  -> Coverage Matrix generated successfully.')
    console.log(`     Total Form Slots: ${coverage.summary.total}`)
    console.log(`     VERIFIED: ${coverage.summary.verified}`)
    console.log(`     NEEDS-REVIEW: ${coverage.summary.needsReview}`)
    console.log(`     REJECTED: ${coverage.summary.rejected}`)
    console.log(`     INCOMPLETE: ${coverage.summary.incomplete}`)
    console.log(`     UNSUPPORTED: ${coverage.summary.unsupported}`)
  }

  // Summary
  console.log('\n=== Validation Results ===')
  const errors = issues.filter((i) => i.type === 'ERROR')
  const warnings = issues.filter((i) => i.type === 'WARNING')

  if (errors.length === 0 && warnings.length === 0) {
    console.log(
      '✅ ALL CHECKS PASSED: Golden reference intact, frozen verified data protected, and candidate dataset structurally valid.\n'
    )
  } else {
    console.log(`❌ Found ${errors.length} errors and ${warnings.length} warnings:\n`)
    for (const issue of issues) {
      console.log(`[${issue.type}] ${issue.fixture} -> ${issue.field}: ${issue.message}`)
    }
  }

  if (errors.length > 0) {
    process.exit(1)
  }
}

runValidation()
