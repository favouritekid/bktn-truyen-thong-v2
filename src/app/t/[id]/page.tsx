import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Profile } from '@/lib/types';
import TaskDetailClient from './client';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, created_at, updated_at')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) redirect('/login');

  return <TaskDetailClient profile={profile as Profile} taskId={taskId} />;
}
