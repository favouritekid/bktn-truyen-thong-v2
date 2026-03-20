'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUSES, STATUS_COLORS } from '@/lib/constants';
import { useChannels } from '@/hooks/use-channels';
import { isAdminOrAbove } from '@/lib/utils';
import { useProfile } from '@/components/profile-context';
import { useTasks } from '@/hooks/use-tasks';
import TaskCard from '@/components/task-card';
import TaskDrawer from '@/components/task-drawer';
import TaskForm from '@/components/task-form';
import type { Profile, Task } from '@/lib/types';

export default function KanbanPage() {
  const profile = useProfile();
  const { channels: dbChannels } = useChannels();
  const [channelFilter, setChannelFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showPublished, setShowPublished] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formTask, setFormTask] = useState<Task | null | undefined>(undefined); // undefined = closed, null = create, Task = edit
  const [allEditors, setAllEditors] = useState<Profile[]>([]);

  const { tasks, loading, refresh } = useTasks({
    profileId: profile.id,
    role: profile.role,
    channelFilter: channelFilter || undefined,
    assigneeFilter: assigneeFilter || undefined,
    showArchived,
  });

  // Load editors for filter
  useEffect(() => {
    async function loadEditors() {
      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('full_name');
      setAllEditors(data as Profile[] || []);
    }
    loadEditors();
  }, []);

  const visibleStatuses = useMemo(() => {
    if (showPublished) return [...STATUSES];
    return STATUSES.filter(s => s !== 'Đã đăng');
  }, [showPublished]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) {
      map[s] = [];
    }
    for (const t of tasks) {
      if (map[t.status]) {
        map[t.status].push(t);
      }
    }
    return map;
  }, [tasks]);

  // Keep selectedTask in sync with realtime data
  const selectedTaskRef = useRef<Task | null>(null);
  useEffect(() => {
    if (selectedTaskRef.current) {
      const updated = tasks.find(t => t.id === selectedTaskRef.current!.id);
      if (updated) {
        setSelectedTask(updated);
      } else {
        // Task was deleted or archived — close drawer
        selectedTaskRef.current = null;
        setSelectedTask(null);
      }
    }
  }, [tasks]);

  const openDrawer = useCallback((task: Task) => {
    selectedTaskRef.current = task;
    setSelectedTask(task);
  }, []);

  const closeDrawer = useCallback(() => {
    selectedTaskRef.current = null;
    setSelectedTask(null);
  }, []);

  const openCreateForm = useCallback(() => {
    setFormTask(null);
  }, []);

  const openEditForm = useCallback((task: Task) => {
    setSelectedTask(null);
    setFormTask(task);
  }, []);

  const closeForm = useCallback(() => {
    setFormTask(undefined);
  }, []);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Channel filter */}
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-700"
          >
            <option value="">Tất cả kênh</option>
            {dbChannels.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Assignee filter (admin only) */}
          {isAdminOrAbove(profile.role) && (
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-700"
            >
              <option value="">Tất cả NV</option>
              {allEditors.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          )}

          {/* Toggle published */}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPublished}
              onChange={e => setShowPublished(e.target.checked)}
              className="accent-indigo-500 w-3.5 h-3.5"
            />
            Đã đăng
          </label>

          {/* Toggle archived (admin only) */}
          {isAdminOrAbove(profile.role) && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
                className="accent-amber-500 w-3.5 h-3.5"
              />
              Lưu trữ
            </label>
          )}
        </div>

        <button
          onClick={openCreateForm}
          className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium rounded-md transition-colors"
        >
          + Tạo Task mới
        </button>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Đang tải...</p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 140px)' }}>
          {visibleStatuses.map(status => {
            const statusTasks = tasksByStatus[status] || [];
            const color = STATUS_COLORS[status] || '#8B8F96';

            return (
              <div
                key={status}
                className="flex-shrink-0 w-[290px] flex flex-col"
              >
                {/* Column header */}
                <div className="px-2 py-2 flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs font-semibold text-gray-700">{status}</span>
                  </div>
                  <span className="text-[11px] text-gray-400 font-medium">{statusTasks.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)]">
                  {statusTasks.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-8">Trống</p>
                  ) : (
                    statusTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => openDrawer(task)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={closeDrawer}
          onRefresh={refresh}
          onEdit={openEditForm}
        />
      )}

      {/* Form modal */}
      {formTask !== undefined && (
        <TaskForm
          task={formTask}
          onClose={closeForm}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
