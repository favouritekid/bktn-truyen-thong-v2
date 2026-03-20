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

  const handleSendApproval = useCallback(async () => {
    if (!task) return;
    if (!task.title || !task.channels?.length || !task.deadline || !task.assignees?.length) {
      show('Vui lòng điền đầy đủ thông tin (tiêu đề, kênh, deadline, người phụ trách) trước khi gửi duyệt.', 'error');
      return;
    }
    await updateStatus('Chờ duyệt KH');
  }, [task, updateStatus, show]);

  const handleApproveContent = useCallback(async () => {
    await updateStatus('Đã duyệt');
  }, [updateStatus]);

  const handleRejectContent = useCallback(async () => {
    const reason = window.prompt('Nhập lý do từ chối:');
    if (!reason) return;
    const timestamp = formatDateVN(new Date());
    const noteAppend = `\n[${timestamp}] Từ chối KH: ${reason}`;
    const currentNote = task?.admin_note || '';
    await updateStatus('Bản nháp', { admin_note: currentNote + noteAppend });
  }, [task, updateStatus]);

  const handleStartWork = useCallback(async () => {
    await updateStatus('Đang làm');
  }, [updateStatus]);

  const handleSendResultApproval = useCallback(async () => {
    if (!task) return;
    await updateStatus('Chờ duyệt KQ');
  }, [task, updateStatus]);

  const handleApproveResult = useCallback(async () => {
    await updateStatus('Đã đăng');
  }, [updateStatus]);

  const handleRejectResult = useCallback(async () => {
    const reason = window.prompt('Nhập lý do trả lại:');
    if (!reason) return;
    const timestamp = formatDateVN(new Date());
    const noteAppend = `\n[${timestamp}] Trả lại KQ: ${reason}`;
    const currentNote = task?.admin_note || '';
    await updateStatus('Đang làm', { admin_note: currentNote + noteAppend });
  }, [task, updateStatus]);

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
    const btnBase = 'px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1';

    if (isEditor) {
      if (task.status === 'Bản nháp') {
        buttons.push(
          <button key="edit" onClick={() => onEdit(task)} className={`${btnBase} bg-white border border-gray-300 hover:bg-gray-50 text-gray-700`}>
            Sửa
          </button>,
          <button key="send" onClick={handleSendApproval} disabled={updating} className={`${btnBase} bg-orange-600 hover:bg-orange-700 text-white`}>
            Gửi duyệt KH
          </button>
        );
      } else if (task.status === 'Đã duyệt') {
        buttons.push(
          <button key="start" onClick={handleStartWork} disabled={updating} className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}>
            Bắt đầu thực hiện
          </button>
        );
      } else if (task.status === 'Đang làm') {
        buttons.push(
          <button key="editDesc" onClick={() => setEditingDescription(true)} className={`${btnBase} bg-white border border-gray-300 hover:bg-gray-50 text-gray-700`}>
            Sửa mô tả
          </button>
        );
        if (allChecklistDone) {
          buttons.push(
            <button key="sendResult" onClick={handleSendResultApproval} disabled={updating} className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}>
              Gửi duyệt KQ
            </button>
          );
        } else {
          buttons.push(
            <span key="checklistWarn" className="text-[11px] text-amber-600 italic py-1.5">
              Hoàn thành checklist để gửi duyệt
            </span>
          );
        }
      } else if (task.status === 'Chờ duyệt KH' || task.status === 'Chờ duyệt KQ') {
        buttons.push(
          <span key="waiting" className="text-xs text-gray-400 italic py-1.5">
            Đang chờ Admin duyệt...
          </span>
        );
      }
    }

    if (isAdmin) {
      if (task.status === 'Chờ duyệt KH') {
        buttons.push(
          <button key="reject" onClick={handleRejectContent} disabled={updating} className={`${btnBase} bg-red-600 hover:bg-red-700 text-white`}>
            Từ chối
          </button>,
          <button key="approve" onClick={handleApproveContent} disabled={updating} className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}>
            Duyệt KH
          </button>
        );
      } else if (task.status === 'Chờ duyệt KQ') {
        buttons.push(
          <button key="return" onClick={handleRejectResult} disabled={updating} className={`${btnBase} bg-red-600 hover:bg-red-700 text-white`}>
            Trả lại
          </button>,
          <button key="approveResult" onClick={handleApproveResult} disabled={updating} className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}>
            Duyệt KQ
          </button>
        );
      }

      if (['Đã duyệt', 'Đang làm', 'Đã đăng'].includes(task.status)) {
        buttons.push(
          <button key="toDraft" onClick={handleBackToDraft} disabled={updating} className={`${btnBase} bg-gray-500 hover:bg-gray-600 text-white`}>
            Về nháp
          </button>
        );
      }

      if (task.status === 'Bản nháp') {
        buttons.push(
          <button key="edit" onClick={() => onEdit(task)} className={`${btnBase} bg-white border border-gray-300 hover:bg-gray-50 text-gray-700`}>
            Sửa
          </button>,
          <button key="send" onClick={handleSendApproval} disabled={updating} className={`${btnBase} bg-orange-600 hover:bg-orange-700 text-white`}>
            Gửi duyệt KH
          </button>
        );
      }
    }

    // Restore button for archived tasks
    if (task.is_archived && isAdmin) {
      buttons.push(
        <button key="restore" onClick={handleRestoreTask} disabled={updating} className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}>
          Khôi phục
        </button>
      );
    }

    // Archive & Delete buttons (separated visually)
    if (!task.is_archived) {
      const showArchive = canArchiveTask(profile.role, task.status, task.created_by, profile.id);
      const showDelete = canDeleteTask(profile.role, task.status, task.created_by, profile.id);

      if (showArchive || showDelete) {
        buttons.push(<div key="sep" className="w-px h-5 bg-gray-300 mx-0.5" />);
      }

      if (showArchive) {
        buttons.push(
          <button key="archive" onClick={handleArchiveTask} disabled={updating} className={`${btnBase} bg-white border border-gray-300 hover:bg-gray-100 text-gray-500`} title="Lưu trữ">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            Lưu trữ
          </button>
        );
      }

      if (showDelete) {
        buttons.push(
          <button key="delete" onClick={handleDeleteTask} disabled={updating} className={`${btnBase} bg-white border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-600`} title="Xóa">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
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
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-gray-50 shadow-2xl z-[70] flex flex-col animate-[slideInRight_0.2s_ease]">

        {/* ===== HEADER ===== */}
        <div className="bg-white border-b border-gray-200">
          {/* Color strip */}
          <div className="h-1" style={{ backgroundColor: statusColor }} />

          <div className="px-5 pt-4 pb-3">
            {/* Close */}
            <div className="flex justify-end mb-2">
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md w-7 h-7 flex items-center justify-center transition-colors">
                &times;
              </button>
            </div>

            {/* Title */}
            <h2 className="text-lg font-bold text-gray-900 leading-snug mb-3">{task.title}</h2>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(task.channels || []).map(ch => (
                <span key={ch.id} className="text-[11px] font-semibold text-white px-2.5 py-1 rounded" style={{ backgroundColor: getChannelColor(ch.name) }}>
                  {ch.name}
                </span>
              ))}
              <span className="text-[11px] font-semibold text-white px-2.5 py-1 rounded" style={{ backgroundColor: statusColor }}>
                {task.status}
              </span>
              {task.campaign && (
                <span className="text-[11px] font-medium text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded">
                  {task.campaign.name}
                </span>
              )}
              {task.content_type && (
                <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded">
                  {task.content_type}
                </span>
              )}
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded ${
                task.priority === 'Cao' ? 'bg-red-100 text-red-700' :
                task.priority === 'Trung bình' ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'
              }`}>
                {task.priority}
              </span>
            </div>

            {/* Meta rows */}
            <div className="space-y-2 text-sm">
              {/* Creator */}
              {task.creator && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Tạo bởi: <span className="font-medium text-gray-700">{task.creator.full_name}</span></span>
                </div>
              )}

              {/* Assignees + Deadline */}
              <div className="flex items-center justify-between">
                {/* Assignees */}
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-2">
                    {(task.assignees || []).slice(0, 4).map(a => (
                      <div
                        key={a.id}
                        title={a.full_name}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white"
                        style={{ backgroundColor: getAvatarColor(a.full_name) }}
                      >
                        {getInitials(a.full_name)}
                      </div>
                    ))}
                    {(task.assignees?.length || 0) > 4 && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600 bg-gray-200 border-2 border-white">
                        +{task.assignees!.length - 4}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 ml-1">
                    {task.assignees?.map(a => a.full_name).join(', ') || 'Chưa gán'}
                  </span>
                </div>

                {/* Deadline */}
                {task.deadline && (
                  <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                    overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <span>&#128197;</span>
                    <span>{formatDateTimeVN(task.deadline)}</span>
                    {overdue && <span>(Trễ!)</span>}
                  </div>
                )}
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
          <div className="px-4 py-3 space-y-3">

            {/* ========== GROUP 1: THÔNG TIN TASK ========== */}
            <div className="rounded-xl bg-blue-50/60 border border-blue-100 overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100/60 border-b border-blue-100">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Thông tin task</h3>
              </div>

              <div className="p-3 space-y-2.5">
                {/* Description */}
                <section className="bg-white rounded-lg border border-blue-100 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Mô tả</h4>
                    {!editingDescription && (isAdmin || (isEditor && ['Bản nháp', 'Đang làm'].includes(task.status))) && (
                      <button onClick={() => setEditingDescription(true)} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                        Sửa
                      </button>
                    )}
                  </div>
                  {editingDescription ? (
                    <div className="space-y-2">
                      <textarea
                        value={descriptionDraft}
                        onChange={e => setDescriptionDraft(e.target.value)}
                        rows={5}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveDescription} disabled={updating} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">Lưu</button>
                        <button onClick={() => { setEditingDescription(false); setDescriptionDraft(task.description || ''); }} className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-300">Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[32px]">
                      {task.description || <span className="text-gray-400 italic">Chưa có mô tả.</span>}
                    </p>
                  )}
                </section>

                {/* Checklist */}
                <section className="bg-white rounded-lg border border-blue-100 p-3">
                  <TaskChecklist task={task} onRefresh={handleRefresh} />
                </section>

                {/* Links */}
                <section className="bg-white rounded-lg border border-blue-100 p-3">
                  <TaskLinks task={task} onRefresh={onRefresh} />
                </section>

                {/* Admin Note */}
                {(task.admin_note || isAdmin) && (
                  <section className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                    <h4 className="text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-1.5">Ghi chú Admin</h4>
                    {isAdmin ? (
                      <AdminNoteEditor task={task} onRefresh={onRefresh} />
                    ) : (
                      <p className="text-sm text-amber-800 whitespace-pre-wrap">
                        {task.admin_note || 'Không có ghi chú.'}
                      </p>
                    )}
                  </section>
                )}
              </div>
            </div>

            {/* ========== GROUP 2: BÁO CÁO KẾT QUẢ ========== */}
            {['Đang làm', 'Chờ duyệt KQ', 'Đã đăng'].includes(task.status) && (
              <div className="rounded-xl bg-purple-50/60 border border-purple-100 overflow-hidden">
                {/* Group header with count */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-100/60 border-b border-purple-100">
                  <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Báo cáo kết quả</h3>
                </div>

                <div className="p-3">
                  <TaskSubmissions task={task} onRefresh={handleRefresh} />
                </div>
              </div>
            )}

            {/* ========== GROUP 3: TRAO ĐỔI ========== */}
            <div className="rounded-xl bg-green-50/60 border border-green-100 overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-green-100/60 border-b border-green-100">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Trao đổi</h3>
              </div>

              <div className="p-3">
                <TaskComments task={task} onRefresh={onRefresh} />
              </div>
            </div>

            {/* Footer info */}
            <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 pt-1 pb-2">
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
        className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        placeholder="Ghi chú cho nhân viên..."
      />
      {dirty && (
        <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </button>
      )}
    </div>
  );
}
