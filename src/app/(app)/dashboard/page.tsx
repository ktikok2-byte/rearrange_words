import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LANGUAGE_NAMES } from '@/types'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="text-2xl font-extrabold text-slate-800">{value}</div>
      <div className="text-sm font-medium text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // ── 전체 시도 기록 (unsolved 모드) ──────────────────────────────
  // 단일 소스(attempts 테이블)로 통일 → 전체/기간별 성과가 항상 일치
  const { data: allAttempts } = await supabase
    .from('attempts')
    .select('is_correct, completed_at')
    .eq('user_id', user.id)
    .eq('mode', 'unsolved')

  const totalSolved  = allAttempts?.length ?? 0
  const totalCorrect = allAttempts?.filter(a => a.is_correct).length ?? 0
  const totalWrong   = totalSolved - totalCorrect
  const accuracy     = totalSolved > 0 ? Math.round(totalCorrect / totalSolved * 100) : 0

  // ── 기간별 집계 (completed_at 기준, 클라이언트 UTC 자정과 맞추기 위해 ISO 기준으로) ──
  const now = new Date()
  // UTC 기준 오늘 자정 (서버와 DB 모두 UTC)
  const todayUTC      = now.toISOString().slice(0, 10) + 'T00:00:00.000Z'
  const weekAgo       = new Date(now); weekAgo.setUTCDate(now.getUTCDate() - 7)
  const tenWeeksAgo   = new Date(now); tenWeeksAgo.setUTCDate(now.getUTCDate() - 70)
  const yearAgo       = new Date(now); yearAgo.setUTCFullYear(now.getUTCFullYear() - 1)

  const slice = (since: string | Date) => {
    const iso = typeof since === 'string' ? since : since.toISOString()
    const sub = allAttempts?.filter(a => a.completed_at >= iso) ?? []
    return {
      total:   sub.length,
      correct: sub.filter(a => a.is_correct).length,
    }
  }

  const daily     = slice(todayUTC)
  const weekly    = slice(weekAgo)
  const tenWeekly = slice(tenWeeksAgo)
  const yearly    = slice(yearAgo)

  // ── 문제 현황 (attempts 기준 — 전체 성과·기간별 성과와 동일 소스) ──
  const correctCount = totalCorrect
  const wrongCount   = totalWrong

  // 고유 문장 수는 별도 표시용
  const { data: statusCounts } = await supabase
    .from('user_sentence_status')
    .select('status')
    .eq('user_id', user.id)
  const uniqueSolved = statusCounts?.length ?? 0

  // ── 레벨 범위 표시 (새 공식: level n → n+1 ~ n+3 단어) ──────────
  const lv      = profile?.current_level ?? 1
  const minWords = lv + 1
  const maxWords = lv + 3

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            안녕하세요, {profile?.username}님!
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            모국어: {LANGUAGE_NAMES[(profile?.native_language ?? 'ko') as keyof typeof LANGUAGE_NAMES]}
            {' · '}
            학습 언어: {LANGUAGE_NAMES[(profile?.study_language ?? 'en') as keyof typeof LANGUAGE_NAMES]}
          </p>
        </div>
        <Link
          href="/play"
          className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          게임 시작
        </Link>
      </div>

      {/* Level */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm opacity-80">현재 레벨</div>
            <div className="text-4xl font-extrabold">Lv.{lv}</div>
            <div className="text-sm opacity-80 mt-1">{minWords}~{maxWords}단어 문장</div>
          </div>
          <div className="text-right text-sm opacity-80 space-y-1">
            <div>연속 정답: <span className="font-bold text-white">{profile?.consecutive_correct}/2</span></div>
            <div>연속 오답: <span className="font-bold text-white">{profile?.consecutive_wrong}/2</span></div>
            <div>최고 연속: <span className="font-bold text-white">{profile?.longest_streak}</span></div>
          </div>
        </div>
        <div className="flex gap-2 text-xs opacity-70">
          <span>2연속 정답 → 레벨 업</span>
          <span>·</span>
          <span>2연속 오답 → 레벨 다운</span>
        </div>
      </div>

      {/* Overall Stats — attempts 테이블 기준, 기간별 성과와 동일 소스 */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">전체 성과</h3>
        <p className="text-xs text-slate-400 mb-3">안풀었던 문제 모드 · 전체 기간 · 중복 시도 포함</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="총 시도" value={totalSolved} />
          <StatCard label="정답" value={totalCorrect} />
          <StatCard label="오답" value={totalWrong} />
          <StatCard label="정답률" value={`${accuracy}%`} />
        </div>
      </div>

      {/* Period Stats */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">기간별 성과</h3>
        <p className="text-xs text-slate-400 mb-3">안풀었던 문제 모드 · 중복 시도 포함 · UTC 기준</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="오늘" value={daily.total}     sub={`정답 ${daily.correct}개`} />
          <StatCard label="1주일" value={weekly.total}    sub={`정답 ${weekly.correct}개`} />
          <StatCard label="10주" value={tenWeekly.total} sub={`정답 ${tenWeekly.correct}개`} />
          <StatCard label="1년" value={yearly.total}     sub={`정답 ${yearly.correct}개`} />
        </div>
      </div>

      {/* Sentence Status — attempts 기준(전체 성과와 동일) + 고유 문장 수 */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">문제 현황</h3>
        <p className="text-xs text-slate-400 mb-3">안풀었던 문제 모드 · 전체 기간 · 전체 성과와 동일 기준</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="정답 횟수" value={correctCount} />
          <StatCard label="오답 횟수" value={wrongCount} />
          <StatCard
            label="도전한 고유 문장"
            value={uniqueSolved}
            sub={`현재 스트릭 ${profile?.current_streak ?? 0}`}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/stats" className="px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg font-medium hover:bg-blue-100 transition-colors">
          상세 통계 보기
        </Link>
      </div>
    </div>
  )
}
