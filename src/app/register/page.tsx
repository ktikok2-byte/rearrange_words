'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LANGUAGE_NAMES } from '@/types'
import AdBanner from '@/components/AdBanner'

const LANGUAGES = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English (영어)' },
]

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    native_language: 'ko',
    study_language: 'en',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (form.password.length < 8) {
      setError('비밀번호는 최소 8자 이상이어야 합니다.')
      return
    }
    if (form.native_language === form.study_language) {
      setError('모국어와 학습 언어를 다르게 선택해주세요.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          username: form.username,
          native_language: form.native_language,
          study_language: form.study_language,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AdBanner />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-slate-900">
              <span className="text-blue-600">Word</span>Order
            </h1>
            <p className="text-slate-500 mt-2">새 계정을 만들어보세요</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">사용자 이름</label>
              <input name="username" type="text" value={form.username} onChange={handleChange} required
                placeholder="홍길동"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required
                placeholder="your@email.com"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 <span className="text-slate-400 font-normal">(8자 이상)</span></label>
              <input name="password" type="password" value={form.password} onChange={handleChange} required
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 확인</label>
              <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} required
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">나의 모국어</label>
                <select name="native_language" value={form.native_language} onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">학습 언어</label>
                <select name="study_language" value={form.study_language} onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-blue-600 font-medium hover:underline">로그인</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
