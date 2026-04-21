'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSettings } from '@/hooks/useSettings'

interface Props {
  onClose: () => void
}

type Tab = 'settings' | 'contact'

function Toggle({
  label, description, checked, onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium text-slate-800 text-sm">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors
          ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
            ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}

export default function SettingsModal({ onClose }: Props) {
  const { settings, updateSetting } = useSettings()
  const [tab, setTab] = useState<Tab>('settings')
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // contact form state
  const [senderEmail, setSenderEmail] = useState('')
  const [message, setMessage]         = useState('')
  const [sending, setSending]         = useState(false)
  const [sent, setSent]               = useState(false)
  const [sendError, setSendError]     = useState('')

  const handleSend = async () => {
    if (!message.trim()) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email: senderEmail }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '전송 실패')
      setSent(true)
      setMessage('')
      setSenderEmail('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-800">
            {tab === 'settings' ? '설정' : '문의하기'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ✕
          </button>
        </div>

        {/* tab bar */}
        <div className="flex gap-1 mx-5 mb-4 bg-slate-100 rounded-xl p-1">
          {([['settings', '설정'], ['contact', '문의']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'settings' && (
          <div className="px-5 pb-6 space-y-5">
            <Toggle
              label="모국어 번역 표시"
              description="문제 풀 때 한국어 번역을 화면에 보여줍니다."
              checked={settings.showTranslation}
              onChange={v => updateSetting('showTranslation', v)}
            />
            <div className="border-t border-slate-100" />
            <Toggle
              label="시작 버튼 사용"
              description="문제가 바뀔 때 ▶ 시작 버튼을 누른 후 타이머가 시작됩니다. 끄면 바로 타이머가 작동합니다."
              checked={settings.useStartButton}
              onChange={v => updateSetting('useStartButton', v)}
            />
            <div className="border-t border-slate-100" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="font-medium text-slate-800 text-sm">단어당 타이머</div>
                  <div className="text-xs text-slate-500 mt-0.5">단어 1개당 주어지는 시간입니다.</div>
                </div>
                <span className="text-sm font-bold text-blue-600 min-w-[3rem] text-right">
                  {settings.secondsPerWord.toFixed(1)}초
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.1}
                value={settings.secondsPerWord}
                onChange={e => updateSetting('secondsPerWord', parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>0.5초</span>
                <span>5.0초</span>
              </div>
            </div>
            <div className="border-t border-slate-100" />
            <div>
              <div className="font-medium text-slate-800 text-sm mb-1">문장 출처</div>
              <div className="text-xs text-slate-500 mb-2">AI 모드는 Groq API 키가 필요합니다.</div>
              <div className="flex gap-2">
                {(['server', 'ai'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => updateSetting('sentenceMode', m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors
                      ${settings.sentenceMode === m
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {m === 'server' ? '서버 문장' : 'AI 문장'}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100" />
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-40"
            >
              {loggingOut ? '로그아웃 중...' : '로그아웃'}
            </button>
          </div>
        )}

        {tab === 'contact' && (
          <div className="px-5 pb-6 space-y-3">
            {sent ? (
              <div className="py-8 text-center space-y-2">
                <div className="text-3xl">✅</div>
                <p className="font-semibold text-slate-800">문의가 전송되었습니다!</p>
                <p className="text-sm text-slate-500">빠른 시일 내에 답변 드리겠습니다.</p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-3 text-sm text-blue-600 underline"
                >
                  추가 문의하기
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    이메일 (선택, 답장 원할 시)
                  </label>
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={e => setSenderEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    문의 내용 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={5}
                    placeholder="버그 제보, 기능 요청, 기타 문의 등 자유롭게 작성해주세요."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                </div>
                {sendError && (
                  <p className="text-xs text-red-500">{sendError}</p>
                )}
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors text-sm"
                >
                  {sending ? '전송 중...' : '전송하기'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
