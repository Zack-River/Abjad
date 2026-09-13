import { Form, getDatabase } from '../data/stroke-db'

// This is a temporary hardcoded mapping for the feasibility stage.
// In production, this would be a more robust mapping layer generated from the font profile.
const glyphToFormMap: Record<number, { letter: string; form: string }> = {
  47: { letter: 'alef', form: 'final' },
  19: { letter: 'ba', form: 'initial' }, // 19 is initial
  16: { letter: 'ba', form: 'medial' }, // 16 is medial
  15: { letter: 'ba', form: 'final' }, // 15 is final
  14: { letter: 'ba', form: 'isolated' } // 14 is isolated
}

export interface ResolvedGlyph {
  glyphId: number
  letterId: string
  formId: string
  form: Form
  isDot: boolean
}

export function resolveGlyph(glyphId: number): ResolvedGlyph | null {
  // Check if it's a known dot glyph (for Google Fonts Noto Sans Arabic, 315 is a common dot below)
  if (glyphId === 315) {
    return {
      glyphId,
      letterId: 'dot',
      formId: 'dot',
      form: null as unknown as Form,
      isDot: true
    }
  }

  const mapping = glyphToFormMap[glyphId]
  if (!mapping) {
    return null // Not found in our limited db
  }

  const db = getDatabase()
  const letter = db.letters[mapping.letter]
  if (!letter) return null

  const form = letter.forms[mapping.form]
  if (!form || form.status === 'reserved_not_implemented') {
    return null
  }

  return {
    glyphId,
    letterId: mapping.letter,
    formId: mapping.form,
    form,
    isDot: false
  }
}
