'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Task, TaskResult } from '@/lib/types';

interface UseTasksOptions {
  profileId: string;
  role: 'super_admin' | 'admin' | 'editor';
  channelFilter?: string;
  assigneeFilter?: string;
}

interface RawTaskRow {
  id: string;
  title: string;
  description: string;
  channel: string;
  content_type: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  completed_at: string | null;
  admin_note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  task_assignees: { profiles: Profile | Profile[] }[];
  task_results: TaskResult[];
  creator: Profile | Profile[];
}

export function useTasks({ profileId, role, channelFilter, assigneeFilter }: UseTasksOptions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);

    let query = supabase
      .from('tasks')
      .select(`
        *,
        task_assignees!left(profiles!inner(*)),
        task_results!left(*),
        creator:profiles!tasks_created_by_fkey(*)
      `)
      .order('created_at', { ascending: false });

    if (channelFilter) {
      query = query.eq('channel', channelFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      setLoading(false);
      return;
    }

    let processed: Task[] = (data as unknown as RawTaskRow[] || []).map(row => {
      const assignees: Profile[] = (row.task_assignees || [])
        .map((ta: { profiles: Profile | Profile[] }) => {
          if (Array.isArray(ta.profiles)) return ta.profiles[0];
          return ta.profiles;
        })
        .filter(Boolean);

      const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        channel: row.channel,
        content_type: row.content_type,
        status: row.status,
        priority: row.priority,
        deadline: row.deadline,
        completed_at: row.completed_at,
        admin_note: row.admin_note,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        assignees,
        results: row.task_results || [],
        creator,
      } as Task;
    });

    // For editor: only show tasks where they are an assignee
    if (role === 'editor') {
      processed = processed.filter(t =>
        t.assignees?.some(a => a.id === profileId)
      );
    }

    // Filter by assignee
    if (assigneeFilter) {
      processed = processed.filter(t =>
        t.assignees?.some(a => a.id === assigneeFilter)
      );
    }

    setTasks(processed);
    setLoading(false);
  }, [profileId, role, channelFilter, assigneeFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_results' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  return { tasks, loading, refresh: fetchTasks };
}
