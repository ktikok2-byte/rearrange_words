'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AdBanner from '@/components/AdBanner'
import GameTimer from '@/components/GameTimer'
import WordCard from '@/components/WordCard'
import { Sentence } from '@/types'
import { shuffleArray, tokenize, calcTimerSeconds, checkAnswer } from '@/lib/game'

const SESSION_KEY = 'guestPlayedIds'

type Phase = 'loading' | 'playing' | 'result' | 'done'

export default function GuestPage() {
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [playedIds, setPlayedIds] = useState<Set<number>>(new Set())
  const [phase, setPhase] = useState<Phase>('loading')

  const [currentSentence, setCurrentSentence] = useState<Sentence | null>(null)
  const [shuffledWords, setShuffledWords] = useState<string[]>([])
  const [answerWords, setAnswerWords] = useState<string[]>([])
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set())
  const [timerSeconds, setTimerSeconds] = useState(3)
  const [timerPaused, setTimerPaused] = useState(false)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [shake, setShake] = useState(false)

  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean
    correctAnswer: string
    nativeTranslation: string
  } | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    const ids: number[] = stored ? JSON.parse(stored) : []
    const loaded = new Set<number>(ids)
    setPlayedIds(loaded)

    fetch('/api/public/sentences')
      .then(r => r.json())
      .then(data => {
        const sents: Sentence[] = data.sentences ?? []
        setSentences(sents)
        const next = pickRandom(sents, loaded)
        if (next) launchSentence(next)
        else setPhase('done')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pickRandom = (allSents: Sentence[], played: Set<number>): Sentence | null => {
    const pool = allSents.filter(s => !played.has(s.id))
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const [ready, setReady] = useState(false)

  const launchSentence = (sentence: Sentence) => {
    const words = tokenize(sentence.target_text)
    setCurrentSentence(sentence)
    setShuffledWords(shuffleArray(words))
    setAnswerWords([])
    setUsedIndices(new Set())
    setTimerSeconds(calcTimerSeconds(words.length))
    setTimerPaused(true)
    setReady(true)
    setStartTime(null)
    setPhase('playing')
  }

  const handleStartTimer = () => {
    setReady(false)
    setTimerPaused(false)
    setStartTime(new Date())
  }

  const submitAnswer = useCallback((answer: string[]) => {
    if (!currentSentence) return
    setTimerPaused(true)

    const correctWords = tokenize(currentSentence.target_text)
    const isCorrect = checkAnswer(answer, correctWords)

    if (!isCorrect) { setShake(true); setTimeout(() => setShake(false), 500) }

    const newPlayedIds = new Set([...playedIds, currentSentence.id])
    setPlayedIds(newPlayedIds)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...newPlayedIds]))

    setScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }))

    setLastResult({
      isCorrect,
      correctAnswer: currentSentence.target_text,
      nativeTranslation: currentSentence.source_text,
    })
    setPhase('result')
  }, [currentSentence, startTime, playedIds])

  const handleNext = useCallback(() => {
    const next = pickRandom(sentences, playedIds)
    if (next) launchSentence(next)
    else setPhase('done')
  }, [sentences, playedIds]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleTimerExpire = useCallback(() => {
    submitAnswer(answerWords)
  }, [answerWords, submitAnswer])

  const handleReset = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setPlayedIds(new Set())
    const next = pickRandom(sentences, new Set())
    if (next) launchSentence(next)
  }

  const warningBanner = (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm mb-4 flex items-start gap-2">
      <span className="text-base mt-0.5">⚠️</span>
      <div>
        <span className="font-medium">게스트 모드</span>
        {' — '}브라우저를 닫으면 학습 기록이 모두 초기화됩니다.
        {' '}
        <Link href="/register" className="underline font-medium hover:text-amber-900">
          회원가입
        </Link>
        {' '}하면 기록이 저장돼요.
      </div>
    </div>
  )

  if (phase === 'loading') {
    return (
      <div className="flex flex-col min-h-screen">
        <AdBanner />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-slate-400">문장 불러오는 중...</p>
        </main>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col min-h-screen">
        <AdBanner />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-md w-full text-center space-y-5">
            <div className="text-6xl">🎉</div>
            <h2 className="text-2xl font-bold">모든 문장을 풀었어요!</h2>
            <p className="text-slate-500">
              총 {score.total}문제 중 {score.correct}개 정답 ({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%)
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={handleReset}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                처음부터 다시 하기
              </button>
              <Link href="/register"
                className="w-full py-3 bg-white text-blue-600 font-semibold rounded-xl border-2 border-blue-600 hover:bg-blue-50 transition-colors block">
                회원가입하고 기록 저장하기
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'result' && lastResult) {
    return (
      <div className="flex flex-col min-h-screen">
        <AdBanner />
        <main className="flex-1 px-4 py-8">
          <div className="max-w-lg mx-auto bounce-in">
            {warningBanner}

            <div className={`rounded-2xl border-2 p-6 mb-5 ${
              lastResult.isCorrect ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'
            }`}>
              <div className="text-3xl mb-2">{lastResult.isCorrect ? '✅' : '❌'}</div>
              <div className={`text-xl font-bold mb-3 ${lastResult.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {lastResult.isCorrect ? '정답!' : '오답'}
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-100 space-y-2">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-medium">정답 문장</span>
                  <p className="text-slate-800 font-medium mt-0.5">{lastResult.correctAnswer}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-medium">한국어</span>
                  <p className="text-slate-600 mt-0.5">{lastResult.nativeTranslation}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-100 mb-5 text-sm text-slate-600">
              점수: <span className="font-bold text-blue-600">{score.correct}</span> / {score.total}
              {' '}({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%)
            </div>

            <div className="flex gap-3">
              <button onClick={handleNext}
                className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                다음 문제
              </button>
              <Link href="/login"
                className="px-5 py-3 bg-white font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700">
                로그인
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'playing' && currentSentence) {
    const correctWords = tokenize(currentSentence.target_text)

    return (
      <div className="flex flex-col min-h-screen">
        <AdBanner />
        <main className="flex-1 px-4 py-8">
          <div className="max-w-lg mx-auto space-y-4">
            {warningBanner}

            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>게스트 모드</span>
              <span>영어 · {correctWords.length}단어</span>
            </div>

            <GameTimer seconds={timerSeconds} onExpire={handleTimerExpire} paused={timerPaused} />

            <div className="bg-slate-100 rounded-xl px-4 py-3 text-slate-600 text-sm">
              <span className="text-xs text-slate-400 mr-2">한국어:</span>
              {currentSentence.source_text}
            </div>

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
        </main>
      </div>
    )
  }

  return null
}
