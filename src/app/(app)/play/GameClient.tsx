'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GameMode, Profile, Sentence, LANGUAGE_NAMES } from '@/types'
import {
  shuffleArray, tokenize, calcTimerSeconds, checkAnswer,
  filterSentencesByMode, calcNewProfile, nextSentenceStatus
} from '@/lib/game'
import GameTimer from '@/components/GameTimer'
import WordCard from '@/components/WordCard'

type Phase = 'mode-select' | 'playing' | 'result' | 'refilling' | 'all-done'

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

  const [shake, setShake] = useState(false)
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null)

  // Load sentences + user statuses once
  useEffect(() => {
    async function load() {
      const { data: sents } = await supabase.from('sentences').select('*').order('id')
      setSentences(sents ?? [])
      const { data: statuses } = await supabase
        .from('user_sentence_status').select('sentence_id, status').eq('user_id', userId)
      const map: Record<number, string> = {}
      statuses?.forEach(s => { map[s.sentence_id] = s.status })
      setUserStatuses(map)
    }
    load()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // unsolved 모드에서 현재 레벨부터 위로 탐색, 없으면 null 반환
  const findNextSentenceAndLevel = useCallback((
    allSentences: Sentence[],
    statuses: Record<number, string>,
    startLevel: number
  ): { sentence: Sentence; level: number } | null => {
    const maxLevel = allSentences.reduce((m, s) => Math.max(m, s.difficulty_level), 0)

    for (let lvl = startLevel; lvl <= maxLevel; lvl++) {
      const pool = filterSentencesByMode(allSentences, statuses, 'unsolved', lvl)
      if (pool.length > 0) {
        return { sentence: pool[Math.floor(Math.random() * pool.length)], level: lvl }
      }
    }
    return null
  }, [])

  const pickNextSentence = useCallback((
    allSentences: Sentence[],
    statuses: Record<number, string>,
    currentMode: GameMode,
    currentLevel: number
  ): Sentence | null => {
    const pool = filterSentencesByMode(allSentences, statuses, currentMode, currentLevel)
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }, [])

  // 레벨 소진 → API 호출로 문장 자동 추가
  const triggerRefill = useCallback(async (level: number): Promise<boolean> => {
    try {
      const res = await fetch('/api/refill-sentences', {
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

  const startGame = useCallback(async (selectedMode: GameMode) => {
    setMode(selectedMode)
    setLevelUpMsg(null)

    if (selectedMode === 'unsolved') {
      const result = findNextSentenceAndLevel(sentences, userStatuses, profile.current_level)

      if (!result) {
        // 전체 소진 → 자동 추가 시도
        setPhase('refilling')
        const added = await triggerRefill(profile.current_level)

        if (added) {
          // 새 문장 로드 후 재시도
          const { data: sents } = await supabase.from('sentences').select('*').order('id')
          const newSents = sents ?? []
          setSentences(newSents)
          const result2 = findNextSentenceAndLevel(newSents, userStatuses, profile.current_level)
          if (result2) {
            launchSentence(result2.sentence, result2.level, selectedMode)
            return
          }
        }

        setPhase('all-done')
        return
      }

      // 레벨이 자동으로 올라간 경우 안내
      if (result.level > profile.current_level) {
        setLevelUpMsg(`Lv.${profile.current_level} 문장을 모두 풀었어요! Lv.${result.level}로 이동합니다.`)
        // 레벨 소진 감지 → 자동 추가 트리거 (백그라운드)
        triggerRefill(profile.current_level)
        // DB 레벨 업데이트
        const newProfileData = { current_level: result.level, consecutive_correct: 0, consecutive_wrong: 0 }
        await supabase.from('profiles').update(newProfileData).eq('id', userId)
        setProfile(prev => ({ ...prev, ...newProfileData }))
      }

      launchSentence(result.sentence, result.level, selectedMode)
    } else {
      const sentence = pickNextSentence(sentences, userStatuses, selectedMode, profile.current_level)
      if (!sentence) {
        setPhase('mode-select')
        return
      }
      launchSentence(sentence, profile.current_level, selectedMode)
    }
  }, [sentences, userStatuses, profile, userId, findNextSentenceAndLevel, pickNextSentence, triggerRefill, supabase])

  const [ready, setReady] = useState(false)

  const launchSentence = (sentence: Sentence, level: number, selectedMode: GameMode) => {
    const words = tokenize(sentence.target_text)
    const shuffled = shuffleArray(words)
    setCurrentSentence(sentence)
    setShuffledWords(shuffled)
    setAnswerWords([])
    setUsedIndices(new Set())
    setTimerSeconds(calcTimerSeconds(words.length))
    setTimerPaused(true)  // wait for start button
    setReady(true)
    setStartTime(null)
    setLastResult(null)
    setPhase('playing')
  }

  const handleStartTimer = () => {
    setReady(false)
    setTimerPaused(false)
    setStartTime(new Date())
  }

  const handleWordClick = (word: string, index: number) => {
    if (usedIndices.has(index)) return
    const newUsed = new Set(usedIndices)
    newUsed.add(index)
    setUsedIndices(newUsed)
    const newAnswer = [...answerWords, word]
    setAnswerWords(newAnswer)
    if (newAnswer.length === shuffledWords.length) submitAnswer(newAnswer)
  }

  const handleAnswerClick = (idx: number) => {
    const word = answerWords[idx]
    const newAnswer = answerWords.filter((_, i) => i !== idx)
    setAnswerWords(newAnswer)
    const newUsed = new Set(usedIndices)
    for (const i of Array.from(newUsed)) {
      if (shuffledWords[i] === word) { newUsed.delete(i); break }
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

    if (!isCorrect) { setShake(true); setTimeout(() => setShake(false), 500) }

    const newProfileData = mode === 'unsolved' ? calcNewProfile(profile, isCorrect) : {}

    // attempts 테이블 제거 — user_sentence_status 단일 소스로 통합
    const newStatus = nextSentenceStatus(userStatuses[currentSentence.id] ?? 'unsolved', mode, isCorrect)
    const { data: existing } = await supabase
      .from('user_sentence_status').select('id, attempt_count, solved_at')
      .eq('user_id', userId).eq('sentence_id', currentSentence.id).single()

    // unsolved 모드에서 첫 풀이: solved_at, unsolved_correct 고정 기록
    const unsolvedFields = (mode === 'unsolved' && !existing?.solved_at)
      ? { solved_at: now.toISOString(), unsolved_correct: isCorrect }
      : {}

    if (existing) {
      await supabase.from('user_sentence_status').update({
        status: newStatus,
        last_attempted_at: now.toISOString(),
        attempt_count: existing.attempt_count + 1,
        ...unsolvedFields,
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_sentence_status').insert({
        user_id: userId,
        sentence_id: currentSentence.id,
        status: newStatus,
        last_attempted_at: now.toISOString(),
        attempt_count: 1,
        ...unsolvedFields,
      })
    }

    setUserStatuses(prev => ({ ...prev, [currentSentence.id]: newStatus }))

    if (mode === 'unsolved' && Object.keys(newProfileData).length > 0) {
      await supabase.from('profiles').update(newProfileData).eq('id', userId)
      setProfile(prev => ({ ...prev, ...newProfileData }))
    }

    setLastResult({
      isCorrect, timeTakenMs,
      correctAnswer: currentSentence.target_text,
      nativeTranslation: currentSentence.source_text,
    })
    setPhase('result')
  }, [currentSentence, startTime, mode, profile, userId, userStatuses, supabase])

  const handleTimerExpire = useCallback(() => {
    submitAnswer(answerWords)
  }, [answerWords, submitAnswer])

  // ===== RENDER =====

  // 문장 자동 추가 중
  if (phase === 'refilling') {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <div className="text-4xl animate-spin inline-block">⚙️</div>
        <p className="text-slate-700 font-semibold">모든 문장을 풀었어요!</p>
        <p className="text-slate-400 text-sm">새 문장을 자동으로 추가하는 중입니다...</p>
      </div>
    )
  }

  // 완전 소진
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
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            다른 모드로 계속하기
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-white text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'mode-select') {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">게임 모드 선택</h2>
        <p className="text-slate-500 text-sm mb-6">
          현재 레벨: <span className="font-bold text-blue-600">Lv.{profile.current_level}</span>
          {' '}({profile.current_level + 1}~{profile.current_level + 3}단어)
        </p>

        <div className="space-y-3">
          {([
            { mode: 'unsolved' as GameMode, label: '안 풀었던 문제', desc: '새로운 문제를 풀어요. 레벨 시스템이 적용됩니다.', color: 'blue' },
            { mode: 'wrong' as GameMode, label: '틀린 문제 다시 풀기', desc: '이전에 틀렸던 문제를 다시 연습해요.', color: 'red' },
            { mode: 'correct' as GameMode, label: '맞은 문제 복습', desc: '이미 맞춘 문제를 복습해요.', color: 'green' },
            { mode: 'all' as GameMode, label: '전체 문제 풀기', desc: '모든 문제를 랜덤으로 풀어요.', color: 'slate' },
          ] as const).map(({ mode: m, label, desc, color }) => (
            <button key={m} onClick={() => startGame(m)}
              disabled={sentences.length === 0}
              className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all bg-white disabled:opacity-50
                ${color === 'blue' ? 'border-blue-200 hover:border-blue-500 hover:bg-blue-50' : ''}
                ${color === 'red' ? 'border-red-200 hover:border-red-500 hover:bg-red-50' : ''}
                ${color === 'green' ? 'border-green-200 hover:border-green-500 hover:bg-green-50' : ''}
                ${color === 'slate' ? 'border-slate-200 hover:border-slate-400 hover:bg-slate-50' : ''}`}
            >
              <div className="font-semibold text-slate-800">{label}</div>
              <div className="text-sm text-slate-500 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>

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

  // Playing phase
  if (phase === 'playing' && currentSentence) {
    const correctWords = tokenize(currentSentence.target_text)
    const langName = LANGUAGE_NAMES[currentSentence.target_language]

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
            {' '}·{' '}{mode === 'unsolved' ? '새 문제' : mode === 'wrong' ? '오답 연습' : mode === 'correct' ? '복습' : '전체'}
          </span>
          <span>{langName} · {correctWords.length}단어</span>
        </div>

        <GameTimer seconds={timerSeconds} onExpire={handleTimerExpire} paused={timerPaused} />

        <div className="bg-slate-100 rounded-xl px-4 py-3 text-slate-600 text-sm">
          <span className="text-xs text-slate-400 mr-2">{LANGUAGE_NAMES[profile.native_language]}:</span>
          {currentSentence.source_text}
        </div>

        {ready ? (
          /* 시작 전: 단어 가리고 시작 버튼 표시 */
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

            <div className="flex flex-wrap gap-2">
              {shuffledWords.map((word, i) =>
                !usedIndices.has(i) && (
                  <WordCard key={i} word={word} onClick={() => handleWordClick(word, i)} variant="source" index={i} />
                )
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setAnswerWords([]); setUsedIndices(new Set()) }}
                className="flex-1 py-2.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                초기화
              </button>
              <button onClick={() => answerWords.length > 0 && submitAnswer(answerWords)}
                disabled={answerWords.length === 0}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
                제출
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return <div className="text-center text-slate-400 py-20">로딩 중...</div>
}
