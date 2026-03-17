'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, STATUSES, STATUS_COLORS } from '@/lib/constants';
import { useProfile } from '@/components/profile-context';
import { useTasks } from '@/hooks/use-tasks';
import TaskCard from '@/components/task-card';
import TaskDrawer from '@/components/task-drawer';
import TaskForm from '@/components/task-form';
import type { Profile, Task } from '@/lib/types';

export default function KanbanPage() {
  const profile = useProfile();
  const [channelFilter, setChannelFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showPublished, setShowPublished] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formTask, setFormTask] = useState<Task | null | undefined>(undefined); // undefined = closed, null = create, Task = edit
  const [allEditors, setAllEditors] = useState<Profile[]>([]);

  const { tasks, loading, refresh } = useTasks({
    profileId: profile.id,
    role: profile.role,
    channelFilter: channelFilter || undefined,
    assigneeFilter: assigneeFilter || undefined,
  });

  // Load editors for filter
  useEffect(() => {
    async function loadEditors() {
      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'active')
        .order('name');
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

  const openDrawer = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const closeDrawer = useCallback(() => {
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả kênh</option>
            {CHANNELS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Assignee filter (admin only) */}
          {profile.role === 'admin' && (
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tất cả NV</option>
              {allEditors.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          )}

          {/* Toggle published */}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPublished}
              onChange={e => setShowPublished(e.target.checked)}
              className="accent-blue-600"
            />
            Hiện "Đã đăng"
          </label>
        </div>

        <button
          onClick={openCreateForm}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
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
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
          {visibleStatuses.map(status => {
            const statusTasks = tasksByStatus[status] || [];
            const color = STATUS_COLORS[status] || '#9E9E9E';

            return (
              <div
                key={status}
                className="flex-shrink-0 w-[280px] bg-gray-50 rounded-xl border border-gray-200 flex flex-col"
              >
                {/* Column header */}
                <div
                  className="px-3 py-2.5 rounded-t-xl flex items-center justify-between"
                  style={{ backgroundColor: color + '15' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-bold" style={{ color }}>
                      {status}
                    </span>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: color }}
                  >
                    {statusTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
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
