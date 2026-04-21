export type Language = 'ko' | 'en'

export type LanguagePair = 'ko-en' | 'en-ko'

export type GameMode =
  | 'unsolved'
  | 'wrong'
  | 'correct'
  | 'all'
  | 'review_24h'
  | 'review_1w'
  | 'review_3m'
  | 'review_1y'
  | 'review_old'

export type SentenceStatus = 'correct' | 'wrong' | 'unsolved'

export type ReviewCategory = '24h' | '1w' | '3m' | '1y' | 'old'

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
  solved_at: string | null
  unsolved_correct: boolean | null
  last_wrong_at: string | null
  review_category: ReviewCategory | null
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

export interface LevelHistoryRow {
  to_level: number
  changed_at: string
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
}

export interface ToeflExercise {
  id:           number
  sentence1_en: string
  sentence2_en: string
  korean:       string
  dummy_word:   string
  word_count2:  number
  created_at:   string
}

// Level n → (n+1)~(n+3) words  (Level 1: 2~4, Level 2: 3~5, Level 3: 4~6, ...)
export const LEVEL_WORD_RANGE = (level: number): [number, number] => {
  return [level + 1, level + 3]
}
