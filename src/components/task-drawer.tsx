'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUS_COLORS, RESULT_TYPES } from '@/lib/constants';
import { formatDateVN, getChannelColor, isOverdue } from '@/lib/utils';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
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
    // Validate all fields filled
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
    // Require at least 1 result
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

  // Determine available actions
  const renderFooterActions = () => {
    const buttons: React.ReactNode[] = [];
    const btnClass = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50';

    if (isEditor) {
      if (task.status === 'Bản nháp') {
        buttons.push(
          <button key="edit" onClick={() => onEdit(task)} className={`${btnClass} bg-gray-200 hover:bg-gray-300 text-gray-700`}>
            Sửa
          </button>,
          <button key="send" onClick={handleSendApproval} disabled={updating} className={`${btnClass} bg-orange-600 hover:bg-orange-700 text-white`}>
            Gửi duyệt KH
          </button>
        );
      } else if (task.status === 'Đã duyệt') {
        buttons.push(
          <button key="start" onClick={handleStartWork} disabled={updating} className={`${btnClass} bg-blue-600 hover:bg-blue-700 text-white`}>
            Bắt đầu thực hiện
          </button>
        );
      } else if (task.status === 'Đang làm') {
        buttons.push(
          <button key="editDesc" onClick={() => setEditingDescription(true)} className={`${btnClass} bg-gray-200 hover:bg-gray-300 text-gray-700`}>
            Sửa mô tả
          </button>,
          <button key="addResult" onClick={() => setShowResultForm(true)} className={`${btnClass} bg-purple-600 hover:bg-purple-700 text-white`}>
            Báo cáo kết quả
          </button>,
          <button key="sendResult" onClick={handleSendResultApproval} disabled={updating} className={`${btnClass} bg-green-600 hover:bg-green-700 text-white`}>
            Gửi duyệt KQ
          </button>
        );
      } else if (task.status === 'Chờ duyệt KH' || task.status === 'Chờ duyệt KQ') {
        buttons.push(
          <span key="waiting" className="text-sm text-gray-500 italic px-4 py-2">
            Đang chờ Admin duyệt...
          </span>
        );
      }
    }

    if (isAdmin) {
      if (task.status === 'Chờ duyệt KH') {
        buttons.push(
          <button key="reject" onClick={handleRejectContent} disabled={updating} className={`${btnClass} bg-red-600 hover:bg-red-700 text-white`}>
            Từ chối
          </button>,
          <button key="approve" onClick={handleApproveContent} disabled={updating} className={`${btnClass} bg-green-600 hover:bg-green-700 text-white`}>
            Duyệt KH
          </button>
        );
      } else if (task.status === 'Chờ duyệt KQ') {
        buttons.push(
          <button key="return" onClick={handleRejectResult} disabled={updating} className={`${btnClass} bg-red-600 hover:bg-red-700 text-white`}>
            Trả lại
          </button>,
          <button key="approveResult" onClick={handleApproveResult} disabled={updating} className={`${btnClass} bg-green-600 hover:bg-green-700 text-white`}>
            Duyệt KQ
          </button>
        );
      }

      // Admin can add results on draft/approved/in-progress
      if (['Bản nháp', 'Đã duyệt', 'Đang làm'].includes(task.status)) {
        buttons.push(
          <button key="addResult" onClick={() => setShowResultForm(true)} className={`${btnClass} bg-purple-600 hover:bg-purple-700 text-white`}>
            Báo cáo kết quả
          </button>
        );
      }

      // Admin can send back to draft from certain statuses
      if (['Đã duyệt', 'Đang làm', 'Đã đăng'].includes(task.status)) {
        buttons.push(
          <button key="toDraft" onClick={handleBackToDraft} disabled={updating} className={`${btnClass} bg-gray-500 hover:bg-gray-600 text-white`}>
            Về nháp
          </button>
        );
      }

      // Admin can also edit in draft
      if (task.status === 'Bản nháp') {
        buttons.push(
          <button key="edit" onClick={() => onEdit(task)} className={`${btnClass} bg-gray-200 hover:bg-gray-300 text-gray-700`}>
            Sửa
          </button>,
          <button key="send" onClick={handleSendApproval} disabled={updating} className={`${btnClass} bg-orange-600 hover:bg-orange-700 text-white`}>
            Gửi duyệt KH
          </button>
        );
      }
    }

    return buttons;
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-[70] flex flex-col animate-[slideInRight_0.3s_ease]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: channelColor }}
              >
                {task.channel}
              </span>
              <span
                className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: statusColor }}
              >
                {task.status}
              </span>
              {task.priority === 'Cao' && (
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  Cao
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-gray-900 leading-tight">{task.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1">
            &times;
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400 text-xs">Loại nội dung</span>
              <p className="font-medium">{task.content_type || '—'}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Mức ưu tiên</span>
              <p className="font-medium">{task.priority}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Deadline</span>
              <p className={`font-medium ${overdue ? 'text-red-600' : ''}`}>
                {formatDateVN(task.deadline) || '—'}
                {overdue && ' (Trễ hạn!)'}
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Hoàn thành</span>
              <p className="font-medium">{formatDateVN(task.completed_at) || '—'}</p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-400 text-xs">Người phụ trách</span>
              <p className="font-medium">
                {task.assignees?.map(a => a.full_name).join(', ') || 'Chưa gán'}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-400 text-xs">Người tạo</span>
              <p className="font-medium">{task.creator?.full_name || '—'}</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Mô tả / Nội dung</h4>
            {editingDescription ? (
              <div className="space-y-2">
                <textarea
                  value={descriptionDraft}
                  onChange={e => setDescriptionDraft(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDescription}
                    disabled={updating}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => { setEditingDescription(false); setDescriptionDraft(task.description || ''); }}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap min-h-[60px]">
                {task.description || 'Chưa có mô tả.'}
              </div>
            )}
          </div>

          {/* Admin Note */}
          {(task.admin_note || isAdmin) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Ghi chú Admin</h4>
              {isAdmin ? (
                <AdminNoteEditor task={task} onRefresh={onRefresh} />
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 whitespace-pre-wrap">
                  {task.admin_note || 'Không có ghi chú.'}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Kết quả ({results.length})
            </h4>
            {results.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Chưa có kết quả nào.</p>
            ) : (
              <div className="space-y-2">
                {results.map(r => {
                  const typeInfo = RESULT_TYPES.find(rt => rt.value === r.type);
                  return (
                    <div key={r.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-600">
                            {typeInfo?.icon} {r.label || typeInfo?.label || r.type}
                          </span>
                        </div>
                        {r.type === 'link' || r.type === 'image' || r.type === 'video' || r.type === 'document' ? (
                          <a
                            href={r.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline break-all"
                          >
                            {r.value}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.value}</p>
                        )}
                      </div>
                      {(isAdmin || (isEditor && task.status === 'Đang làm')) && (
                        <button
                          onClick={() => handleDeleteResult(r.id)}
                          className="text-red-400 hover:text-red-600 text-sm shrink-0"
                          title="Xóa"
                        >
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
                  <select
                    value={newResultType}
                    onChange={e => setNewResultType(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {RESULT_TYPES.map(rt => (
                      <option key={rt.value} value={rt.value}>
                        {rt.icon} {rt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newResultLabel}
                    onChange={e => setNewResultLabel(e.target.value)}
                    placeholder="Nhãn (tùy chọn)"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                {newResultType === 'text' ? (
                  <textarea
                    value={newResultValue}
                    onChange={e => setNewResultValue(e.target.value)}
                    placeholder={RESULT_TYPES.find(r => r.value === newResultType)?.placeholder}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                ) : (
                  <input
                    type="text"
                    value={newResultValue}
                    onChange={e => setNewResultValue(e.target.value)}
                    placeholder={RESULT_TYPES.find(r => r.value === newResultType)?.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleAddResult}
                    disabled={updating}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    Thêm
                  </button>
                  <button
                    onClick={() => { setShowResultForm(false); setNewResultValue(''); setNewResultLabel(''); }}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="text-[11px] text-gray-400 space-y-0.5 pt-2 border-t border-gray-100">
            <p>Tạo: {formatDateVN(task.created_at)}</p>
            <p>Cập nhật: {formatDateVN(task.updated_at)}</p>
            <p className="font-mono text-[10px] text-gray-300">ID: {task.id}</p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2 justify-end">
          {renderFooterActions()}
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
        className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
        placeholder="Ghi chú cho nhân viên..."
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </button>
      )}
    </div>
  );
}
