'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { STATUSES, STATUS_COLORS } from '@/lib/constants';
import { useChannels } from '@/hooks/use-channels';
import { isAdminOrAbove } from '@/lib/utils';
import { useProfile } from '@/components/profile-context';
import { useTasks } from '@/hooks/use-tasks';
import TaskCard from '@/components/task-card';
import TaskDrawer from '@/components/task-drawer';
import TaskForm from '@/components/task-form';
import EmptyState from '@/components/ui/empty-state';
import type { Profile, Task } from '@/lib/types';

export default function KanbanPage() {
  const profile = useProfile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { channels: dbChannels } = useChannels();

  // Read filters from URL
  const channelFilter = searchParams.get('channel') || '';
  const assigneeFilter = searchParams.get('assignee') || '';
  const urlSearchQuery = searchParams.get('q') || '';
  const showPublished = searchParams.get('published') === '1';
  const showArchived = searchParams.get('archived') === '1';

  // Local search input with debounce to URL
  const [searchInput, setSearchInput] = useState(urlSearchQuery);
  const searchQuery = urlSearchQuery;
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync search input when URL changes externally (back/forward)
  useEffect(() => { setSearchInput(urlSearchQuery); }, [urlSearchQuery]);

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Keep task param if present
    router.replace(`/kanban?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const setChannelFilter = useCallback((v: string) => updateFilter('channel', v), [updateFilter]);
  const setAssigneeFilter = useCallback((v: string) => updateFilter('assignee', v), [updateFilter]);
  const setShowPublished = useCallback((v: boolean) => updateFilter('published', v ? '1' : ''), [updateFilter]);
  const setShowArchived = useCallback((v: boolean) => updateFilter('archived', v ? '1' : ''), [updateFilter]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => updateFilter('q', value.trim()), 300);
  }, [updateFilter]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    updateFilter('q', '');
  }, [updateFilter]);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formTask, setFormTask] = useState<Task | null | undefined>(undefined);
  const [allEditors, setAllEditors] = useState<Profile[]>([]);

  const { tasks, loading, refresh } = useTasks({
    profileId: profile.id,
    role: profile.role,
    channelFilter: channelFilter || undefined,
    assigneeFilter: assigneeFilter || undefined,
    showArchived,
  });

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

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.assignees?.some(a => a.full_name.toLowerCase().includes(q)) ||
      t.channels?.some(c => c.name.toLowerCase().includes(q)) ||
      t.campaign?.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }, [tasks, searchQuery]);

  const visibleStatuses = useMemo(() => {
    if (showPublished) return [...STATUSES];
    return STATUSES.filter(s => s !== 'Đã đăng');
  }, [showPublished]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) {
      map[s] = [];
    }
    for (const t of filteredTasks) {
      if (map[t.status]) {
        map[t.status].push(t);
      }
    }
    return map;
  }, [filteredTasks]);

  const totalCount = filteredTasks.length;

  const selectedTaskRef = useRef<Task | null>(null);
  useEffect(() => {
    if (selectedTaskRef.current) {
      const updated = tasks.find(t => t.id === selectedTaskRef.current!.id);
      if (updated) {
        setSelectedTask(updated);
      } else {
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

  // Auto-open task from URL query param (e.g., /kanban?task=T-20260331-2797)
  const taskParam = searchParams.get('task');
  const taskParamHandled = useRef(false);
  useEffect(() => {
    if (taskParam && !loading && tasks.length > 0 && !taskParamHandled.current) {
      const task = tasks.find(t => t.id === taskParam);
      if (task) {
        openDrawer(task);
        taskParamHandled.current = true;
        router.replace('/kanban', { scroll: false });
      }
    }
  }, [taskParam, loading, tasks, openDrawer, router]);

  // Column background tints (very subtle, Trello-style)
  const columnBg: Record<string, string> = {
    'Bản nháp': 'bg-gray-50',
    'Chờ duyệt KH': 'bg-orange-50/60',
    'Đã duyệt': 'bg-blue-50/60',
    'Đang làm': 'bg-amber-50/60',
    'Chờ duyệt KQ': 'bg-purple-50/60',
    'Đã đăng': 'bg-green-50/60',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* Left: Create button + Search */}
        <button
          onClick={openCreateForm}
          className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1 shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo Task
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-[280px]">
          <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Tìm task..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-700 placeholder-gray-400"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filters */}
        <select
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
          className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-700"
        >
          <option value="">Kênh</option>
          {dbChannels.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        {isAdminOrAbove(profile.role) && (
          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-700"
          >
            <option value="">Nhân viên</option>
            {allEditors.map(e => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={showPublished} onChange={e => setShowPublished(e.target.checked)} className="accent-indigo-500 w-3.5 h-3.5" />
          Đã đăng
        </label>

        {isAdminOrAbove(profile.role) && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-amber-500 w-3.5 h-3.5" />
            Lưu trữ
          </label>
        )}

        {/* Total count */}
        <span className="text-[11px] text-gray-400 ml-auto">{totalCount} task{searchQuery && ` (tìm: "${searchQuery}")`}</span>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex-1 flex gap-2.5 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, ci) => (
            <div key={ci} className="flex-shrink-0 w-[280px] bg-gray-50 rounded-lg flex flex-col">
              <div className="px-3 py-2.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 animate-pulse" />
                <span className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="px-1.5 pb-1.5 space-y-1.5">
                {Array.from({ length: 3 - ci % 2 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 space-y-2">
                    <div className="flex gap-1.5">
                      <span className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                      <span className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
                    <div className="flex items-center justify-between">
                      <span className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                      <div className="flex -space-x-1.5">
                        <span className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />
                        <span className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex gap-2.5 overflow-x-auto pb-2">
          {visibleStatuses.map(status => {
            const statusTasks = tasksByStatus[status] || [];
            const color = STATUS_COLORS[status] || '#8B8F96';
            const bg = columnBg[status] || 'bg-gray-50';

            return (
              <div
                key={status}
                className={`flex-shrink-0 w-[280px] ${bg} rounded-lg flex flex-col`}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-[13px] font-semibold text-gray-800">{status}</span>
                  </div>
                  <span className="text-[11px] text-gray-400 bg-white/80 px-1.5 py-0.5 rounded font-medium">
                    {statusTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 px-1.5 pb-1.5 space-y-1.5 overflow-y-auto">
                  {statusTasks.length === 0 ? (
                    <EmptyState
                      icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>}
                      message="Chưa có task"
                      actionLabel={status === 'Bản nháp' ? 'Tạo task mới' : undefined}
                      onAction={status === 'Bản nháp' ? () => setFormTask(null) : undefined}
                    />
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

                {/* Add button at bottom of first column */}
                {status === 'Bản nháp' && (
                  <div className="px-1.5 pb-2">
                    <button
                      onClick={openCreateForm}
                      className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-white/80 rounded-md transition-colors flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Thêm task
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      {selectedTask && (
        <TaskDrawer task={selectedTask} onClose={closeDrawer} onRefresh={refresh} onEdit={openEditForm} />
      )}

      {/* Form modal */}
      {formTask !== undefined && (
        <TaskForm task={formTask} onClose={closeForm} onSaved={refresh} />
      )}
    </div>
  );
}
