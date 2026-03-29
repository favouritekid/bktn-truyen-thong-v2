'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUS_COLORS } from '@/lib/constants';
import { formatDateVN, formatDateTimeVN, getChannelColor, isOverdue, canDeleteTask, canArchiveTask, deleteRequiresWarning } from '@/lib/utils';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import TaskChecklist from './task-checklist';
import TaskLinks from './task-links';
import TaskComments from './task-comments';
import TaskSubmissions from './task-submissions';
import type { Task } from '@/lib/types';

interface TaskDrawerProps {
  task: Task | null;
  onClose: () => void;
  onRefresh: () => void;
  onEdit: (task: Task) => void;
}

export default function TaskDrawer({ task, onClose, onRefresh, onEdit }: TaskDrawerProps) {
  const profile = useProfile();
  const { show } = useToast();
  const [updating, setUpdating] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [allChecklistDone, setAllChecklistDone] = useState(false);

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isEditor = profile.role === 'editor';

  // Check if all checklist items are completed
  const checkChecklistCompletion = useCallback(async (taskId: string) => {
    const supabase = createClient();
    const { count: total } = await supabase
      .from('task_checklists')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId);

    if (!total || total === 0) {
      setAllChecklistDone(true); // No checklist = OK to proceed
      return;
    }

    const { count: unchecked } = await supabase
      .from('task_checklists')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('is_checked', false);

    setAllChecklistDone(unchecked === 0);
  }, []);

  useEffect(() => {
    if (task) {
      setDescriptionDraft(task.description || '');
      setEditingDescription(false);
      checkChecklistCompletion(task.id);
    }
  }, [task, checkChecklistCompletion]);

  // Realtime: re-check checklist completion when checklists or submissions change
  useEffect(() => {
    if (!task) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`drawer-status-${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_checklists', filter: `task_id=eq.${task.id}` }, () => {
        checkChecklistCompletion(task.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_member_submissions', filter: `task_id=eq.${task.id}` }, () => {
        checkChecklistCompletion(task.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [task, checkChecklistCompletion]);

  const handleRefresh = useCallback(() => {
    onRefresh();
    if (task) checkChecklistCompletion(task.id);
  }, [onRefresh, task, checkChecklistCompletion]);

  const logActivity = useCallback(async (action: string, detail: string, taskId: string) => {
    const supabase = createClient();
    await supabase.from('activity_logs').insert({
      user_id: profile.id,
      action,
      detail,
      task_id: taskId,
    });
  }, [profile.id]);

  const updateStatus = useCallback(async (newStatus: string, extraUpdates?: Record<string, unknown>) => {
    if (!task) return;
    setUpdating(true);
    const supabase = createClient();

    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...extraUpdates,
    };

    if (newStatus === 'Đã đăng') {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', task.id);

    if (error) {
      show('Lỗi cập nhật: ' + error.message, 'error');
    } else {
      show(`Chuyển trạng thái: ${task.status} → ${newStatus}`, 'success');
      await logActivity('status_change', `${task.status} → ${newStatus}`, task.id);
      onRefresh();
      onClose();
    }
    setUpdating(false);
  }, [task, show, logActivity, onRefresh, onClose]);

  const sendZaloNotification = useCallback(async (taskId: string, type: string, rejectReason?: string) => {
    try {
      await fetch('/api/notifications/zalo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, type, rejectReason }),
      });
    } catch {
      // Notification failure should not block the main flow
    }
  }, []);

  const handleSendApproval = useCallback(async () => {
    if (!task) return;
    if (!task.title || !task.channels?.length || !task.deadline || !task.assignees?.length) {
      show('Vui lòng điền đầy đủ thông tin (tiêu đề, kênh, deadline, người phụ trách) trước khi gửi duyệt.', 'error');
      return;
    }
    await updateStatus('Chờ duyệt KH');
    sendZaloNotification(task.id, 'pending_content_approval');
  }, [task, updateStatus, show, sendZaloNotification]);

  const handleApproveContent = useCallback(async () => {
    await updateStatus('Đã duyệt');
    if (task) sendZaloNotification(task.id, 'content_approved');
  }, [updateStatus, task, sendZaloNotification]);

  const handleRejectContent = useCallback(async () => {
    const reason = window.prompt('Nhập lý do từ chối:');
    if (!reason) return;
    const timestamp = formatDateVN(new Date());
    const noteAppend = `\n[${timestamp}] Từ chối KH: ${reason}`;
    const currentNote = task?.admin_note || '';
    await updateStatus('Bản nháp', { admin_note: currentNote + noteAppend });
    if (task) sendZaloNotification(task.id, 'content_rejected', reason);
  }, [task, updateStatus, sendZaloNotification]);

  const handleStartWork = useCallback(async () => {
    await updateStatus('Đang làm');
  }, [updateStatus]);

  const handleSendResultApproval = useCallback(async () => {
    if (!task) return;
    await updateStatus('Chờ duyệt KQ');
    sendZaloNotification(task.id, 'pending_result_approval');
  }, [task, updateStatus, sendZaloNotification]);

  const handleApproveResult = useCallback(async () => {
    await updateStatus('Đã đăng');
    if (task) sendZaloNotification(task.id, 'result_approved');
  }, [updateStatus, task, sendZaloNotification]);

  const handleRejectResult = useCallback(async () => {
    const reason = window.prompt('Nhập lý do trả lại:');
    if (!reason) return;
    const timestamp = formatDateVN(new Date());
    const noteAppend = `\n[${timestamp}] Trả lại KQ: ${reason}`;
    const currentNote = task?.admin_note || '';
    await updateStatus('Đang làm', { admin_note: currentNote + noteAppend });
    if (task) sendZaloNotification(task.id, 'result_rejected', reason);
  }, [task, updateStatus, sendZaloNotification]);

  const handleBackToDraft = useCallback(async () => {
    if (!task) return;
    if (!window.confirm('Đưa về Bản nháp sẽ xóa trạng thái hoàn thành. Tiếp tục?')) return;
    await updateStatus('Bản nháp', { completed_at: null });
  }, [task, updateStatus]);

  const handleDeleteTask = useCallback(async () => {
    if (!task) return;
    const warning = deleteRequiresWarning(task.status)
      ? `Task "${task.title}" đang được thực hiện. Xóa sẽ mất toàn bộ dữ liệu (checklist, kết quả, bình luận). KHÔNG THỂ HOÀN TÁC!\n\nBạn chắc chắn muốn xóa?`
      : `Xóa task "${task.title}"? Hành động này không thể hoàn tác.`;
    if (!window.confirm(warning)) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) {
        show(result.error || 'Lỗi xóa task', 'error');
      } else {
        show('Đã xóa task.', 'success');
        onRefresh();
        onClose();
      }
    } catch {
      show('Lỗi hệ thống', 'error');
    }
    setUpdating(false);
  }, [task, show, onRefresh, onClose]);

  const handleArchiveTask = useCallback(async () => {
    if (!task) return;
    if (!window.confirm(`Lưu trữ task "${task.title}"? Task sẽ bị ẩn khỏi danh sách nhưng có thể khôi phục.`)) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      const result = await res.json();
      if (!res.ok) {
        show(result.error || 'Lỗi lưu trữ', 'error');
      } else {
        show('Đã lưu trữ task.', 'success');
        onRefresh();
        onClose();
      }
    } catch {
      show('Lỗi hệ thống', 'error');
    }
    setUpdating(false);
  }, [task, show, onRefresh, onClose]);

  const handleRestoreTask = useCallback(async () => {
    if (!task) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      const result = await res.json();
      if (!res.ok) {
        show(result.error || 'Lỗi khôi phục', 'error');
      } else {
        show('Đã khôi phục task.', 'success');
        onRefresh();
        onClose();
      }
    } catch {
      show('Lỗi hệ thống', 'error');
    }
    setUpdating(false);
  }, [task, show, onRefresh, onClose]);

  const handleSaveDescription = useCallback(async () => {
    if (!task) return;
    setUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('tasks')
      .update({ description: descriptionDraft, updated_at: new Date().toISOString() })
      .eq('id', task.id);

    if (error) {
      show('Lỗi cập nhật mô tả: ' + error.message, 'error');
    } else {
      show('Đã cập nhật mô tả.', 'success');
      setEditingDescription(false);
      onRefresh();
    }
    setUpdating(false);
  }, [task, descriptionDraft, show, onRefresh]);

  if (!task) return null;

  const statusColor = STATUS_COLORS[task.status] || '#9E9E9E';
  const overdue = isOverdue(task.deadline) && !['Đã đăng'].includes(task.status);

  // Render action buttons based on role + status
  const renderActions = () => {
    const buttons: React.ReactNode[] = [];
    const btnPrimary = 'px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white';
    const btnSecondary = 'px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 border border-gray-200 hover:bg-gray-50 text-gray-700';
    const btnDanger = 'px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 text-red-600 hover:bg-red-50 border border-gray-200';

    if (isEditor) {
      if (task.status === 'Bản nháp') {
        buttons.push(
          <button key="edit" onClick={() => onEdit(task)} className={btnSecondary}>Sửa</button>,
          <button key="send" onClick={handleSendApproval} disabled={updating} className={btnPrimary}>Gửi duyệt KH</button>
        );
      } else if (task.status === 'Đã duyệt') {
        buttons.push(
          <button key="start" onClick={handleStartWork} disabled={updating} className={btnPrimary}>Bắt đầu thực hiện</button>
        );
      } else if (task.status === 'Đang làm') {
        buttons.push(
          <button key="editDesc" onClick={() => setEditingDescription(true)} className={btnSecondary}>Sửa mô tả</button>
        );
        if (allChecklistDone) {
          buttons.push(
            <button key="sendResult" onClick={handleSendResultApproval} disabled={updating} className={btnPrimary}>Gửi duyệt KQ</button>
          );
        } else {
          buttons.push(
            <span key="checklistWarn" className="text-[11px] text-amber-600 italic py-1.5">Hoàn thành checklist để gửi duyệt</span>
          );
        }
      } else if (task.status === 'Chờ duyệt KH' || task.status === 'Chờ duyệt KQ') {
        buttons.push(<span key="waiting" className="text-xs text-gray-400 italic py-1.5">Đang chờ Admin duyệt...</span>);
      }
    }

    if (isAdmin) {
      // Admin can edit in: Bản nháp, Chờ duyệt KH, Đã duyệt, Đang làm
      if (['Bản nháp', 'Chờ duyệt KH', 'Đã duyệt', 'Đang làm'].includes(task.status)) {
        buttons.push(
          <button key="edit" onClick={() => onEdit(task)} className={btnSecondary}>Sửa</button>
        );
      }

      if (task.status === 'Bản nháp') {
        buttons.push(
          <button key="send" onClick={handleSendApproval} disabled={updating} className={btnPrimary}>Gửi duyệt KH</button>
        );
      } else if (task.status === 'Chờ duyệt KH') {
        buttons.push(
          <button key="reject" onClick={handleRejectContent} disabled={updating} className={btnDanger}>Từ chối</button>,
          <button key="approve" onClick={handleApproveContent} disabled={updating} className={btnPrimary}>Duyệt KH</button>
        );
      } else if (task.status === 'Chờ duyệt KQ') {
        buttons.push(
          <button key="return" onClick={handleRejectResult} disabled={updating} className={btnDanger}>Trả lại</button>,
          <button key="approveResult" onClick={handleApproveResult} disabled={updating} className={btnPrimary}>Duyệt KQ</button>
        );
      }

      if (['Đã duyệt', 'Đang làm', 'Đã đăng'].includes(task.status)) {
        buttons.push(
          <button key="toDraft" onClick={handleBackToDraft} disabled={updating} className={btnSecondary}>Về nháp</button>
        );
      }
    }

    // Restore button for archived tasks
    if (task.is_archived && isAdmin) {
      buttons.push(
        <button key="restore" onClick={handleRestoreTask} disabled={updating} className={btnPrimary}>Khôi phục</button>
      );
    }

    // Archive & Delete buttons
    if (!task.is_archived) {
      const showArchive = canArchiveTask(profile.role, task.status, task.created_by, profile.id);
      const showDelete = canDeleteTask(profile.role, task.status, task.created_by, profile.id);

      if (showArchive || showDelete) {
        buttons.push(<div key="sep" className="w-px h-5 bg-gray-200 mx-0.5" />);
      }

      if (showArchive) {
        buttons.push(
          <button key="archive" onClick={handleArchiveTask} disabled={updating} className={btnSecondary} title="Lưu trữ">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            Lưu trữ
          </button>
        );
      }

      if (showDelete) {
        buttons.push(
          <button key="delete" onClick={handleDeleteTask} disabled={updating} className={btnDanger} title="Xóa">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Xóa
          </button>
        );
      }
    }

    return buttons;
  };

  // Generate initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const avatarColors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-lg border-l border-gray-200 z-[70] flex flex-col animate-[slideInRight_0.2s_ease]">

        {/* ===== HEADER ===== */}
        <div className="border-b border-gray-100">
          <div className="px-5 pt-4 pb-3">
            {/* Close */}
            <div className="flex justify-end mb-2">
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md w-7 h-7 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Title */}
            <h2 className="text-base font-semibold text-gray-900 leading-snug mb-3">{task.title}</h2>

            {/* Meta: status dot + tags inline */}
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
                {task.status}
              </span>
              {(task.channels || []).map(ch => (
                <span key={ch.id} className="inline-flex items-center gap-1 text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getChannelColor(ch.name) }} />
                  {ch.name}
                </span>
              ))}
              {task.campaign && <span className="text-gray-400">{task.campaign.name}</span>}
              {task.content_type && <span className="text-gray-400">{task.content_type}</span>}
              <span className={`font-medium ${
                task.priority === 'Cao' ? 'text-orange-600' :
                task.priority === 'Trung bình' ? 'text-gray-500' : 'text-gray-400'
              }`}>
                {task.priority}
              </span>
            </div>

            {/* Properties grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
              {task.creator && (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 w-14 shrink-0">Tạo bởi</span>
                  <span className="text-gray-700 font-medium truncate">{task.creator.full_name}</span>
                </div>
              )}
              {task.deadline && (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 w-14 shrink-0">Deadline</span>
                  <span className={`font-medium ${overdue ? 'text-red-600' : 'text-gray-700'}`}>
                    {formatDateTimeVN(task.deadline)}{overdue ? ' (Trễ)' : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 col-span-2">
                <span className="text-gray-400 w-14 shrink-0">Giao cho</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-1.5">
                    {(task.assignees || []).slice(0, 4).map(a => (
                      <div
                        key={a.id}
                        title={a.full_name}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white border border-white"
                        style={{ backgroundColor: getAvatarColor(a.full_name) }}
                      >
                        {getInitials(a.full_name)}
                      </div>
                    ))}
                  </div>
                  <span className="text-gray-600 text-[11px] truncate">
                    {task.assignees?.map(a => a.full_name).join(', ') || 'Chưa gán'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions bar */}
          <div className="px-5 pb-3 flex flex-wrap gap-1.5">
            {renderActions()}
          </div>
        </div>

        {/* ===== BODY - scrollable ===== */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">

            {/* Description */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Mô tả</h4>
                {!editingDescription && (isAdmin || (isEditor && ['Bản nháp', 'Đang làm'].includes(task.status))) && (
                  <button onClick={() => setEditingDescription(true)} className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium">Sửa</button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-2">
                  <textarea
                    value={descriptionDraft}
                    onChange={e => setDescriptionDraft(e.target.value)}
                    rows={5}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDescription} disabled={updating} className="px-3 py-1 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-800 disabled:opacity-50">Lưu</button>
                    <button onClick={() => { setEditingDescription(false); setDescriptionDraft(task.description || ''); }} className="px-3 py-1 text-gray-600 text-xs rounded-md hover:bg-gray-100">Hủy</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[24px]">
                  {task.description || <span className="text-gray-400 italic">Chưa có mô tả.</span>}
                </p>
              )}
            </section>

            <div className="border-t border-gray-100" />

            {/* Checklist */}
            <section>
              <TaskChecklist task={task} onRefresh={handleRefresh} />
            </section>

            <div className="border-t border-gray-100" />

            {/* Links */}
            <section>
              <TaskLinks task={task} onRefresh={onRefresh} />
            </section>

            {/* Admin Note */}
            {(task.admin_note || isAdmin) && (
              <>
                <div className="border-t border-gray-100" />
                <section>
                  <h4 className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-2">Ghi chú Admin</h4>
                  {isAdmin ? (
                    <AdminNoteEditor task={task} onRefresh={onRefresh} />
                  ) : (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {task.admin_note || 'Không có ghi chú.'}
                    </p>
                  )}
                </section>
              </>
            )}

            {/* Submissions */}
            {['Đang làm', 'Chờ duyệt KQ', 'Đã đăng'].includes(task.status) && (
              <>
                <div className="border-t border-gray-100" />
                <section>
                  <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Báo cáo kết quả</h4>
                  <TaskSubmissions task={task} onRefresh={handleRefresh} />
                </section>
              </>
            )}

            <div className="border-t border-gray-100" />

            {/* Comments */}
            <section>
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Trao đổi</h4>
              <TaskComments task={task} onRefresh={onRefresh} />
            </section>

            {/* Footer info */}
            <div className="flex items-center justify-between text-[10px] text-gray-400 pt-2 pb-1 border-t border-gray-100">
              <div className="space-x-2">
                <span>Tạo: {formatDateVN(task.created_at)}</span>
                <span>Cập nhật: {formatDateVN(task.updated_at)}</span>
              </div>
              <span className="font-mono text-gray-300">{task.id}</span>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

/* ---- Admin Note Editor sub-component ---- */
function AdminNoteEditor({ task, onRefresh }: { task: Task; onRefresh: () => void }) {
  const { show } = useToast();
  const [note, setNote] = useState(task.admin_note || '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setNote(task.admin_note || '');
    setDirty(false);
  }, [task.admin_note]);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('tasks')
      .update({ admin_note: note, updated_at: new Date().toISOString() })
      .eq('id', task.id);

    if (error) {
      show('Lỗi lưu ghi chú: ' + error.message, 'error');
    } else {
      show('Đã lưu ghi chú.', 'success');
      setDirty(false);
      onRefresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={e => { setNote(e.target.value); setDirty(true); }}
        rows={3}
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
        placeholder="Ghi chú cho nhân viên..."
      />
      {dirty && (
        <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-800 disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </button>
      )}
    </div>
  );
}
