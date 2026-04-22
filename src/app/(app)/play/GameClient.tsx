'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GameMode, Profile, ReviewCategory, Sentence, ToeflExercise, LANGUAGE_NAMES } from '@/types'
import {
  shuffleArray, tokenize, checkAnswer,
  filterSentencesByMode, calcNewProfile, nextSentenceStatus,
  computeReviewCategory, findNextUnsolvedSentence,
} from '@/lib/game'
import GameTimer from '@/components/GameTimer'
import WordCard from '@/components/WordCard'
import { useSettings } from '@/hooks/useSettings'

type Phase = 'mode-select' | 'playing' | 'result' | 'refilling' | 'all-done' | 'ai-loading' | 'toefl-loading' | 'toefl-playing' | 'toefl-result'

interface Props {
  userId: string
  initialProfile: Profile
}

// Spaced repetition mode metadata
const REVIEW_MODES: { mode: GameMode; label: string; category: ReviewCategory }[] = [
  { mode: 'review_24h', label: '24시간 이내 맞힌 문제', category: '24h' },
  { mode: 'review_1w',  label: '24시간~1주일 맞힌 문제', category: '1w'  },
  { mode: 'review_3m',  label: '1주일~3개월 맞힌 문제', category: '3m'  },
  { mode: 'review_1y',  label: '3개월~1년 맞힌 문제',   category: '1y'  },
  { mode: 'review_old', label: '1년 이상 후 맞힌 문제', category: 'old' },
]

// Supabase server-side max_rows defaults to 1000; paginate to get all sentences
async function fetchAllSentences(supabase: ReturnType<typeof createClient>): Promise<Sentence[]> {
  const PAGE = 1000
  let all: Sentence[] = []
  let from = 0
  while (true) {
    const { data } = await supabase.from('sentences').select('*').order('id').range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all = [...all, ...data]
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export default function GameClient({ userId, initialProfile }: Props) {
  const supabase   = createClient()
  const { settings } = useSettings()

  const [profile, setProfile]       = useState<Profile>(initialProfile)
  const [mode, setMode]             = useState<GameMode>('unsolved')
  const [phase, setPhase]           = useState<Phase>('mode-select')

  const [sentences, setSentences]           = useState<Sentence[]>([])
  const [userStatuses, setUserStatuses]     = useState<Record<number, string>>({})
  const [reviewCategories, setReviewCategories] = useState<Record<number, string>>({})
  const [currentSentence, setCurrentSentence]   = useState<Sentence | null>(null)
  const [shuffledWords, setShuffledWords]       = useState<string[]>([])
  // answerEntries: words placed in answer area, each tracking which source slot it came from
  const [answerEntries, setAnswerEntries]       = useState<{ word: string; sourceIdx: number }[]>([])
  const [usedIndices, setUsedIndices]           = useState<Set<number>>(new Set())
  const submittingRef  = useRef(false)
  const sourceAreaRef  = useRef<HTMLDivElement>(null)
  const [answerMinH, setAnswerMinH] = useState(56)

  const [timerSeconds, setTimerSeconds] = useState(3)
  const [timerPaused, setTimerPaused]   = useState(false)
  const [startTime, setStartTime]       = useState<Date | null>(null)

  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean
    timeTakenMs: number | null
    timerSeconds: number
    correctAnswer: string
    nativeTranslation: string
  } | null>(null)

  const [shake, setShake]         = useState(false)
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null)
  const [ready, setReady]         = useState(false)
  const [aiError, setAiError]     = useState<string | null>(null)

  // TOEFL state
  const toeflContextRef = useRef<'new' | 'wrong'>('new') // tracks whether last TOEFL was AI-new or wrong-replay
  const [currentToefl, setCurrentToefl]     = useState<ToeflExercise | null>(null)
  const [toeflResult, setToeflResult]       = useState<{
    isCorrect: boolean
    timeTakenMs: number | null
    correctAnswer: string
    korean: string
    sentence1: string
  } | null>(null)
  // exerciseId → latest attempt: { isCorrect, attemptedAt }
  const [toeflStatuses, setToeflStatuses]   = useState<Record<number, { isCorrect: boolean; attemptedAt: string }>>({})
  const toeflWrongIds = Object.entries(toeflStatuses)
    .filter(([, v]) => !v.isCorrect)
    .map(([id]) => Number(id))

  // Track direction of last level change for bidirectional skip
  const lastLevelChangeRef = useRef<'up' | 'down' | null>(null)

  // ── Data loading ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const sents = await fetchAllSentences(supabase)
      setSentences(sents)

      const { data: statuses } = await supabase
        .from('user_sentence_status')
        .select('sentence_id, status, review_category')
        .eq('user_id', userId)

      const statusMap: Record<number, string> = {}
      const categoryMap: Record<number, string> = {}
      statuses?.forEach(s => {
        statusMap[s.sentence_id] = s.status
        if (s.review_category) categoryMap[s.sentence_id] = s.review_category
      })
      setUserStatuses(statusMap)
      setReviewCategories(categoryMap)

      // Load TOEFL attempt history — build latest-attempt-per-exercise map
      const { data: toeflRows } = await supabase
        .from('user_toefl_status')
        .select('exercise_id, is_correct, attempted_at')
        .eq('user_id', userId)
        .order('attempted_at', { ascending: true })

      const toeflMap: Record<number, { isCorrect: boolean; attemptedAt: string }> = {}
      toeflRows?.forEach(r => {
        toeflMap[r.exercise_id] = { isCorrect: r.is_correct, attemptedAt: r.attempted_at }
      })
      setToeflStatuses(toeflMap)
    }
    load()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sentence picking ──────────────────────────────────────
  const pickNextSentence = useCallback((
    allSentences: Sentence[],
    statuses: Record<number, string>,
    categories: Record<number, string>,
    currentMode: GameMode,
    currentLevel: number
  ): Sentence | null => {
    const pool = filterSentencesByMode(allSentences, statuses, categories, currentMode, currentLevel)
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }, [])

  // ── Refill sentences API ──────────────────────────────────
  const triggerRefill = useCallback(async (level: number): Promise<boolean> => {
    try {
      const res  = await fetch('/api/refill-sentences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, userId, username: profile.username }),
      })
      const json = await res.json()
      return (json.added ?? 0) > 0
    } catch {
      return false
    }
  }, [userId, profile.username])

  // ── Launch sentence ───────────────────────────────────────
  const launchSentence = (sentence: Sentence, _level: number, _selectedMode: GameMode) => {
    const words   = tokenize(sentence.target_text)
    const shuffled = shuffleArray(words)
    setCurrentSentence(sentence)
    setShuffledWords(shuffled)
    setAnswerEntries([])
    setUsedIndices(new Set())
    submittingRef.current = false
    const secs = Math.round(words.length * settings.secondsPerWord * 10) / 10
    setTimerSeconds(secs)

    const useStart = settings.useStartButton
    setTimerPaused(useStart)
    setReady(useStart)
    setStartTime(useStart ? null : new Date())
    setLastResult(null)
    setPhase('playing')
  }

  const handleStartTimer = () => {
    setReady(false)
    setTimerPaused(false)
    setStartTime(new Date())
  }

  // ── AI sentence fetch ─────────────────────────────────────
  const fetchAiSentence = useCallback(async (): Promise<{ sentence: Sentence | null; error?: string }> => {
    try {
      const res = await fetch('/api/ai-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: profile.current_level }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { sentence: null, error: json.error ?? `HTTP ${res.status}` }
      }
      if (json.sentence) {
        setSentences(prev => [...prev, json.sentence])
        return { sentence: json.sentence }
      }
      return { sentence: null, error: 'Empty response from AI' }
    } catch (e) {
      return { sentence: null, error: String(e) }
    }
  }, [profile.current_level])

  // ── TOEFL ─────────────────────────────────────────────────
  const fetchToeflExercise = useCallback(async (): Promise<{ exercise: ToeflExercise | null; error?: string }> => {
    try {
      const res = await fetch('/api/ai-toefl', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) return { exercise: null, error: json.error ?? `HTTP ${res.status}` }
      if (json.exercise) return { exercise: json.exercise }
      return { exercise: null, error: 'Empty response from AI' }
    } catch (e) {
      return { exercise: null, error: String(e) }
    }
  }, [])

  const launchToeflExercise = useCallback((exercise: ToeflExercise) => {
    setCurrentToefl(exercise)
    const words = [...exercise.sentence2_en.trim().split(/\s+/), exercise.dummy_word]
    const shuffled = shuffleArray(words)
    setShuffledWords(shuffled)
    setAnswerEntries([])
    setUsedIndices(new Set())
    submittingRef.current = false
    setTimerSeconds(30)
    const useStart = settings.useStartButton
    setTimerPaused(useStart)
    setReady(useStart)
    setStartTime(useStart ? null : new Date())
    setToeflResult(null)
    setPhase('toefl-playing')
  }, [settings.useStartButton])

  const startToefl = useCallback(async () => {
    toeflContextRef.current = 'new'
    setAiError(null)
    setPhase('toefl-loading')
    const { exercise, error } = await fetchToeflExercise()
    if (!exercise) {
      setAiError(`TOEFL 문제 생성 실패: ${error ?? '알 수 없는 오류'}`)
      setPhase('mode-select')
      return
    }
    launchToeflExercise(exercise)
  }, [fetchToeflExercise, launchToeflExercise])

  const startWrongToefl = useCallback(async () => {
    if (toeflWrongIds.length === 0) return
    toeflContextRef.current = 'wrong'
    const randomId = toeflWrongIds[Math.floor(Math.random() * toeflWrongIds.length)]
    setPhase('toefl-loading')
    const { data: exercise, error } = await supabase
      .from('toefl_exercises')
      .select('*')
      .eq('id', randomId)
      .single()
    if (error || !exercise) {
      setAiError('TOEFL 문제를 불러오지 못했습니다.')
      setPhase('mode-select')
      return
    }
    launchToeflExercise(exercise as ToeflExercise)
  }, [toeflWrongIds, supabase, launchToeflExercise])

  const submitToeflAnswer = useCallback(async (answer: string[]) => {
    if (!currentToefl || !startTime || submittingRef.current) return
    submittingRef.current = true
    setTimerPaused(true)

    const correctWords = currentToefl.sentence2_en.trim().split(/\s+/)
    const isCorrect = answer.length === correctWords.length &&
      answer.every((w, i) => w.toLowerCase() === correctWords[i].toLowerCase())
    const now = new Date()
    const timeTakenMs = now.getTime() - startTime.getTime()

    if (!isCorrect) { setShake(true); setTimeout(() => setShake(false), 500) }

    await supabase.from('user_toefl_status').insert({
      user_id:      userId,
      exercise_id:  currentToefl.id,
      is_correct:   isCorrect,
      time_taken_ms: isCorrect ? timeTakenMs : null,
    })

    // Update in-memory TOEFL status (latest attempt per exercise)
    setToeflStatuses(prev => ({
      ...prev,
      [currentToefl.id]: { isCorrect, attemptedAt: now.toISOString() },
    }))

    setToeflResult({
      isCorrect,
      timeTakenMs: isCorrect ? timeTakenMs : null,
      correctAnswer: currentToefl.sentence2_en,
      korean:        currentToefl.korean,
      sentence1:     currentToefl.sentence1_en,
    })
    setPhase('toefl-result')
  }, [currentToefl, startTime, userId, supabase])

  // ── Start game ────────────────────────────────────────────
  const startGame = useCallback(async (selectedMode: GameMode) => {
    setMode(selectedMode)
    setLevelUpMsg(null)

    // AI mode: generate a new sentence via Groq API
    if (settings.sentenceMode === 'ai' && selectedMode === 'unsolved') {
      setAiError(null)
      setPhase('ai-loading')
      const { sentence, error } = await fetchAiSentence()
      if (sentence) {
        launchSentence(sentence, profile.current_level, selectedMode)
      } else {
        setAiError(`AI 문장 생성 실패: ${error ?? '알 수 없는 오류'}`)
        setPhase('mode-select')
      }
      return
    }

    if (selectedMode === 'unsolved') {
      const preferUp = lastLevelChangeRef.current !== 'down'
      lastLevelChangeRef.current = null
      const result = findNextUnsolvedSentence(
        sentences, userStatuses, reviewCategories, profile.current_level, preferUp
      )

      if (!result) {
        setPhase('refilling')
        const added = await triggerRefill(profile.current_level)
        if (added) {
          const newSents = await fetchAllSentences(supabase)
          setSentences(newSents)
          const result2 = findNextUnsolvedSentence(
            newSents, userStatuses, reviewCategories, profile.current_level, true
          )
          if (result2) { launchSentence(result2.sentence, result2.level, selectedMode); return }
        }
        setPhase('all-done')
        return
      }

      // Auto level-up when skipping ahead
      if (result.level !== profile.current_level) {
        const dir = result.level > profile.current_level ? '위' : '아래'
        setLevelUpMsg(`Lv.${profile.current_level}에 풀 문장이 없어 Lv.${result.level}로 이동합니다.`)
        if (result.level > profile.current_level) triggerRefill(profile.current_level)
        const newProfileData = { current_level: result.level, consecutive_correct: 0, consecutive_wrong: 0 }
        await supabase.from('profiles').update(newProfileData).eq('id', userId)
        // Record level history
        await supabase.from('level_history').insert({
          user_id: userId,
          from_level: profile.current_level,
          to_level: result.level,
          reason: 'level_exhausted',
          changed_at: new Date().toISOString(),
        })
        setProfile(prev => ({ ...prev, ...newProfileData }))
        void dir
      }

      launchSentence(result.sentence, result.level, selectedMode)
    } else {
      const sentence = pickNextSentence(
        sentences, userStatuses, reviewCategories, selectedMode, profile.current_level
      )
      if (!sentence) { setPhase('mode-select'); return }
      launchSentence(sentence, profile.current_level, selectedMode)
    }
  }, [sentences, userStatuses, reviewCategories, profile, userId, pickNextSentence, triggerRefill, supabase, fetchAiSentence, settings.sentenceMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word interaction ──────────────────────────────────────
  const handleWordClick = (word: string, index: number) => {
    if (usedIndices.has(index) || submittingRef.current) return
    const newUsed = new Set(usedIndices)
    newUsed.add(index)
    setUsedIndices(newUsed)
    const newEntries = [...answerEntries, { word, sourceIdx: index }]
    setAnswerEntries(newEntries)
    // TOEFL has a dummy word so auto-submit is not applicable; only regular mode auto-submits
    if (phase !== 'toefl-playing' && newEntries.length === shuffledWords.length) {
      submitAnswer(newEntries.map(e => e.word))
    }
  }

  const handleAnswerClick = (idx: number) => {
    const entry = answerEntries[idx]
    if (!entry) return
    setAnswerEntries(answerEntries.filter((_, i) => i !== idx))
    const newUsed = new Set(usedIndices)
    newUsed.delete(entry.sourceIdx)
    setUsedIndices(newUsed)
  }

  // ── Submit answer ─────────────────────────────────────────
  const submitAnswer = useCallback(async (answer: string[]) => {
    if (!currentSentence || !startTime || submittingRef.current) return
    submittingRef.current = true
    setTimerPaused(true)

    const correctWords = tokenize(currentSentence.target_text)
    const isCorrect    = checkAnswer(answer, correctWords)
    const now          = new Date()
    const timeTakenMs  = now.getTime() - startTime.getTime()

    if (!isCorrect) { setShake(true); setTimeout(() => setShake(false), 500) }

    const prevStatus   = userStatuses[currentSentence.id] ?? 'unsolved'
    const newStatus    = nextSentenceStatus(prevStatus, mode, isCorrect)
    const newProfileData = mode === 'unsolved' ? calcNewProfile(profile, isCorrect) : {}

    // Fetch existing row (need last_wrong_at for review_category)
    const { data: existing } = await supabase
      .from('user_sentence_status')
      .select('id, attempt_count, solved_at, last_wrong_at')
      .eq('user_id', userId).eq('sentence_id', currentSentence.id).single()

    // unsolved mode: record first solve
    const unsolvedFields = (mode === 'unsolved' && !existing?.solved_at)
      ? { solved_at: now.toISOString(), unsolved_correct: isCorrect }
      : {}

    // Spaced repetition fields
    let reviewFields: Record<string, unknown> = {}
    if (!isCorrect) {
      reviewFields = { last_wrong_at: now.toISOString(), review_category: null }
    } else if (prevStatus === 'wrong' && existing?.last_wrong_at) {
      const cat = computeReviewCategory(new Date(existing.last_wrong_at), now)
      reviewFields = { review_category: cat }
    }

    if (existing) {
      await supabase.from('user_sentence_status').update({
        status: newStatus,
        last_attempted_at: now.toISOString(),
        attempt_count: existing.attempt_count + 1,
        ...unsolvedFields,
        ...reviewFields,
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_sentence_status').insert({
        user_id: userId,
        sentence_id: currentSentence.id,
        status: newStatus,
        last_attempted_at: now.toISOString(),
        attempt_count: 1,
        ...unsolvedFields,
        ...reviewFields,
      })
    }

    // Update in-memory status
    setUserStatuses(prev => ({ ...prev, [currentSentence.id]: newStatus }))

    // Update in-memory review category
    if ('review_category' in reviewFields) {
      const cat = reviewFields.review_category as string | null
      setReviewCategories(prev => {
        const next = { ...prev }
        if (cat) next[currentSentence.id] = cat
        else delete next[currentSentence.id]
        return next
      })
    }

    // Profile update + level history (unsolved mode only)
    if (mode === 'unsolved' && Object.keys(newProfileData).length > 0) {
      // Track level change direction
      if (typeof newProfileData.current_level === 'number' &&
          newProfileData.current_level !== profile.current_level) {
        lastLevelChangeRef.current = newProfileData.current_level > profile.current_level ? 'up' : 'down'
        await supabase.from('level_history').insert({
          user_id:    userId,
          from_level: profile.current_level,
          to_level:   newProfileData.current_level,
          reason:     isCorrect ? 'correct_streak' : 'wrong_streak',
          changed_at: now.toISOString(),
        })
      }
      await supabase.from('profiles').update(newProfileData).eq('id', userId)
      setProfile(prev => ({ ...prev, ...newProfileData }))
    }

    setLastResult({
      isCorrect,
      timeTakenMs: isCorrect ? timeTakenMs : null,
      timerSeconds,
      correctAnswer:     currentSentence.target_text,
      nativeTranslation: currentSentence.source_text,
    })
    setPhase('result')
  }, [currentSentence, startTime, mode, profile, userId, userStatuses, timerSeconds, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Measure source area (all words always rendered) to pre-allocate answer area height.
  // useLayoutEffect fires before paint so there's no visible flash.
  useLayoutEffect(() => {
    if (sourceAreaRef.current) setAnswerMinH(sourceAreaRef.current.offsetHeight)
  }, [shuffledWords])

  const handleTimerExpire = useCallback(() => {
    if (phase === 'toefl-playing') {
      submitToeflAnswer(answerEntries.map(e => e.word))
    } else {
      submitAnswer(answerEntries.map(e => e.word))
    }
  }, [phase, answerEntries, submitAnswer, submitToeflAnswer])

  // ===== RENDER =====

  if (phase === 'toefl-loading') {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <div className="text-4xl animate-spin inline-block">🤖</div>
        <p className="text-slate-700 font-semibold">TOEFL 문제를 만들고 있어요...</p>
        <p className="text-slate-400 text-sm">잠시만 기다려주세요.</p>
      </div>
    )
  }

  if (phase === 'toefl-result' && toeflResult) {
    const displaySec = toeflResult.timeTakenMs !== null ? toeflResult.timeTakenMs / 1000 : null
    return (
      <div className="max-w-lg mx-auto bounce-in">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-600 rounded-full">TOEFL Writing 유형1</span>
        </div>
        <div className={`rounded-2xl border-2 p-6 mb-6 ${toeflResult.isCorrect ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
          <div className="text-3xl mb-2">{toeflResult.isCorrect ? '✅' : '❌'}</div>
          <div className={`text-xl font-bold mb-1 ${toeflResult.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            {toeflResult.isCorrect ? '정답!' : '오답'}
          </div>
          {displaySec !== null && (
            <div className="text-sm text-green-600 mb-3">{displaySec.toFixed(2)}초 만에 맞췄어요!</div>
          )}
          <div className="bg-white rounded-xl p-4 border border-slate-100 space-y-3">
            <div>
              <span className="text-xs text-slate-400 uppercase font-medium">앞 문장 (맥락)</span>
              <p className="text-slate-700 mt-0.5 italic">{toeflResult.sentence1}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase font-medium">정답 문장</span>
              <p className="text-slate-800 font-medium mt-0.5">{toeflResult.correctAnswer}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase font-medium">한국어 번역</span>
              <p className="text-slate-600 mt-0.5">{toeflResult.korean}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={toeflContextRef.current === 'wrong' ? startWrongToefl : startToefl}
            className="flex-1 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors">
            {toeflContextRef.current === 'wrong' ? '다음 틀린 문제' : '다음 문제'}
          </button>
          <button onClick={() => { setPhase('mode-select') }}
            className="px-5 py-3 bg-white text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            모드 선택
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'toefl-playing' && currentToefl) {
    const correctWordCount = currentToefl.word_count2
    const actualAnswerCount = answerEntries.length

    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-600 rounded-full">TOEFL 유형1</span>
          </span>
          <span>English · {correctWordCount}단어 + 가짜 1개</span>
        </div>

        <GameTimer
          key={currentToefl.id}
          seconds={30}
          onExpire={handleTimerExpire}
          paused={timerPaused}
        />

        {/* Context sentence */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 space-y-1">
          <span className="text-xs font-semibold text-orange-500 uppercase tracking-wide">앞 문장 (맥락)</span>
          <p className="text-slate-800 text-sm italic">{currentToefl.sentence1_en}</p>
          {settings.showTranslation && (
            <p className="text-slate-500 text-xs">{currentToefl.korean}</p>
          )}
        </div>

        {ready ? (
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <p className="text-slate-400 text-sm">준비되면 아래 버튼을 누르세요</p>
            <button
              onClick={handleStartTimer}
              className="px-10 py-4 bg-orange-500 text-white text-lg font-bold rounded-2xl hover:bg-orange-600 transition-colors shadow-lg">
              ▶ 시작
            </button>
          </div>
        ) : (
          <>
            <div
              style={{ minHeight: answerMinH }}
              className={`bg-white rounded-xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-start
                ${shake ? 'shake border-red-300' : 'border-orange-200'}`}
            >
              {answerEntries.length === 0 && (
                <span className="text-slate-300 text-sm self-center w-full text-center">
                  아래 단어를 순서대로 클릭하세요 (가짜 단어 1개 포함)
                </span>
              )}
              {answerEntries.map((e, i) => (
                <WordCard key={i} word={e.word} onClick={() => handleAnswerClick(i)} variant="answer" index={i} />
              ))}
            </div>

            <div ref={sourceAreaRef} className="flex flex-wrap gap-2">
              {shuffledWords.map((word, i) => (
                <div key={i} className={usedIndices.has(i) ? 'invisible pointer-events-none' : ''}>
                  <WordCard word={word} onClick={() => handleWordClick(word, i)} variant="source" index={i} />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setAnswerEntries([]); setUsedIndices(new Set()) }}
                className="flex-1 py-2.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                초기화
              </button>
              <button
                onClick={() => actualAnswerCount > 0 && submitToeflAnswer(answerEntries.map(e => e.word))}
                disabled={actualAnswerCount === 0}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-40 transition-colors">
                제출
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (phase === 'ai-loading') {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <div className="text-4xl animate-spin inline-block">🤖</div>
        <p className="text-slate-700 font-semibold">AI가 문제를 만들고 있어요...</p>
        <p className="text-slate-400 text-sm">잠시만 기다려주세요.</p>
      </div>
    )
  }

  if (phase === 'refilling') {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <div className="text-4xl animate-spin inline-block">⚙️</div>
        <p className="text-slate-700 font-semibold">모든 문장을 풀었어요!</p>
        <p className="text-slate-400 text-sm">새 문장을 자동으로 추가하는 중입니다...</p>
      </div>
    )
  }

  if (phase === 'all-done') {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-6 bounce-in">
        <div className="text-6xl">🏆</div>
        <h2 className="text-2xl font-extrabold text-slate-800">모든 문장을 풀었어요!</h2>
        <p className="text-slate-500">
          현재 제공된 모든 문장을 완료하셨습니다.<br />
          곧 새로운 문장이 업데이트될 예정입니다.
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-sm text-blue-700">
          틀린 문제 풀기나 맞은 문제 복습으로 계속 연습할 수 있어요.
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => setPhase('mode-select')}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            다른 모드로 계속하기
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-white text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            홈으로
          </Link>
        </div>
      </div>
    )
  }

  // ── Mode select ───────────────────────────────────────────
  if (phase === 'mode-select') {
    const wrongCount    = Object.values(userStatuses).filter(s => s === 'wrong').length
    const correctCount  = Object.values(userStatuses).filter(s => s === 'correct').length
    // Unsolved at current level (matches what the mode actually serves)
    const unsolvedCount = filterSentencesByMode(sentences, userStatuses, reviewCategories, 'unsolved', profile.current_level).length

    const reviewCounts: Record<string, number> = {}
    for (const [idStr, status] of Object.entries(userStatuses)) {
      if (status === 'correct') {
        const cat = reviewCategories[Number(idStr)]
        if (cat) reviewCounts[cat] = (reviewCounts[cat] ?? 0) + 1
      }
    }

    const counts: Record<GameMode, number> = {
      unsolved:   unsolvedCount,
      wrong:      wrongCount,
      correct:    correctCount,
      all:        sentences.length,
      review_24h: reviewCounts['24h'] ?? 0,
      review_1w:  reviewCounts['1w']  ?? 0,
      review_3m:  reviewCounts['3m']  ?? 0,
      review_1y:  reviewCounts['1y']  ?? 0,
      review_old: reviewCounts['old'] ?? 0,
    }

    return (
      <div className="max-w-lg mx-auto">
        {aiError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
            <span className="shrink-0">⚠️</span>
            <div>
              <p>{aiError}</p>
              <button onClick={() => setAiError(null)} className="mt-1 text-xs underline text-red-500">닫기</button>
            </div>
          </div>
        )}
        {settings.gameMode === 'toefl' ? (
          /* ── TOEFL mode select ───────────────────────────── */
          <>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-slate-800">TOEFL Writing 유형1</h2>
              <span className="px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-600 rounded-full">TOEFL 모드</span>
            </div>
            <p className="text-slate-500 text-sm mb-6">
              설정에서 일반 모드로 변경할 수 있습니다.
            </p>
            <div className="space-y-3">
              <button
                onClick={startToefl}
                className="w-full text-left px-5 py-4 rounded-xl border-2 border-orange-200 bg-orange-50 hover:border-orange-400 hover:bg-orange-100 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">새 문제 (AI 생성)</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-200 text-orange-700">AI · 30초</span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">연관된 두 문장 중 두 번째 문장을 완성하세요.</div>
              </button>
              <button
                onClick={startWrongToefl}
                disabled={toeflWrongIds.length === 0}
                className="w-full text-left px-5 py-4 rounded-xl border-2 border-red-200 bg-white hover:border-red-400 hover:bg-red-50 transition-all disabled:opacity-40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">틀린 문제 다시 풀기</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                    {toeflWrongIds.length}문제
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">틀렸던 TOEFL 문제를 다시 연습해요.</div>
              </button>
            </div>
          </>
        ) : (
          /* ── Normal mode select ──────────────────────────── */
          <>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-2xl font-bold text-slate-800">게임 모드 선택</h2>
          {settings.sentenceMode === 'ai' && (
            <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-600 rounded-full">AI 모드</span>
          )}
        </div>
        <p className="text-slate-500 text-sm mb-6">
          현재 레벨: <span className="font-bold text-blue-600">Lv.{profile.current_level}</span>
          {' '}({profile.current_level + 1}~{profile.current_level + 3}단어)
        </p>

        {/* Main modes */}
        <div className="space-y-3">
          {([
            { mode: 'unsolved' as GameMode, label: '안 풀었던 문제',    desc: '새로운 문제. 레벨 시스템 적용.',                color: 'blue'  },
            { mode: 'wrong'    as GameMode, label: '틀린 문제 다시 풀기', desc: '틀렸던 문제를 다시 연습해요.',                 color: 'red'   },
            { mode: 'correct'  as GameMode, label: '맞은 문제 복습',     desc: '맞췄던 문제를 복습해요.',                     color: 'green' },
            { mode: 'all'      as GameMode, label: '전체 문제 풀기',     desc: '모든 문제를 랜덤으로 풀어요.',                 color: 'slate' },
          ] as const).map(({ mode: m, label, desc, color }) => (
            <button key={m} onClick={() => startGame(m)}
              disabled={m === 'unsolved' && settings.sentenceMode === 'ai' ? false : (sentences.length === 0 || counts[m] === 0)}
              className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all bg-white disabled:opacity-40
                ${color === 'blue'  ? 'border-blue-200  hover:border-blue-500  hover:bg-blue-50'  : ''}
                ${color === 'red'   ? 'border-red-200   hover:border-red-500   hover:bg-red-50'   : ''}
                ${color === 'green' ? 'border-green-200 hover:border-green-500 hover:bg-green-50' : ''}
                ${color === 'slate' ? 'border-slate-200 hover:border-slate-400 hover:bg-slate-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{label}</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full
                  ${color === 'blue'  ? 'bg-blue-100  text-blue-600'  : ''}
                  ${color === 'red'   ? 'bg-red-100   text-red-600'   : ''}
                  ${color === 'green' ? 'bg-green-100 text-green-600' : ''}
                  ${color === 'slate' ? 'bg-slate-100 text-slate-600' : ''}`}>
                  {counts[m]}문장
                </span>
              </div>
              <div className="text-sm text-slate-500 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>

        {/* TOEFL Writing mode */}
        <div className="mt-4">
          <button
            onClick={startToefl}
            className="w-full text-left px-5 py-4 rounded-xl border-2 border-orange-200 bg-orange-50 hover:border-orange-400 hover:bg-orange-100 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">TOEFL Writing 유형1</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-200 text-orange-700">AI · 30초</span>
            </div>
            <div className="text-sm text-slate-500 mt-0.5">연관된 두 문장 중 두 번째 문장을 완성하세요. (가짜 단어 1개 포함)</div>
          </button>
        </div>

        {/* Spaced repetition modes — always visible */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">스페이스드 복습</h3>
          <div className="space-y-2">
            {([
              { mode: 'review_24h' as GameMode, label: '24시간 이내 맞힌 문제 풀기' },
              { mode: 'review_1w'  as GameMode, label: '24시간~1주일 맞힌 문제 풀기' },
              { mode: 'review_3m'  as GameMode, label: '1주일~3개월 맞힌 문제 풀기' },
              { mode: 'review_1y'  as GameMode, label: '3개월~1년 맞힌 문제 풀기' },
              { mode: 'review_old' as GameMode, label: '1년 이상 후 맞힌 문제 풀기' },
            ]).map(({ mode: m, label }) => (
              <button key={m} onClick={() => startGame(m)}
                disabled={counts[m] === 0}
                className="w-full text-left px-5 py-3 rounded-xl border-2 border-purple-100 bg-white
                  hover:border-purple-400 hover:bg-purple-50 transition-all disabled:opacity-40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 text-sm">{label}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
                    {counts[m]}문장
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {sentences.length === 0 && (
          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm">
            데이터를 불러오는 중...
          </div>
        )}
          </>
        )}
      </div>
    )
  }

  // ── Result ────────────────────────────────────────────────
  if (phase === 'result' && lastResult) {
    const displaySec = lastResult.timeTakenMs !== null
      ? lastResult.timeTakenMs / 1000
      : null

    return (
      <div className="max-w-lg mx-auto bounce-in">
        {levelUpMsg && (
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm font-medium">
            {levelUpMsg}
          </div>
        )}

        <div className={`rounded-2xl border-2 p-6 mb-6 ${
          lastResult.isCorrect ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'
        }`}>
          <div className="text-3xl mb-2">{lastResult.isCorrect ? '✅' : '❌'}</div>
          <div className={`text-xl font-bold mb-1 ${lastResult.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            {lastResult.isCorrect ? '정답!' : '오답'}
          </div>
          {displaySec !== null && (
            <div className="text-sm text-green-600 mb-3">
              {displaySec.toFixed(2)}초 만에 맞췄어요!
            </div>
          )}
          <div className="bg-white rounded-xl p-4 border border-slate-100 space-y-2">
            <div>
              <span className="text-xs text-slate-400 uppercase font-medium">정답 문장</span>
              <p className="text-slate-800 font-medium mt-0.5">{lastResult.correctAnswer}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase font-medium">
                {LANGUAGE_NAMES[profile.native_language]} 번역
              </span>
              <p className="text-slate-600 mt-0.5">{lastResult.nativeTranslation}</p>
            </div>
          </div>
        </div>

        {mode === 'unsolved' && (
          <div className="bg-white rounded-xl p-4 border border-slate-100 mb-6 text-sm text-slate-600">
            <span className="font-medium">현재 레벨: </span>
            <span className="text-blue-600 font-bold">Lv.{profile.current_level}</span>
            {' · '}연속 정답: {profile.consecutive_correct}/2
            {' · '}연속 오답: {profile.consecutive_wrong}/2
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => startGame(mode)}
            className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            다음 문제
          </button>
          <button onClick={() => { setPhase('mode-select'); setLevelUpMsg(null) }}
            className="px-5 py-3 bg-white text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            모드 선택
          </button>
        </div>
      </div>
    )
  }

  // ── Playing ───────────────────────────────────────────────
  if (phase === 'playing' && currentSentence) {
    const correctWords = tokenize(currentSentence.target_text)
    const langName     = LANGUAGE_NAMES[currentSentence.target_language]
    const actualAnswerCount = answerEntries.length

    return (
      <div className="max-w-lg mx-auto space-y-5">
        {levelUpMsg && (
          <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm font-medium">
            {levelUpMsg}
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Lv.<span className="font-bold text-slate-700">{profile.current_level}</span>
            {' '}·{' '}
            {mode === 'unsolved' ? '새 문제'
              : mode === 'wrong'   ? '오답 연습'
              : mode === 'correct' ? '복습'
              : mode === 'all'     ? '전체'
              : '스페이스드 복습'}
          </span>
          <span>{langName} · {correctWords.length}단어</span>
        </div>

        {/* key=currentSentence.id resets timer on every new sentence, fixing same-word-count drift bug */}
        <GameTimer
          key={currentSentence.id}
          seconds={timerSeconds}
          onExpire={handleTimerExpire}
          paused={timerPaused}
        />

        {settings.showTranslation && (
          <div className="bg-slate-100 rounded-xl px-4 py-3 text-slate-600 text-sm">
            <span className="text-xs text-slate-400 mr-2">{LANGUAGE_NAMES[profile.native_language]}:</span>
            {currentSentence.source_text}
          </div>
        )}

        {ready ? (
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <p className="text-slate-400 text-sm">준비되면 아래 버튼을 누르세요</p>
            <button
              onClick={handleStartTimer}
              className="px-10 py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl hover:bg-blue-700 transition-colors shadow-lg">
              ▶ 시작
            </button>
          </div>
        ) : (
          <>
            {/* Answer area: on top so the built sentence is always visible above the finger.
                min-height is pre-allocated from the source area measurement so source never shifts. */}
            <div
              style={{ minHeight: answerMinH }}
              className={`bg-white rounded-xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-start
                ${shake ? 'shake border-red-300' : 'border-slate-300'}`}
            >
              {answerEntries.length === 0 && (
                <span className="text-slate-300 text-sm self-center w-full text-center">
                  아래 단어를 순서대로 클릭하세요
                </span>
              )}
              {answerEntries.map((e, i) => (
                <WordCard key={i} word={e.word} onClick={() => handleAnswerClick(i)} variant="answer" index={i} />
              ))}
            </div>

            {/* Source area: below answer, measured with ref to drive answer min-height above.
                Used words become invisible but keep their slot so remaining words don't reflow. */}
            <div ref={sourceAreaRef} className="flex flex-wrap gap-2">
              {shuffledWords.map((word, i) => (
                <div key={i} className={usedIndices.has(i) ? 'invisible pointer-events-none' : ''}>
                  <WordCard word={word} onClick={() => handleWordClick(word, i)} variant="source" index={i} />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setAnswerEntries([]); setUsedIndices(new Set()) }}
                className="flex-1 py-2.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                초기화
              </button>
              <button
                onClick={() => actualAnswerCount > 0 && submitAnswer(answerEntries.map(e => e.word))}
                disabled={actualAnswerCount === 0}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
                제출
              </button>
            </div>
          </>
        )}
      </div>
    )
  }
}
