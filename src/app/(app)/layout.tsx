import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AppShell from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) redirect('/login');

  // Fire-and-forget: update last_login_at and last_activity_at
  supabase
    .from('profiles')
    .update({
      last_login_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .then();

  return <AppShell profile={profile}>{children}</AppShell>;
}
