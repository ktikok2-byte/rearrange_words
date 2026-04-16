import Link from 'next/link'
import AdBanner from '@/components/AdBanner'

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AdBanner />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4">
          <span className="text-blue-600">Word</span>Order
        </h1>
        <p className="text-lg text-slate-600 mb-2 max-w-md">
          단어를 올바른 순서로 배열해서 외국어 실력을 키워보세요.
        </p>
        <p className="text-sm text-slate-400 mb-10">
          스마트폰, 컴퓨터 어디서든 온라인으로 학습 가능
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/register"
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl shadow hover:bg-blue-700 transition-colors"
          >
            시작하기
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 bg-white text-blue-600 font-semibold rounded-xl border-2 border-blue-600 hover:bg-blue-50 transition-colors"
          >
            로그인
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl text-left">
          {[
            { icon: '⏱️', title: '빠른 타이머', desc: '단어 개수만큼 초가 주어져요. 집중력을 길러보세요.' },
            { icon: '📈', title: '레벨 시스템', desc: '2연속 정답이면 레벨 업! 점점 어려운 문장에 도전.' },
            { icon: '📊', title: '상세 통계', desc: '일별 / 주별 / 연도별 정답률 그래프로 성장을 확인.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="text-3xl mb-2">{icon}</div>
              <h3 className="font-bold text-slate-800 mb-1">{title}</h3>
              <p className="text-sm text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
