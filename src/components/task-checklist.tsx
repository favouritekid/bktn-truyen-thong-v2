'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { Task, TaskChecklist as TaskChecklistItem } from '@/lib/types';

interface TaskChecklistProps {
  task: Task;
  onRefresh: () => void;
}

export default function TaskChecklist({ task, onRefresh }: TaskChecklistProps) {
  const profile = useProfile();
  const { show } = useToast();
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isAssignee = task.assignees?.some(a => a.id === profile.id) ?? false;
  const editableStatuses = ['Bản nháp', 'Đã duyệt', 'Đang làm'];
  const canEdit = isAdmin || (isAssignee && editableStatuses.includes(task.status));

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('task_checklists')
      .select('id, task_id, title, is_checked, sort_order, created_by, created_at, updated_at')
      .eq('task_id', task.id)
      .order('sort_order');
    setItems((data as TaskChecklistItem[]) || []);
    setLoading(false);
  }, [task.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`checklists-${task.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_checklists',
        filter: `task_id=eq.${task.id}`,
      }, () => {
        fetchItems();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [task.id, fetchItems]);

  const checkedCount = items.filter(i => i.is_checked).length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const logActivity = useCallback(async (action: string, detail: string) => {
    const supabase = createClient();
    await supabase.from('activity_logs').insert({
      user_id: profile.id,
      action,
      detail,
      task_id: task.id,
    });
  }, [profile.id, task.id]);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase.from('task_checklists').insert({
      task_id: task.id,
      title: newTitle.trim(),
      sort_order: totalCount,
      created_by: profile.id,
    });

    if (error) {
      show('Lỗi thêm checklist: ' + error.message, 'error');
    } else {
      setNewTitle('');
      await logActivity('add_checklist', `Thêm checklist: ${newTitle.trim()}`);
      onRefresh();
    }
    setAdding(false);
  }, [newTitle, task.id, totalCount, profile.id, show, logActivity, onRefresh]);

  const handleToggle = useCallback(async (itemId: string, currentChecked: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('task_checklists')
      .update({ is_checked: !currentChecked })
      .eq('id', itemId);

    if (error) {
      show('Lỗi cập nhật: ' + error.message, 'error');
    } else {
      const item = items.find(i => i.id === itemId);
      await logActivity('toggle_checklist', `${!currentChecked ? 'Hoàn thành' : 'Bỏ hoàn thành'}: ${item?.title}`);
      onRefresh();
    }
  }, [items, show, logActivity, onRefresh]);

  const handleDelete = useCallback(async (itemId: string) => {
    const supabase = createClient();
    const item = items.find(i => i.id === itemId);
    const { error } = await supabase
      .from('task_checklists')
      .delete()
      .eq('id', itemId);

    if (error) {
      show('Lỗi xóa: ' + error.message, 'error');
    } else {
      await logActivity('delete_checklist', `Xóa checklist: ${item?.title}`);
      onRefresh();
    }
  }, [items, show, logActivity, onRefresh]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  if (loading) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
        Checklist {totalCount > 0 && `(${checkedCount}/${totalCount})`}
      </h4>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 rounded-full bg-gray-200 mb-3">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPct}%`,
              backgroundColor: progressPct === 100 ? '#2E7D32' : '#0288D1',
            }}
          />
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={item.is_checked}
              onChange={() => canEdit && handleToggle(item.id, item.is_checked)}
              disabled={!canEdit}
              className="accent-blue-600 shrink-0"
            />
            <span className={`text-sm flex-1 ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
              {item.title}
            </span>
            {canEdit && (
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-400 hover:text-red-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Xóa"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add new item */}
      {canEdit && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Thêm mục mới..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            Thêm
          </button>
        </div>
      )}

      {totalCount === 0 && !canEdit && (
        <p className="text-sm text-gray-400 italic">Chưa có checklist.</p>
      )}
    </div>
  );
}
