'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GameMode, Profile, Sentence, LANGUAGE_NAMES } from '@/types'
import {
  shuffleArray, tokenize, calcTimerSeconds, checkAnswer,
  filterSentencesByMode, calcNewProfile, nextSentenceStatus
} from '@/lib/game'
import GameTimer from '@/components/GameTimer'
import WordCard from '@/components/WordCard'

type Phase = 'mode-select' | 'playing' | 'result'

interface Props {
  userId: string
  initialProfile: Profile
}

export default function GameClient({ userId, initialProfile }: Props) {
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [mode, setMode] = useState<GameMode>('unsolved')
  const [phase, setPhase] = useState<Phase>('mode-select')

  const [sentences, setSentences] = useState<Sentence[]>([])
  const [userStatuses, setUserStatuses] = useState<Record<number, string>>({})
  const [currentSentence, setCurrentSentence] = useState<Sentence | null>(null)
  const [shuffledWords, setShuffledWords] = useState<string[]>([])
  const [answerWords, setAnswerWords] = useState<string[]>([])
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set())

  const [timerSeconds, setTimerSeconds] = useState(3)
  const [timerPaused, setTimerPaused] = useState(false)
  const [startTime, setStartTime] = useState<Date | null>(null)

  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean
    timeTakenMs: number | null
    correctAnswer: string
    nativeTranslation: string
  } | null>(null)

  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [noSentences, setNoSentences] = useState(false)

  // Load sentences + user statuses once
  useEffect(() => {
    async function load() {
      const { data: sents } = await supabase
        .from('sentences')
        .select('*')
        .order('id')
      setSentences(sents ?? [])

      const { data: statuses } = await supabase
        .from('user_sentence_status')
        .select('sentence_id, status')
        .eq('user_id', userId)
      const map: Record<number, string> = {}
      statuses?.forEach(s => { map[s.sentence_id] = s.status })
      setUserStatuses(map)
    }
    load()
  }, [userId, supabase])

  const pickNextSentence = useCallback((
    allSentences: Sentence[],
    statuses: Record<number, string>,
    currentMode: GameMode,
    currentLevel: number
  ) => {
    const pool = filterSentencesByMode(allSentences, statuses, currentMode, currentLevel)
    if (pool.length === 0) return null
    const idx = Math.floor(Math.random() * pool.length)
    return pool[idx]
  }, [])

  const startGame = useCallback(async (selectedMode: GameMode) => {
    setMode(selectedMode)
    const sentence = pickNextSentence(sentences, userStatuses, selectedMode, profile.current_level)
    if (!sentence) {
      setNoSentences(true)
      return
    }

    const words = tokenize(sentence.target_text)
    const shuffled = shuffleArray(words)

    setCurrentSentence(sentence)
    setShuffledWords(shuffled)
    setAnswerWords([])
    setUsedIndices(new Set())
    setTimerSeconds(calcTimerSeconds(words.length))
    setTimerPaused(false)
    setStartTime(new Date())
    setLastResult(null)
    setNoSentences(false)
    setPhase('playing')
  }, [sentences, userStatuses, profile.current_level, pickNextSentence])

  const handleWordClick = (word: string, index: number) => {
    if (usedIndices.has(index)) return
    const newUsed = new Set(usedIndices)
    newUsed.add(index)
    setUsedIndices(newUsed)
    const newAnswer = [...answerWords, word]
    setAnswerWords(newAnswer)

    // Auto-submit when all words are placed
    if (newAnswer.length === shuffledWords.length) {
      submitAnswer(newAnswer)
    }
  }

  const handleAnswerClick = (idx: number) => {
    // Remove from answer, restore to source
    const word = answerWords[idx]
    const newAnswer = answerWords.filter((_, i) => i !== idx)
    setAnswerWords(newAnswer)

    // Find the original index in shuffledWords
    const sourceIdx = shuffledWords.findIndex((w, i) =>
      w === word && usedIndices.has(i) && !newAnswer.includes(w) ||
      (w === word && usedIndices.has(i))
    )
    // Simply remove one matching used index for this word
    const newUsed = new Set(usedIndices)
    for (const idx2 of Array.from(newUsed)) {
      if (shuffledWords[idx2] === word) {
        newUsed.delete(idx2)
        break
      }
    }
    setUsedIndices(newUsed)
  }

  const submitAnswer = useCallback(async (answer: string[]) => {
    if (!currentSentence || !startTime) return
    setTimerPaused(true)

    const correctWords = tokenize(currentSentence.target_text)
    const isCorrect = checkAnswer(answer, correctWords)
    const now = new Date()
    const timeTakenMs = isCorrect ? now.getTime() - startTime.getTime() : null

    if (!isCorrect) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }

    // Save attempt
    const newProfileData = mode === 'unsolved' ? calcNewProfile(profile, isCorrect) : {}
    const levelAtAttempt = profile.current_level

    await supabase.from('attempts').insert({
      user_id: userId,
      sentence_id: currentSentence.id,
      mode,
      is_correct: isCorrect,
      time_taken_ms: timeTakenMs,
      word_count: correctWords.length,
      level_at_attempt: levelAtAttempt,
      started_at: startTime.toISOString(),
      completed_at: now.toISOString(),
    })

    // Update sentence status
    const currentStatus = userStatuses[currentSentence.id] ?? 'unsolved'
    const newStatus = nextSentenceStatus(currentStatus, mode, isCorrect)
    const { data: existing } = await supabase
      .from('user_sentence_status')
      .select('id, attempt_count')
      .eq('user_id', userId)
      .eq('sentence_id', currentSentence.id)
      .single()

    if (existing) {
      await supabase.from('user_sentence_status').update({
        status: newStatus,
        last_attempted_at: now.toISOString(),
        attempt_count: existing.attempt_count + 1,
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_sentence_status').insert({
        user_id: userId,
        sentence_id: currentSentence.id,
        status: newStatus,
        last_attempted_at: now.toISOString(),
        attempt_count: 1,
      })
    }

    // Update local statuses
    setUserStatuses(prev => ({ ...prev, [currentSentence.id]: newStatus }))

    // Update profile (only in unsolved mode)
    if (mode === 'unsolved' && Object.keys(newProfileData).length > 0) {
      await supabase.from('profiles').update(newProfileData).eq('id', userId)
      setProfile(prev => ({ ...prev, ...newProfileData }))
    }

    setLastResult({
      isCorrect,
      timeTakenMs,
      correctAnswer: currentSentence.target_text,
      nativeTranslation: currentSentence.source_text,
    })
    setPhase('result')
  }, [currentSentence, startTime, mode, profile, userId, userStatuses, supabase])

  const handleTimerExpire = useCallback(() => {
    if (answerWords.length > 0 || !currentSentence) {
      submitAnswer(answerWords)
    } else {
      // Directly mark as wrong with empty answer
      submitAnswer([])
    }
  }, [answerWords, currentSentence, submitAnswer])

  const handleNext = () => {
    startGame(mode)
  }

  // ===== RENDER =====

  if (phase === 'mode-select') {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">게임 모드 선택</h2>
        <p className="text-slate-500 text-sm mb-6">
          현재 레벨: <span className="font-bold text-blue-600">Lv.{profile.current_level}</span>
          {' '}({(profile.current_level - 1) * 3 + 1}~{profile.current_level * 3}단어)
        </p>

        <div className="space-y-3">
          {([
            { mode: 'unsolved' as GameMode, label: '안 풀었던 문제', desc: '새로운 문제를 풀어요. 레벨 시스템이 적용됩니다.', color: 'blue' },
            { mode: 'wrong' as GameMode, label: '틀린 문제 다시 풀기', desc: '이전에 틀렸던 문제를 다시 연습해요.', color: 'red' },
            { mode: 'correct' as GameMode, label: '맞은 문제 복습', desc: '이미 맞춘 문제를 복습해요.', color: 'green' },
            { mode: 'all' as GameMode, label: '전체 문제 풀기', desc: '모든 문제를 랜덤으로 풀어요.', color: 'slate' },
          ] as const).map(({ mode: m, label, desc, color }) => (
            <button
              key={m}
              onClick={() => startGame(m)}
              disabled={sentences.length === 0}
              className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all
                ${color === 'blue' ? 'border-blue-200 hover:border-blue-500 hover:bg-blue-50' : ''}
                ${color === 'red' ? 'border-red-200 hover:border-red-500 hover:bg-red-50' : ''}
                ${color === 'green' ? 'border-green-200 hover:border-green-500 hover:bg-green-50' : ''}
                ${color === 'slate' ? 'border-slate-200 hover:border-slate-400 hover:bg-slate-50' : ''}
                bg-white disabled:opacity-50`}
            >
              <div className="font-semibold text-slate-800">{label}</div>
              <div className="text-sm text-slate-500 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>

        {noSentences && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
            현재 모드와 레벨에 해당하는 문제가 없습니다. 다른 모드를 선택해보세요.
          </div>
        )}

        {sentences.length === 0 && (
          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm">
            데이터를 불러오는 중...
          </div>
        )}
      </div>
    )
  }

  if (phase === 'result' && lastResult) {
    return (
      <div className={`max-w-lg mx-auto bounce-in`}>
        <div className={`rounded-2xl border-2 p-6 mb-6 ${
          lastResult.isCorrect
            ? 'bg-green-50 border-green-400'
            : 'bg-red-50 border-red-400'
        }`}>
          <div className="text-3xl mb-2">{lastResult.isCorrect ? '✅' : '❌'}</div>
          <div className={`text-xl font-bold mb-1 ${lastResult.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            {lastResult.isCorrect ? '정답!' : '오답'}
          </div>
          {lastResult.isCorrect && lastResult.timeTakenMs && (
            <div className="text-sm text-green-600 mb-3">
              {(lastResult.timeTakenMs / 1000).toFixed(2)}초 만에 맞췄어요!
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
            {' · '}
            <span>연속 정답: {profile.consecutive_correct}/2</span>
            {' · '}
            <span>연속 오답: {profile.consecutive_wrong}/2</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleNext}
            className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            다음 문제
          </button>
          <button
            onClick={() => setPhase('mode-select')}
            className="px-5 py-3 bg-white text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            모드 선택
          </button>
        </div>
      </div>
    )
  }

  // Playing phase
  if (phase === 'playing' && currentSentence) {
    const correctWords = tokenize(currentSentence.target_text)
    const langName = LANGUAGE_NAMES[currentSentence.target_language]

    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Lv.<span className="font-bold text-slate-700">{profile.current_level}</span>
            {' '}·{' '}{mode === 'unsolved' ? '새 문제' : mode === 'wrong' ? '오답 연습' : mode === 'correct' ? '복습' : '전체'}
          </span>
          <span>{langName} · {correctWords.length}단어</span>
        </div>

        <GameTimer
          seconds={timerSeconds}
          onExpire={handleTimerExpire}
          paused={timerPaused}
        />

        {/* Hint: native sentence */}
        <div className="bg-slate-100 rounded-xl px-4 py-3 text-slate-600 text-sm">
          <span className="text-xs text-slate-400 mr-2">{LANGUAGE_NAMES[profile.native_language]}:</span>
          {currentSentence.source_text}
        </div>

        {/* Answer area */}
        <div className={`min-h-14 bg-white rounded-xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-start
          ${shake ? 'shake border-red-300' : 'border-slate-300'}`}>
          {answerWords.length === 0 && (
            <span className="text-slate-300 text-sm self-center w-full text-center">
              아래 단어를 순서대로 클릭하세요
            </span>
          )}
          {answerWords.map((word, i) => (
            <WordCard key={i} word={word} onClick={() => handleAnswerClick(i)} variant="answer" index={i} />
          ))}
        </div>

        {/* Source words */}
        <div className="flex flex-wrap gap-2">
          {shuffledWords.map((word, i) => (
            !usedIndices.has(i) && (
              <WordCard key={i} word={word} onClick={() => handleWordClick(word, i)} variant="source" index={i} />
            )
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setAnswerWords([])
              setUsedIndices(new Set())
            }}
            className="flex-1 py-2.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            초기화
          </button>
          <button
            onClick={() => answerWords.length > 0 && submitAnswer(answerWords)}
            disabled={answerWords.length === 0}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            제출
          </button>
        </div>
      </div>
    )
  }

  return <div className="text-center text-slate-400 py-20">로딩 중...</div>
}
