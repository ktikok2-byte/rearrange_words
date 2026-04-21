'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import SettingsModal from '@/components/SettingsModal'

export default function BottomNav() {
  const pathname = usePathname()
  const [showSettings, setShowSettings] = useState(false)

  const navItems = [
    { href: '/play',      label: '게임' },
    { href: '/dashboard', label: '내 현황' },
    { href: '/stats',     label: '통계' },
  ]

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40">
        <div className="flex items-stretch max-w-4xl mx-auto">
          {navItems.map(({ href, label }) => (
            <Link key={href} href={href}
              className={`flex-1 text-center py-3 text-sm font-medium whitespace-nowrap transition-colors
                ${pathname.startsWith(href) ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </Link>
          ))}
          <button
            onClick={() => setShowSettings(true)}
            className="flex-1 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap transition-colors"
          >
            설정
          </button>
        </div>
      </nav>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}
