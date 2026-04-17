import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StatsClient from './StatsClient'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: rows }, { data: levelHistory }] = await Promise.all([
    supabase
      .from('user_sentence_status')
      .select('unsolved_correct, solved_at')
      .eq('user_id', user.id)
      .not('solved_at', 'is', null)
      .order('solved_at', { ascending: true }),

    supabase
      .from('level_history')
      .select('to_level, changed_at')
      .eq('user_id', user.id)
      .order('changed_at', { ascending: true }),
  ])

  return <StatsClient rows={rows ?? []} levelHistory={levelHistory ?? []} />
}
