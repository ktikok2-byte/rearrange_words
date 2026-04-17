'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import SettingsModal from '@/components/SettingsModal'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const links = [
    { href: '/play', label: '게임' },
    { href: '/dashboard', label: '내 현황' },
    { href: '/stats', label: '통계' },
  ]

  const handleLogout = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
    setLoading(false)
  }

  return (
    <>
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <Link href="/dashboard" className="font-bold text-xl text-blue-600 tracking-tight">
          WordOrder
        </Link>
        <div className="flex items-center gap-1 sm:gap-4">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${pathname.startsWith(href)
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => setShowSettings(true)}
            title="설정"
            className="px-2 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-lg leading-none"
          >
            ⚙️
          </button>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-red-500 transition-colors"
          >
            {loading ? '...' : '로그아웃'}
          </button>
        </div>
      </nav>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}
