import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StatsClient from './StatsClient'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all unsolved attempts for stats
  const { data: attempts } = await supabase
    .from('attempts')
    .select('is_correct, created_at, time_taken_ms, word_count')
    .eq('user_id', user.id)
    .eq('mode', 'unsolved')
    .order('created_at', { ascending: true })

  return <StatsClient attempts={attempts ?? []} />
}
