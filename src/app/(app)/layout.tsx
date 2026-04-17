import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import BottomNav from '@/components/BottomNav'
import AdBanner from '@/components/AdBanner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex flex-col min-h-screen">
      <AdBanner />
      <Navbar />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
