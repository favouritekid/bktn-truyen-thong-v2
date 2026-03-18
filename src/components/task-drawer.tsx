'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUS_COLORS, RESULT_TYPES } from '@/lib/constants';
import { formatDateVN, getChannelColor, isOverdue } from '@/lib/utils';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import TaskChecklist from './task-checklist';
import TaskLinks from './task-links';
import TaskComments from './task-comments';
import type { Task, TaskResult } from '@/lib/types';

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
  const [results, setResults] = useState<TaskResult[]>([]);
  const [newResultType, setNewResultType] = useState('link');
  const [newResultValue, setNewResultValue] = useState('');
  const [newResultLabel, setNewResultLabel] = useState('');
  const [showResultForm, setShowResultForm] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isEditor = profile.role === 'editor';

  useEffect(() => {
    if (task) {
      setResults(task.results || []);
      setDescriptionDraft(task.description || '');
      setShowResultForm(false);
      setEditingDescription(false);
      setNewResultValue('');
      setNewResultLabel('');
    }
  }, [task]);

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
    if (!task.title || !task.channel || !task.deadline || !task.assignees?.length) {
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
    if (results.length === 0) {
      show('Cần có ít nhất 1 kết quả trước khi gửi duyệt.', 'error');
      return;
    }
    await updateStatus('Chờ duyệt KQ');
  }, [task, results, updateStatus, show]);

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

  const handleAddResult = useCallback(async () => {
    if (!task || !newResultValue.trim()) {
      show('Vui lòng nhập giá trị kết quả.', 'error');
      return;
    }
    setUpdating(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('task_results')
      .insert({
        task_id: task.id,
        type: newResultType,
        value: newResultValue.trim(),
        label: newResultLabel.trim() || RESULT_TYPES.find(r => r.value === newResultType)?.label || newResultType,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      show('Lỗi thêm kết quả: ' + error.message, 'error');
    } else {
      setResults(prev => [...prev, data as TaskResult]);
      setNewResultValue('');
      setNewResultLabel('');
      setShowResultForm(false);
      show('Đã thêm kết quả.', 'success');
      await logActivity('add_result', `Thêm kết quả: ${newResultType}`, task.id);
      onRefresh();
    }
    setUpdating(false);
  }, [task, newResultType, newResultValue, newResultLabel, profile.id, show, logActivity, onRefresh]);

  const handleDeleteResult = useCallback(async (resultId: string) => {
    if (!window.confirm('Xóa kết quả này?')) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('task_results')
      .delete()
      .eq('id', resultId);

    if (error) {
      show('Lỗi xóa kết quả: ' + error.message, 'error');
    } else {
      setResults(prev => prev.filter(r => r.id !== resultId));
      show('Đã xóa kết quả.', 'success');
      onRefresh();
    }
  }, [show, onRefresh]);

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
  const channelColor = getChannelColor(task.channel);
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
          </button>,
          <button key="addResult" onClick={() => setShowResultForm(true)} className={`${btnBase} bg-purple-600 hover:bg-purple-700 text-white`}>
            Báo cáo KQ
          </button>,
          <button key="sendResult" onClick={handleSendResultApproval} disabled={updating} className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}>
            Gửi duyệt KQ
          </button>
        );
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

      if (['Bản nháp', 'Đã duyệt', 'Đang làm'].includes(task.status)) {
        buttons.push(
          <button key="addResult" onClick={() => setShowResultForm(true)} className={`${btnBase} bg-purple-600 hover:bg-purple-700 text-white`}>
            Báo cáo KQ
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
              <span className="text-[11px] font-semibold text-white px-2.5 py-1 rounded" style={{ backgroundColor: channelColor }}>
                {task.channel}
              </span>
              <span className="text-[11px] font-semibold text-white px-2.5 py-1 rounded" style={{ backgroundColor: statusColor }}>
                {task.status}
              </span>
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

            {/* Meta row: assignees + deadline */}
            <div className="flex items-center justify-between text-sm">
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
                  <span>{formatDateVN(task.deadline)}</span>
                  {overdue && <span>(Trễ!)</span>}
                </div>
              )}
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

            {/* --- Description --- */}
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Mô tả</h3>
                {!editingDescription && (isAdmin || (isEditor && ['Bản nháp', 'Đang làm'].includes(task.status))) && (
                  <button
                    onClick={() => setEditingDescription(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Sửa
                  </button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-2">
                  <textarea
                    value={descriptionDraft}
                    onChange={e => setDescriptionDraft(e.target.value)}
                    rows={6}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDescription} disabled={updating} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      Lưu
                    </button>
                    <button onClick={() => { setEditingDescription(false); setDescriptionDraft(task.description || ''); }} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[40px]">
                  {task.description || <span className="text-gray-400 italic">Chưa có mô tả.</span>}
                </p>
              )}
            </section>

            {/* --- Checklist --- */}
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <TaskChecklist task={task} onRefresh={onRefresh} />
            </section>

            {/* --- Links --- */}
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <TaskLinks task={task} onRefresh={onRefresh} />
            </section>

            {/* --- Admin Note --- */}
            {(task.admin_note || isAdmin) && (
              <section className="bg-amber-50 rounded-lg border border-amber-200 p-4">
                <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Ghi chú Admin</h3>
                {isAdmin ? (
                  <AdminNoteEditor task={task} onRefresh={onRefresh} />
                ) : (
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">
                    {task.admin_note || 'Không có ghi chú.'}
                  </p>
                )}
              </section>
            )}

            {/* --- Results --- */}
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Kết quả {results.length > 0 && `(${results.length})`}
              </h3>
              {results.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Chưa có kết quả nào.</p>
              ) : (
                <div className="space-y-2">
                  {results.map(r => {
                    const typeInfo = RESULT_TYPES.find(rt => rt.value === r.type);
                    return (
                      <div key={r.id} className="flex items-start justify-between gap-2 p-2.5 rounded-md bg-gray-50 group">
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-medium text-gray-500">
                            {typeInfo?.icon} {r.label || typeInfo?.label || r.type}
                          </span>
                          {r.type === 'link' || r.type === 'image' || r.type === 'video' || r.type === 'document' ? (
                            <a href={r.value} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 hover:underline break-all mt-0.5">
                              {r.value}
                            </a>
                          ) : (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{r.value}</p>
                          )}
                        </div>
                        {(isAdmin || (isEditor && task.status === 'Đang làm')) && (
                          <button onClick={() => handleDeleteResult(r.id)} className="text-red-400 hover:text-red-600 text-sm shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Xóa">
                            &times;
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add result form */}
              {showResultForm && (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <select value={newResultType} onChange={e => setNewResultType(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      {RESULT_TYPES.map(rt => (
                        <option key={rt.value} value={rt.value}>{rt.icon} {rt.label}</option>
                      ))}
                    </select>
                    <input type="text" value={newResultLabel} onChange={e => setNewResultLabel(e.target.value)} placeholder="Nhãn (tùy chọn)" className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  {newResultType === 'text' ? (
                    <textarea value={newResultValue} onChange={e => setNewResultValue(e.target.value)} placeholder={RESULT_TYPES.find(r => r.value === newResultType)?.placeholder} rows={3} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  ) : (
                    <input type="text" value={newResultValue} onChange={e => setNewResultValue(e.target.value)} placeholder={RESULT_TYPES.find(r => r.value === newResultType)?.placeholder} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleAddResult} disabled={updating} className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50">Thêm</button>
                    <button onClick={() => { setShowResultForm(false); setNewResultValue(''); setNewResultLabel(''); }} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">Hủy</button>
                  </div>
                </div>
              )}
            </section>

            {/* --- Comments (Activity) --- */}
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <TaskComments task={task} onRefresh={onRefresh} />
            </section>

            {/* --- Footer info --- */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 px-1 pb-2">
              <div className="space-x-3">
                <span>Tạo: {formatDateVN(task.created_at)}</span>
                <span>Cập nhật: {formatDateVN(task.updated_at)}</span>
              </div>
              <span className="font-mono text-[10px] text-gray-300">{task.id}</span>
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
