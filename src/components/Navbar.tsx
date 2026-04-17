import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
      <Link href="/dashboard" className="font-bold text-xl text-blue-600 tracking-tight">
        WordOrder
      </Link>
      <Link href="/dashboard" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
        홈으로
      </Link>
    </nav>
  )
}
