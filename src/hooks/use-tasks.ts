'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Campaign, Channel, Profile, Task, TaskResult } from '@/lib/types';

interface UseTasksOptions {
  profileId: string;
  role: 'super_admin' | 'admin' | 'editor';
  channelFilter?: string;
  assigneeFilter?: string;
  showArchived?: boolean;
}

interface RawCampaign {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface RawTaskChannel {
  channels: Channel | Channel[];
}

interface RawTaskRow {
  id: string;
  title: string;
  description: string;
  content_type: string | null;
  campaign_id: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  completed_at: string | null;
  admin_note: string;
  created_by: string;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  task_channels: RawTaskChannel[];
  task_assignees: { user: Profile | Profile[] | null }[];
  task_results: TaskResult[];
  creator: Profile | Profile[];
  campaign: RawCampaign | RawCampaign[] | null;
}

export function useTasks({ profileId, role, channelFilter, assigneeFilter, showArchived }: UseTasksOptions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);

    let query = supabase
      .from('tasks')
      .select(`
        id, title, description, content_type, campaign_id, status, priority, deadline, completed_at, admin_note, created_by, is_archived, archived_at, archived_by, created_at, updated_at,
        task_channels!left(channels:channels(id, name, description, status, created_at, updated_at)),
        task_assignees!left(user:profiles!task_assignees_user_id_fkey(id, email, full_name, role, is_active, created_at, updated_at)),
        task_results!left(id, task_id, type, value, label, created_at, created_by),
        creator:profiles!tasks_created_by_fkey(id, email, full_name, role, is_active, created_at, updated_at),
        campaign:campaigns!left(id, code, name, status)
      `)
      .order('created_at', { ascending: false });

    // Filter by archive status
    query = query.eq('is_archived', showArchived ? true : false);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      setLoading(false);
      return;
    }

    let processed: Task[] = (data as unknown as RawTaskRow[] || []).map(row => {
      const assignees: Profile[] = (row.task_assignees || [])
        .map((ta: { user: Profile | Profile[] | null }) => {
          if (!ta.user) return null;
          if (Array.isArray(ta.user)) return ta.user[0];
          return ta.user;
        })
        .filter(Boolean) as Profile[];

      const channels: Channel[] = (row.task_channels || [])
        .map((tc: RawTaskChannel) => {
          if (Array.isArray(tc.channels)) return tc.channels[0];
          return tc.channels;
        })
        .filter(Boolean) as Channel[];

      const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
      const campaign = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign;

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        content_type: row.content_type,
        campaign_id: row.campaign_id,
        status: row.status,
        priority: row.priority,
        deadline: row.deadline,
        completed_at: row.completed_at,
        admin_note: row.admin_note,
        created_by: row.created_by,
        is_archived: row.is_archived,
        archived_at: row.archived_at,
        archived_by: row.archived_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        channels,
        assignees,
        results: row.task_results || [],
        creator,
        campaign: campaign as Campaign | undefined,
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

    // Filter by channel
    if (channelFilter) {
      processed = processed.filter(t =>
        t.channels?.some(c => c.name === channelFilter)
      );
    }

    setTasks(processed);
    setLoading(false);
  }, [profileId, role, channelFilter, assigneeFilter, showArchived]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();

    const realtimeChannel = supabase
      .channel(`tasks-realtime-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_channels' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_results' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_checklists' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_links' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [fetchTasks]);

  return { tasks, loading, refresh: fetchTasks };
}
