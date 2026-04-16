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

  // ── 고유 문장 수 (user_sentence_status 기준) ──────────────────────
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
            <div>레벨업까지: <span className="font-bold text-white">{profile?.consecutive_correct}/2 정답</span></div>
            <div>레벨다운까지: <span className="font-bold text-white">{profile?.consecutive_wrong}/2 오답</span></div>
          </div>
        </div>
        <div className="flex gap-2 text-xs opacity-70">
          <span>2연속 정답 → 레벨 업</span>
          <span>·</span>
          <span>2연속 오답 → 레벨 다운</span>
        </div>
      </div>

      {/* 전체 성과 + 문제 현황 통합 (안풀었던 문제 모드 기준) */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-3">전체 성과 <span className="text-sm font-normal text-slate-400">안풀었던 문제 모드 · 전체 기간</span></h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="도전한 고유 문장" value={uniqueSolved} />
          <StatCard label="총 시도 횟수" value={totalSolved} sub={uniqueSolved !== totalSolved ? `고유 문장보다 ${totalSolved - uniqueSolved}회 더 많음` : undefined} />
          <StatCard label="정답률" value={`${accuracy}%`} sub={`정답 ${totalCorrect} / 오답 ${totalWrong}`} />
          <StatCard label="현재 스트릭" value={`${profile?.current_streak ?? 0}연속`} sub="오답 시 초기화" />
          <StatCard label="최고 스트릭" value={`${profile?.longest_streak ?? 0}연속`} sub="역대 최고 연속 정답" />
        </div>
      </div>

      {/* 기간별 성과 */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-3">기간별 성과 <span className="text-sm font-normal text-slate-400">안풀었던 문제 모드</span></h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="오늘"  value={daily.total}     sub={`정답 ${daily.correct} / 오답 ${daily.total - daily.correct}`} />
          <StatCard label="1주일" value={weekly.total}    sub={`정답 ${weekly.correct} / 오답 ${weekly.total - weekly.correct}`} />
          <StatCard label="10주"  value={tenWeekly.total} sub={`정답 ${tenWeekly.correct} / 오답 ${tenWeekly.total - tenWeekly.correct}`} />
          <StatCard label="1년"   value={yearly.total}    sub={`정답 ${yearly.correct} / 오답 ${yearly.total - yearly.correct}`} />
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
