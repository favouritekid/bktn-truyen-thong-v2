'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ProfileProvider } from '@/components/profile-context';
import { ToastProvider } from '@/components/ui/toast';
import TaskDrawer from '@/components/task-drawer';
import TaskForm from '@/components/task-form';
import type { Profile, Task, Channel } from '@/lib/types';

interface Props {
  profile: Profile;
  taskId: string;
}

export default function TaskDetailClient({ profile, taskId }: Props) {
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formTask, setFormTask] = useState<Task | null | undefined>(undefined);

  const fetchTask = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('tasks')
      .select(`
        id, title, description, content_type, campaign_id, status, priority, deadline, completed_at, admin_note, created_by, is_archived, archived_at, archived_by, created_at, updated_at,
        task_channels!left(channels:channels(id, name, description, status, created_at, updated_at)),
        task_assignees!left(user:profiles!task_assignees_user_id_fkey(id, email, full_name, role, is_active, created_at, updated_at)),
        task_results!left(id, task_id, type, value, label, created_at, created_by),
        creator:profiles!tasks_created_by_fkey(id, email, full_name, role, is_active, created_at, updated_at),
        campaign:campaigns!left(id, code, name, status)
      `)
      .eq('id', taskId)
      .single();

    if (err || !data) {
      setError('Không tìm thấy task');
      setLoading(false);
      return;
    }

    // Process raw data same as use-tasks.ts
    const row = data as Record<string, unknown>;
    const assignees = ((row.task_assignees as { user: unknown }[]) || [])
      .map(ta => {
        if (!ta.user) return null;
        if (Array.isArray(ta.user)) return ta.user[0];
        return ta.user;
      })
      .filter(Boolean) as Profile[];

    const channels = ((row.task_channels as { channels: unknown }[]) || [])
      .map(tc => {
        if (Array.isArray(tc.channels)) return tc.channels[0];
        return tc.channels;
      })
      .filter(Boolean) as Channel[];

    const creator = Array.isArray(row.creator) ? (row.creator as Profile[])[0] : row.creator as Profile | undefined;
    const campaign = Array.isArray(row.campaign) ? (row.campaign as unknown[])[0] : row.campaign;

    setTask({
      id: data.id,
      title: data.title,
      description: data.description,
      content_type: data.content_type,
      campaign_id: data.campaign_id,
      status: data.status,
      priority: data.priority,
      deadline: data.deadline,
      completed_at: data.completed_at,
      admin_note: data.admin_note,
      created_by: data.created_by,
      is_archived: data.is_archived,
      archived_at: data.archived_at,
      archived_by: data.archived_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
      channels,
      assignees,
      results: (data.task_results as Task['results']) || [],
      creator,
      campaign: campaign as Task['campaign'],
    });
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const handleClose = useCallback(() => {
    router.push('/kanban');
  }, [router]);

  const handleEdit = useCallback((t: Task) => {
    setFormTask(t);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormTask(undefined);
  }, []);

  const handleSaved = useCallback(() => {
    setFormTask(undefined);
    fetchTask();
  }, [fetchTask]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Đang tải...</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-500">{error || 'Không tìm thấy task'}</p>
        <button onClick={() => router.push('/kanban')} className="text-sm text-indigo-600 hover:underline">
          Về Kanban
        </button>
      </div>
    );
  }

  return (
    <ProfileProvider profile={profile}>
      <ToastProvider>
        <TaskDrawer task={task} onClose={handleClose} onRefresh={fetchTask} onEdit={handleEdit} />
        {formTask !== undefined && (
          <TaskForm task={formTask} onClose={handleFormClose} onSaved={handleSaved} />
        )}
      </ToastProvider>
    </ProfileProvider>
  );
}
