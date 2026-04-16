export type Language = 'ko' | 'en'

export type LanguagePair = 'ko-en' | 'en-ko'

export type GameMode = 'unsolved' | 'wrong' | 'correct' | 'all'

export type SentenceStatus = 'correct' | 'wrong' | 'unsolved'

export interface Profile {
  id: string
  username: string
  native_language: Language
  study_language: Language
  current_level: number
  consecutive_correct: number
  consecutive_wrong: number
  total_solved: number
  total_correct: number
  total_wrong: number
  longest_streak: number
  current_streak: number
  last_played_at: string | null
  created_at: string
  updated_at: string
}

export interface Sentence {
  id: number
  source_language: Language
  source_text: string
  target_language: Language
  target_text: string
  word_count: number
  difficulty_level: number
  language_pair: LanguagePair
  source: string
}

export interface Attempt {
  id: string
  user_id: string
  sentence_id: number
  mode: GameMode
  is_correct: boolean
  time_taken_ms: number | null
  word_count: number
  level_at_attempt: number
  started_at: string
  completed_at: string
  created_at: string
}

export interface UserSentenceStatus {
  id: string
  user_id: string
  sentence_id: number
  status: SentenceStatus
  last_attempted_at: string | null
  attempt_count: number
}

export interface DailyStats {
  stat_date: string
  solved: number
  correct: number
  wrong: number
}

export interface GameResult {
  sentence: Sentence
  isCorrect: boolean
  timeTakenMs: number | null
  userAnswer: string[]
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
}

export const LEVEL_WORD_RANGE = (level: number): [number, number] => {
  const min = (level - 1) * 3 + 1
  const max = level * 3
  return [min, max]
}
