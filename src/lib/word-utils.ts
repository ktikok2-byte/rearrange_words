export interface WordSlot {
  tileWord: string // word shown on tile (lowercase, no trailing punct, contractions intact)
  punct:    string // trailing punctuation shown in answer area (e.g. "," or ".")
}

// "didn't", "won't", "I'm", etc. — apostrophe between word characters
function isContraction(word: string): boolean {
  return /\w'\w/.test(word)
}

function splitTrailingPunct(raw: string): { base: string; punct: string } {
  if (isContraction(raw)) return { base: raw, punct: '' }
  const match = raw.match(/^(.*?)([.,!?;:]+)$/)
  if (match && match[1].length > 0) return { base: match[1], punct: match[2] }
  return { base: raw, punct: '' }
}

// Convert a raw word to the form shown on a tile
// Rules: lowercase everything except standalone "I"; strip trailing punctuation; keep contractions
export function toTileWord(raw: string): string {
  const { base } = splitTrailingPunct(raw)
  return base === 'I' ? 'I' : base.toLowerCase()
}

// Parse a full sentence into ordered word slots (tile display + trailing punctuation)
export function parseWordSlots(sentence: string): WordSlot[] {
  return sentence.trim().split(/\s+/).map(raw => {
    const { base, punct } = splitTrailingPunct(raw)
    return {
      tileWord: base === 'I' ? 'I' : base.toLowerCase(),
      punct,
    }
  })
}

// Normalize a word for answer comparison: lowercase + strip trailing punctuation
// Contractions are lowercased but apostrophe is preserved
export function normalizeForCompare(word: string): string {
  if (isContraction(word)) return word.toLowerCase()
  return word.replace(/[.,!?;:]+$/, '').toLowerCase()
}
