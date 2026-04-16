import { GameMode, LEVEL_WORD_RANGE, Profile, Sentence } from '@/types'

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

// Level n → (n+1)~(n+2) words, so word count w belongs to level max(1, w-1)
export function getLevelForWordCount(wordCount: number): number {
  return Math.max(1, wordCount - 1)
}

export function getWordRangeForLevel(level: number): [number, number] {
  return LEVEL_WORD_RANGE(level)
}

/** After solving, calculate new level and streaks */
export function calcNewProfile(
  profile: Profile,
  isCorrect: boolean
): Partial<Profile> {
  let { current_level, consecutive_correct, consecutive_wrong, current_streak } = profile

  if (isCorrect) {
    consecutive_correct += 1
    consecutive_wrong = 0
    current_streak += 1

    if (consecutive_correct >= 2) {
      current_level += 1
      consecutive_correct = 0
    }
  } else {
    consecutive_wrong += 1
    consecutive_correct = 0
    current_streak = 0

    if (consecutive_wrong >= 2) {
      current_level = Math.max(1, current_level - 1)
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
    total_solved: profile.total_solved + 1,
    total_correct: profile.total_correct + (isCorrect ? 1 : 0),
    total_wrong: profile.total_wrong + (isCorrect ? 0 : 1),
    last_played_at: new Date().toISOString(),
  }
}

/** Return the next sentence status after an attempt */
export function nextSentenceStatus(
  currentStatus: string,
  mode: GameMode,
  isCorrect: boolean
): string {
  if (isCorrect) return 'correct'
  return 'wrong'
}

/** Filter sentences by mode */
export function filterSentencesByMode(
  sentences: Sentence[],
  userStatuses: Record<number, string>,
  mode: GameMode,
  level: number
): Sentence[] {
  const [minWords, maxWords] = getWordRangeForLevel(level)

  return sentences.filter((s) => {
    const status = userStatuses[s.id] ?? 'unsolved'

    if (mode === 'all') return true
    if (mode === 'unsolved') {
      return status === 'unsolved' && s.word_count >= minWords && s.word_count <= maxWords
    }
    if (mode === 'wrong') return status === 'wrong'
    if (mode === 'correct') return status === 'correct'
    return false
  })
}
