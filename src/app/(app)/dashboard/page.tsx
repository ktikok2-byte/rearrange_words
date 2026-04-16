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

  // Count by time periods (unsolved mode only)
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7)
  const tenWeekStart = new Date(now); tenWeekStart.setDate(now.getDate() - 70)
  const yearStart = new Date(now); yearStart.setFullYear(now.getFullYear() - 1)

  const fetchStats = async (since: Date) => {
    const { data } = await supabase
      .from('attempts')
      .select('is_correct')
      .eq('user_id', user.id)
      .eq('mode', 'unsolved')
      .gte('created_at', since.toISOString())
    const total = data?.length ?? 0
    const correct = data?.filter(a => a.is_correct).length ?? 0
    return { total, correct }
  }

  const [daily, weekly, tenWeekly, yearly] = await Promise.all([
    fetchStats(todayStart),
    fetchStats(weekStart),
    fetchStats(tenWeekStart),
    fetchStats(yearStart),
  ])

  const { data: statusCounts } = await supabase
    .from('user_sentence_status')
    .select('status')
    .eq('user_id', user.id)

  const correctCount = statusCounts?.filter(s => s.status === 'correct').length ?? 0
  const wrongCount = statusCounts?.filter(s => s.status === 'wrong').length ?? 0

  const accuracy = profile?.total_solved
    ? Math.round((profile.total_correct / profile.total_solved) * 100)
    : 0

  const [minWords, maxWords] = [(profile?.current_level - 1) * 3 + 1, profile?.current_level * 3]

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
            <div className="text-4xl font-extrabold">Lv.{profile?.current_level}</div>
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

      {/* Overall Stats */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-3">전체 성과</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="총 푼 문제" value={profile?.total_solved ?? 0} />
          <StatCard label="총 정답" value={profile?.total_correct ?? 0} />
          <StatCard label="총 오답" value={profile?.total_wrong ?? 0} />
          <StatCard label="전체 정답률" value={`${accuracy}%`} />
        </div>
      </div>

      {/* Period Stats */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-3">기간별 성과 <span className="text-sm font-normal text-slate-400">(안풀었던 문제 기준)</span></h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="오늘 푼 문제" value={daily.total} sub={`정답 ${daily.correct}개`} />
          <StatCard label="1주일" value={weekly.total} sub={`정답 ${weekly.correct}개`} />
          <StatCard label="10주" value={tenWeekly.total} sub={`정답 ${tenWeekly.correct}개`} />
          <StatCard label="1년" value={yearly.total} sub={`정답 ${yearly.correct}개`} />
        </div>
      </div>

      {/* Sentence Status */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-3">문제 현황</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="맞은 문제" value={correctCount} />
          <StatCard label="틀린 문제" value={wrongCount} />
          <StatCard label="현재 스트릭" value={`${profile?.current_streak ?? 0}일`} />
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
