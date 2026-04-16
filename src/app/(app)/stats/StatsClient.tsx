'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts'

type Period = 'all' | 'year' | '10week' | 'week' | 'day'

interface Attempt {
  is_correct: boolean
  created_at: string
  time_taken_ms: number | null
  word_count: number
}

interface DayData {
  date: string
  total: number
  correct: number
  wrong: number
  accuracy: number
}

function groupByDay(attempts: Attempt[]): DayData[] {
  const map = new Map<string, { total: number; correct: number; wrong: number }>()
  for (const a of attempts) {
    const d = a.created_at.slice(0, 10)
    const cur = map.get(d) ?? { total: 0, correct: 0, wrong: 0 }
    cur.total++
    if (a.is_correct) cur.correct++; else cur.wrong++
    map.set(d, cur)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      ...v,
      accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
    }))
}

function filterByPeriod(attempts: Attempt[], period: Period): Attempt[] {
  const now = new Date()
  const since: Record<Period, Date> = {
    all: new Date(0),
    year: new Date(new Date().setFullYear(now.getFullYear() - 1)),
    '10week': new Date(new Date().setDate(now.getDate() - 70)),
    week: new Date(new Date().setDate(now.getDate() - 7)),
    day: (() => { const d = new Date(now); d.setHours(0,0,0,0); return d })(),
  }
  return attempts.filter(a => new Date(a.created_at) >= since[period])
}

const PERIOD_LABELS: Record<Period, string> = {
  all: '전체', year: '1년', '10week': '10주', week: '1주', day: '오늘'
}

export default function StatsClient({ attempts }: { attempts: Attempt[] }) {
  const [period, setPeriod] = useState<Period>('week')

  const filtered = useMemo(() => filterByPeriod(attempts, period), [attempts, period])
  const dayData = useMemo(() => groupByDay(filtered), [filtered])

  const total = filtered.length
  const correct = filtered.filter(a => a.is_correct).length
  const wrong = total - correct
  const accuracy = total ? Math.round((correct / total) * 100) : 0
  const avgTime = (() => {
    const times = filtered.filter(a => a.is_correct && a.time_taken_ms).map(a => a.time_taken_ms!)
    return times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 100) / 10 : 0
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">통계</h2>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '총 문제', value: total },
          { label: '정답', value: correct },
          { label: '오답', value: wrong },
          { label: '정답률', value: `${accuracy}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
            <div className="text-2xl font-extrabold text-slate-800">{value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {dayData.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          선택한 기간에 학습 데이터가 없습니다.
        </div>
      ) : (
        <>
          {/* Bar Chart - daily solved/correct */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-slate-700 mb-4">일별 풀이 현황</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dayData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, name: any) => [v, name === 'correct' ? '정답' : '오답']}
                />
                <Legend formatter={v => v === 'correct' ? '정답' : '오답'} />
                <Bar dataKey="correct" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="wrong" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Line Chart - accuracy trend */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-slate-700 mb-4">일별 정답률 추이</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dayData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [`${v}%`, '정답률']}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Extra stats */}
          {avgTime > 0 && (
            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
              평균 정답 소요 시간: <span className="font-bold">{avgTime}초</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
