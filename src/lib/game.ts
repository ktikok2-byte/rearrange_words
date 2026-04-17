import { GameMode, LEVEL_WORD_RANGE, Profile, ReviewCategory, Sentence } from '@/types'

export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

export function calcTimerSeconds(wordCount: number): number {
  return wordCount
}

export function checkAnswer(userWords: string[], correct: string[]): boolean {
  if (userWords.length !== correct.length) return false
  return userWords.every((w, i) => w === correct[i])
}

export function getLevelForWordCount(wordCount: number): number {
  return Math.max(1, wordCount - 1)
}

export function getWordRangeForLevel(level: number): [number, number] {
  return LEVEL_WORD_RANGE(level)
}

/** Compute review category based on how long after last_wrong_at the sentence was solved */
export function computeReviewCategory(lastWrongAt: Date, solvedAt: Date): ReviewCategory {
  const diffMs   = solvedAt.getTime() - lastWrongAt.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays  = diffHours / 24

  if (diffHours < 24)  return '24h'
  if (diffDays  < 7)   return '1w'
  if (diffDays  < 90)  return '3m'
  if (diffDays  < 365) return '1y'
  return 'old'
}

/** After solving, calculate new level and streaks */
export function calcNewProfile(
  profile: Profile,
  isCorrect: boolean
): Partial<Profile> {
  let { current_level, consecutive_correct, consecutive_wrong, current_streak } = profile

  if (isCorrect) {
    consecutive_correct += 1
    consecutive_wrong   = 0
    current_streak      += 1

    if (consecutive_correct >= 2) {
      current_level      += 1
      consecutive_correct = 0
    }
  } else {
    consecutive_wrong   += 1
    consecutive_correct = 0
    current_streak      = 0

    if (consecutive_wrong >= 2) {
      current_level    = Math.max(1, current_level - 1)
      consecutive_wrong = 0
    }
  }

  const longest_streak = Math.max(profile.longest_streak, current_streak)

  return {
    current_level,
    consecutive_correct,
    consecutive_wrong,
    current_streak,
    longest_streak,
    total_solved:  profile.total_solved  + 1,
    total_correct: profile.total_correct + (isCorrect ? 1 : 0),
    total_wrong:   profile.total_wrong   + (isCorrect ? 0 : 1),
    last_played_at: new Date().toISOString(),
  }
}

/** Return the next sentence status after an attempt */
export function nextSentenceStatus(
  _currentStatus: string,
  _mode: GameMode,
  isCorrect: boolean
): string {
  return isCorrect ? 'correct' : 'wrong'
}

/** Filter sentences by mode for the base 4 modes */
export function filterSentencesByMode(
  sentences: Sentence[],
  userStatuses: Record<number, string>,
  reviewCategories: Record<number, string>,
  mode: GameMode,
  level: number
): Sentence[] {
  const [minWords, maxWords] = getWordRangeForLevel(level)

  return sentences.filter((s) => {
    const status   = userStatuses[s.id]   ?? 'unsolved'
    const category = reviewCategories[s.id] ?? null

    if (mode === 'all')     return true
    if (mode === 'unsolved') return status === 'unsolved' && s.word_count >= minWords && s.word_count <= maxWords
    if (mode === 'wrong')   return status === 'wrong'
    if (mode === 'correct') return status === 'correct'

    // spaced repetition modes
    if (mode === 'review_24h') return status === 'correct' && category === '24h'
    if (mode === 'review_1w')  return status === 'correct' && category === '1w'
    if (mode === 'review_3m')  return status === 'correct' && category === '3m'
    if (mode === 'review_1y')  return status === 'correct' && category === '1y'
    if (mode === 'review_old') return status === 'correct' && category === 'old'

    return false
  })
}

/**
 * Find next unsolved sentence starting from startLevel, searching bidirectionally.
 * preferUp=true  → search upward first (default; after correct answer or fresh start)
 * preferUp=false → search downward first (after consecutive wrong / level drop)
 */
export function findNextUnsolvedSentence(
  allSentences: Sentence[],
  userStatuses: Record<number, string>,
  reviewCategories: Record<number, string>,
  startLevel: number,
  preferUp: boolean
): { sentence: Sentence; level: number } | null {
  const maxWordCount = allSentences.reduce((m, s) => Math.max(m, s.word_count), 0)
  const maxLevel     = Math.max(1, maxWordCount - 1)

  const pick = (lvl: number) => {
    const pool = filterSentencesByMode(allSentences, userStatuses, reviewCategories, 'unsolved', lvl)
    if (pool.length === 0) return null
    return { sentence: pool[Math.floor(Math.random() * pool.length)], level: lvl }
  }

  // First try exact current level
  const atCurrent = pick(startLevel)
  if (atCurrent) return atCurrent

  if (preferUp) {
    // Search upward first
    for (let l = startLevel + 1; l <= maxLevel; l++) {
      const r = pick(l)
      if (r) return r
    }
    // Then downward as fallback
    for (let l = startLevel - 1; l >= 1; l--) {
      const r = pick(l)
      if (r) return r
    }
  } else {
    // Search downward first (after level drop)
    for (let l = startLevel - 1; l >= 1; l--) {
      const r = pick(l)
      if (r) return r
    }
    // Then upward as fallback
    for (let l = startLevel + 1; l <= maxLevel; l++) {
      const r = pick(l)
      if (r) return r
    }
  }

  return null
}
