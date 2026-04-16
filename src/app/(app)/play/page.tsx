import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GameClient from './GameClient'

export default async function PlayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return <GameClient userId={user.id} initialProfile={profile} />
}
