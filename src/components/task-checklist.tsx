'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTaskMonth } from '@/lib/utils';
import ConfirmDialog from './ui/confirm-dialog';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { Profile, Task, TaskChecklist as TaskChecklistItem } from '@/lib/types';

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
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; itemId: string; title: string }>({ open: false, itemId: '', title: '' });

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isAssignee = task.assignees?.some(a => a.id === profile.id) ?? false;

  // Permissions per agreed rules:
  // Admin: add/edit/delete in Bản nháp, Chờ duyệt KH, Đã duyệt, Đang làm
  // Editor: add/edit/delete only in Bản nháp
  const adminChecklistStatuses = ['Bản nháp', 'Chờ duyệt KH', 'Đã duyệt', 'Đang làm'];
  const canEditStructure = isAdmin
    ? adminChecklistStatuses.includes(task.status)
    : (isAssignee && task.status === 'Bản nháp');

  // Assignee change: admin in editable statuses, editor in Bản nháp
  const canChangeAssignee = isAdmin
    ? adminChecklistStatuses.includes(task.status)
    : (isAssignee && task.status === 'Bản nháp');

  // Toggle checkbox: separate from add/edit/delete rules
  // Admin can always toggle; editor can toggle non-assigned items in working statuses
  const editorToggleStatuses = ['Bản nháp', 'Đã duyệt', 'Đang làm'];

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('task_checklists')
      .select(`
        id, task_id, title, is_checked, sort_order, assignee_user_id, created_by, created_at, updated_at,
        assignee:profiles!task_checklists_assignee_user_id_fkey(id, full_name, email, role, is_active, created_at, updated_at)
      `)
      .eq('task_id', task.id)
      .order('sort_order');

    const processed = ((data || []) as unknown as (TaskChecklistItem & { assignee: Profile | Profile[] | null })[]).map(row => ({
      ...row,
      assignee: Array.isArray(row.assignee) ? row.assignee[0] : row.assignee,
    }));

    setItems(processed as TaskChecklistItem[]);
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
      assignee_user_id: newAssigneeId || null,
      created_by: profile.id,
    });

    if (error) {
      show('Lỗi thêm checklist: ' + error.message, 'error');
    } else {
      setNewTitle('');
      setNewAssigneeId('');
      await logActivity('add_checklist', `Thêm checklist: ${newTitle.trim()}`);
      onRefresh();
    }
    setAdding(false);
  }, [newTitle, newAssigneeId, task.id, totalCount, profile.id, show, logActivity, onRefresh]);

  const canToggleItem = useCallback((item: TaskChecklistItem) => {
    if (isAdmin) return true;
    if (item.assignee_user_id) return false;
    return isAssignee && editorToggleStatuses.includes(task.status);
  }, [isAdmin, isAssignee, task.status]);

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

  const executeDelete = useCallback(async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    const supabase = createClient();
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

  const handleDelete = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (task.status === 'Đang làm') {
      setDeleteConfirm({ open: true, itemId, title: item?.title || '' });
    } else {
      executeDelete(itemId);
    }
  }, [items, task.status, executeDelete]);

  // Inline edit title
  const startEditTitle = useCallback((item: TaskChecklistItem) => {
    setEditingItemId(item.id);
    setEditingTitle(item.title);
  }, []);

  const cancelEditTitle = useCallback(() => {
    setEditingItemId(null);
    setEditingTitle('');
  }, []);

  const saveEditTitle = useCallback(async (itemId: string) => {
    const trimmed = editingTitle.trim();
    const item = items.find(i => i.id === itemId);
    if (!trimmed || !item || trimmed === item.title) {
      cancelEditTitle();
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('task_checklists')
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      show('Lỗi sửa tên: ' + error.message, 'error');
      return;
    }

    // Rename Drive folder if task is in Đang làm (uploads may exist)
    if (task.status === 'Đang làm') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch('/api/rename-drive-folder', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              type: 'checklist',
              campaignName: task.campaign?.name || 'Không có chiến dịch',
              taskMonth: getTaskMonth(task.deadline),
              taskTitle: task.title,
              oldName: item.title,
              newName: trimmed,
            }),
          });
        }
      } catch {
        // Drive rename is best-effort
      }
    }

    await logActivity('edit_checklist', `Sửa tên checklist: "${item.title}" → "${trimmed}"`);
    cancelEditTitle();
    onRefresh();
  }, [editingTitle, items, task, show, logActivity, cancelEditTitle, onRefresh]);

  const handleAssigneeChange = useCallback(async (itemId: string, userId: string | null) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('task_checklists')
      .update({ assignee_user_id: userId })
      .eq('id', itemId);

    if (error) {
      show('Lỗi gán người: ' + error.message, 'error');
    } else {
      const item = items.find(i => i.id === itemId);
      const assignee = task.assignees?.find(a => a.id === userId);
      await logActivity('assign_checklist', `Gán "${item?.title}" cho ${assignee?.full_name || 'không ai'}`);
      onRefresh();
    }
  }, [items, task.assignees, show, logActivity, onRefresh]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent, itemId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditTitle(itemId);
    } else if (e.key === 'Escape') {
      cancelEditTitle();
    }
  }, [saveEditTitle, cancelEditTitle]);

  if (loading) return null;

  const taskAssignees = task.assignees || [];

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
        {items.map(item => {
          const toggleable = canToggleItem(item);
          const isEditingThis = editingItemId === item.id;
          return (
            <div key={item.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={item.is_checked}
                onChange={() => toggleable && handleToggle(item.id, item.is_checked)}
                disabled={!toggleable}
                className="accent-blue-600 shrink-0"
              />
              {isEditingThis ? (
                <input
                  type="text"
                  value={editingTitle}
                  onChange={e => setEditingTitle(e.target.value)}
                  onKeyDown={e => handleEditKeyDown(e, item.id)}
                  onBlur={() => saveEditTitle(item.id)}
                  autoFocus
                  className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <span
                  className={`text-sm flex-1 ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-700'} ${canEditStructure ? 'cursor-pointer hover:text-blue-600' : ''}`}
                  onDoubleClick={() => canEditStructure && startEditTitle(item)}
                  title={canEditStructure ? 'Nhấp đúp để sửa' : undefined}
                >
                  {item.title}
                  {item.assignee_user_id && !isAdmin && (
                    <span className="text-[9px] text-gray-400 ml-1" title="Tự hoàn thành khi nộp kết quả">
                      (qua báo cáo)
                    </span>
                  )}
                </span>
              )}
              {/* Assignee badge or select */}
              {!isEditingThis && canChangeAssignee ? (
                <select
                  value={item.assignee_user_id || ''}
                  onChange={e => handleAssigneeChange(item.id, e.target.value || null)}
                  className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-500 max-w-[90px] truncate opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Gán người thực hiện"
                >
                  <option value="">--</option>
                  {taskAssignees.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
              ) : !isEditingThis && item.assignee ? (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded max-w-[90px] truncate" title={item.assignee.full_name}>
                  {item.assignee.full_name}
                </span>
              ) : null}
              {!isEditingThis && canEditStructure && (
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-red-400 hover:text-red-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Xóa"
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add new item */}
      {canEditStructure && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Thêm mục mới..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={newAssigneeId}
            onChange={e => setNewAssigneeId(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[120px]"
            title="Gán cho"
          >
            <option value="">Gán cho...</option>
            {taskAssignees.map(a => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            Thêm
          </button>
        </div>
      )}

      {totalCount === 0 && !canEditStructure && (
        <p className="text-sm text-gray-400 italic">Chưa có checklist.</p>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Xóa checklist"
        message={`Xóa "${deleteConfirm.title}"?\n\nTask đang trong giai đoạn thực hiện — folder trên Google Drive (nếu có) sẽ KHÔNG bị xóa tự động. Bạn cần xóa thủ công trên Drive nếu cần.`}
        confirmLabel="Xóa"
        variant="danger"
        onConfirm={() => { setDeleteConfirm({ open: false, itemId: '', title: '' }); executeDelete(deleteConfirm.itemId); }}
        onCancel={() => setDeleteConfirm({ open: false, itemId: '', title: '' })}
      />
    </div>
  );
}
