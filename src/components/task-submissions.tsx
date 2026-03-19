'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { LinkLabel, Task, TaskChecklist, TaskMemberSubmission, TaskMemberSubmissionLink } from '@/lib/types';

interface TaskSubmissionsProps {
  task: Task;
  onRefresh: () => void;
}

interface RawSubmission {
  id: string;
  task_id: string;
  user_id: string;
  note: string;
  submitted_at: string;
  updated_at: string;
  user: { id: string; full_name: string; email: string; role: string } | { id: string; full_name: string; email: string; role: string }[];
  task_member_submission_links: RawSubmissionLink[];
}

interface RawSubmissionLink {
  id: string;
  submission_id: string;
  label_id: string | null;
  url: string;
  note: string;
  created_at: string;
  link_label: LinkLabel | LinkLabel[] | null;
}

export default function TaskSubmissions({ task, onRefresh }: TaskSubmissionsProps) {
  const profile = useProfile();
  const { show } = useToast();
  const [submissions, setSubmissions] = useState<TaskMemberSubmission[]>([]);
  const [assigneeCount, setAssigneeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [linkLabels, setLinkLabels] = useState<LinkLabel[]>([]);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionLinks, setSubmissionLinks] = useState<{ labelId: string; url: string; note: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [myChecklistItems, setMyChecklistItems] = useState<TaskChecklist[]>([]);

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isAssignee = task.assignees?.some(a => a.id === profile.id) ?? false;
  const isWorkingStatus = task.status === 'Đang làm';
  const canSubmit = isAssignee && isWorkingStatus;

  useEffect(() => {
    async function loadLabels() {
      const supabase = createClient();
      const { data } = await supabase
        .from('link_labels')
        .select('id, name, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('name');
      setLinkLabels((data as LinkLabel[]) || []);
    }
    loadLabels();
  }, []);

  const fetchSubmissions = useCallback(async () => {
    const supabase = createClient();

    const { count } = await supabase
      .from('task_assignees')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', task.id);
    setAssigneeCount(count || 0);

    const { data } = await supabase
      .from('task_member_submissions')
      .select(`
        id, task_id, user_id, note, submitted_at, updated_at,
        user:profiles!task_member_submissions_user_id_fkey(id, full_name, email, role),
        task_member_submission_links(id, submission_id, label_id, url, note, created_at, link_label:link_labels(id, name, is_active, created_at, updated_at))
      `)
      .eq('task_id', task.id)
      .order('submitted_at', { ascending: true });

    const processed = ((data || []) as unknown as RawSubmission[]).map(row => ({
      id: row.id,
      task_id: row.task_id,
      user_id: row.user_id,
      note: row.note,
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      user: Array.isArray(row.user) ? row.user[0] : row.user,
      links: (row.task_member_submission_links || []).map((l: RawSubmissionLink) => ({
        ...l,
        link_label: Array.isArray(l.link_label) ? l.link_label[0] : l.link_label,
      })),
    }));

    setSubmissions(processed as TaskMemberSubmission[]);
    setLoading(false);
  }, [task.id]);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`submissions-${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_member_submissions', filter: `task_id=eq.${task.id}` }, () => fetchSubmissions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_member_submission_links' }, () => fetchSubmissions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [task.id, fetchSubmissions]);

  const fetchMyChecklist = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('task_checklists')
      .select('id, task_id, title, is_checked, sort_order, assignee_user_id, created_by, created_at, updated_at')
      .eq('task_id', task.id)
      .eq('assignee_user_id', profile.id)
      .order('sort_order');
    setMyChecklistItems((data as TaskChecklist[]) || []);
  }, [task.id, profile.id]);

  const handleToggleChecklist = useCallback(async (itemId: string, currentChecked: boolean) => {
    const supabase = createClient();
    await supabase.from('task_checklists')
      .update({ is_checked: !currentChecked })
      .eq('id', itemId);
    setMyChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, is_checked: !currentChecked } : i));
    onRefresh();
  }, [onRefresh]);

  const startEditing = useCallback(async (userId: string) => {
    const sub = submissions.find(s => s.user_id === userId);
    if (sub) {
      setSubmissionNote(sub.note || '');
      setSubmissionLinks(
        (sub.links || []).length > 0
          ? (sub.links || []).map(l => ({ labelId: l.label_id || '', url: l.url, note: l.note }))
          : [{ labelId: '', url: '', note: '' }]
      );
    } else {
      setSubmissionNote('');
      setSubmissionLinks([{ labelId: '', url: '', note: '' }]);
    }
    await fetchMyChecklist();
    setEditingUserId(userId);
  }, [submissions, fetchMyChecklist]);

  const cancelEditing = useCallback(() => {
    setEditingUserId(null);
  }, []);

  const addLinkRow = useCallback(() => {
    setSubmissionLinks(prev => [...prev, { labelId: '', url: '', note: '' }]);
  }, []);

  const removeLinkRow = useCallback((idx: number) => {
    setSubmissionLinks(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateLinkRow = useCallback((idx: number, field: 'labelId' | 'url' | 'note', value: string) => {
    setSubmissionLinks(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }, []);

  const handleSubmit = useCallback(async () => {
    const validLinks = submissionLinks.filter(l => l.url.trim());
    if (!submissionNote.trim() && validLinks.length === 0) {
      show('Vui lòng nhập ghi chú hoặc ít nhất 1 link.', 'error');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const existingSubmission = submissions.find(s => s.user_id === profile.id);

    if (existingSubmission) {
      await supabase.from('task_member_submissions')
        .update({ note: submissionNote.trim(), updated_at: new Date().toISOString() })
        .eq('id', existingSubmission.id);

      await supabase.from('task_member_submission_links')
        .delete().eq('submission_id', existingSubmission.id);

      if (validLinks.length > 0) {
        await supabase.from('task_member_submission_links')
          .insert(validLinks.map(l => ({
            submission_id: existingSubmission.id,
            label_id: l.labelId || null,
            url: l.url.trim(),
            note: l.note.trim(),
          })));
      }
    } else {
      const { data: newSub, error } = await supabase
        .from('task_member_submissions')
        .insert({ task_id: task.id, user_id: profile.id, note: submissionNote.trim() })
        .select('id').single();

      if (error || !newSub) {
        show('Lỗi nộp kết quả: ' + (error?.message || 'Unknown'), 'error');
        setSaving(false);
        return;
      }

      if (validLinks.length > 0) {
        await supabase.from('task_member_submission_links')
          .insert(validLinks.map(l => ({
            submission_id: newSub.id,
            label_id: l.labelId || null,
            url: l.url.trim(),
            note: l.note.trim(),
          })));
      }
    }

    await supabase.from('activity_logs').insert({
      user_id: profile.id, action: 'submit_result',
      detail: 'Nộp/cập nhật kết quả', task_id: task.id,
    });

    show('Đã nộp kết quả.', 'success');
    setEditingUserId(null);
    setSaving(false);
    fetchSubmissions();
    onRefresh();
  }, [submissionNote, submissionLinks, submissions, profile.id, task.id, show, fetchSubmissions, onRefresh]);

  const handleDelete = useCallback(async (submissionId: string) => {
    if (!window.confirm('Xóa báo cáo kết quả của bạn?')) return;
    const supabase = createClient();

    await supabase.from('task_member_submission_links')
      .delete().eq('submission_id', submissionId);
    const { error } = await supabase.from('task_member_submissions')
      .delete().eq('id', submissionId);

    if (error) {
      show('Lỗi xóa: ' + error.message, 'error');
    } else {
      await supabase.from('activity_logs').insert({
        user_id: profile.id, action: 'delete_result',
        detail: 'Xóa báo cáo kết quả', task_id: task.id,
      });
      show('Đã xóa báo cáo.', 'success');
      fetchSubmissions();
      onRefresh();
    }
  }, [profile.id, task.id, show, fetchSubmissions, onRefresh]);

  const totalAssignees = assigneeCount;
  const submittedCount = submissions.length;
  const allSubmitted = totalAssignees > 0 && submittedCount >= totalAssignees;
  const isCreator = task.created_by === profile.id;
  const mySubmission = submissions.find(s => s.user_id === profile.id);

  if (loading) return null;

  const myCheckedCount = myChecklistItems.filter(i => i.is_checked).length;
  const myTotalChecklist = myChecklistItems.length;
  const hasUncheckedItems = myTotalChecklist > 0 && myCheckedCount < myTotalChecklist;

  const renderEditForm = () => (
    <div className="pt-2 space-y-2.5">
      {/* Checklist assigned to me */}
      {myTotalChecklist > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
              Checklist của bạn ({myCheckedCount}/{myTotalChecklist})
            </span>
            {hasUncheckedItems && (
              <span className="text-[10px] text-amber-600 font-medium">Chưa hoàn thành hết</span>
            )}
          </div>
          <div className="h-1 rounded-full bg-blue-200 mb-2">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((myCheckedCount / myTotalChecklist) * 100)}%`,
                backgroundColor: myCheckedCount === myTotalChecklist ? '#2E7D32' : '#0288D1',
              }}
            />
          </div>
          <div className="space-y-0.5">
            {myChecklistItems.map(item => (
              <label
                key={item.id}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-blue-100/60 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={item.is_checked}
                  onChange={() => handleToggleChecklist(item.id, item.is_checked)}
                  className="accent-blue-600 shrink-0"
                />
                <span className={`text-xs ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {item.title}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <textarea
        value={submissionNote}
        onChange={e => setSubmissionNote(e.target.value)}
        rows={2}
        placeholder="Ghi chú về kết quả..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        autoFocus={myTotalChecklist === 0}
      />

      {/* Links */}
      <div className="space-y-1.5">
        {submissionLinks.map((link, idx) => (
          <div key={idx} className="flex gap-1.5 items-center">
            <select
              value={link.labelId}
              onChange={e => updateLinkRow(idx, 'labelId', e.target.value)}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 w-[100px] shrink-0"
            >
              <option value="">Nhãn...</option>
              {linkLabels.map(ll => (
                <option key={ll.id} value={ll.id}>{ll.name}</option>
              ))}
            </select>
            <input
              type="url"
              value={link.url}
              onChange={e => updateLinkRow(idx, 'url', e.target.value)}
              placeholder="https://..."
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <input
              type="text"
              value={link.note}
              onChange={e => updateLinkRow(idx, 'note', e.target.value)}
              placeholder="Mô tả"
              className="w-[80px] border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            {submissionLinks.length > 1 && (
              <button onClick={() => removeLinkRow(idx)} className="text-red-400 hover:text-red-600 text-xs shrink-0">&times;</button>
            )}
          </div>
        ))}
        <button onClick={addLinkRow} className="text-[11px] text-purple-600 hover:text-purple-700 font-medium">
          + Thêm link
        </button>
      </div>

      {/* Warning if unchecked items */}
      {hasUncheckedItems && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>Bạn còn {myTotalChecklist - myCheckedCount} mục checklist chưa hoàn thành</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={saving} className="px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button onClick={cancelEditing} className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-300">
          Hủy
        </button>
      </div>
    </div>
  );

  const renderSubmissionCard = (sub: TaskMemberSubmission) => {
    const isMyCard = sub.user_id === profile.id;
    const isEditingThis = editingUserId === sub.user_id;
    const canModify = isMyCard && isWorkingStatus;
    const linkCount = sub.links?.length || 0;

    return (
      <div
        key={sub.id}
        className={`rounded-lg border transition-all ${
          isEditingThis
            ? 'border-purple-300 bg-purple-50 ring-1 ring-purple-200 p-3'
            : 'border-gray-200 hover:border-gray-300 p-2.5'
        }`}
      >
        {/* Header: name + date + actions */}
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{ backgroundColor: isMyCard ? '#7B1FA2' : '#6B7280' }}
          >
            {(sub.user?.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          {/* Name + date */}
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-gray-800">
              {sub.user?.full_name || 'Unknown'}
            </span>
            {isMyCard && <span className="text-[10px] text-purple-500 ml-1">(Bạn)</span>}
            <span className="text-[10px] text-gray-400 ml-2">
              {new Date(sub.updated_at || sub.submitted_at).toLocaleDateString('vi-VN')}
            </span>
          </div>
          {/* Action icons */}
          {canModify && !isEditingThis && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => startEditing(sub.user_id)}
                className="p-1 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50 transition-colors"
                title="Sửa"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(sub.id)}
                className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                title="Xóa"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        {isEditingThis ? (
          renderEditForm()
        ) : (
          <div className="mt-1.5 ml-8">
            {sub.note && (
              <p className="text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">{sub.note}</p>
            )}
            {linkCount > 0 && (
              <div className={`space-y-1 ${sub.note ? 'mt-1.5' : ''}`}>
                {(sub.links || []).map(link => (
                  <div key={link.id} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                      {link.link_label?.name || 'Link'}
                    </span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate">
                      {link.url}
                    </a>
                    {link.note && <span className="text-[10px] text-gray-400 shrink-0">({link.note})</span>}
                  </div>
                ))}
              </div>
            )}
            {!sub.note && linkCount === 0 && (
              <p className="text-xs text-gray-400 italic">Chưa có nội dung.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Kết quả ({submittedCount}/{totalAssignees})
        </h4>
      </div>

      {/* Progress */}
      {totalAssignees > 0 && (
        <div className="h-1 rounded-full bg-gray-200 mb-3">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(Math.round((submittedCount / totalAssignees) * 100), 100)}%`,
              backgroundColor: allSubmitted ? '#2E7D32' : '#7B1FA2',
            }}
          />
        </div>
      )}

      {/* Cards */}
      {submissions.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-sm text-gray-400 mb-2">Chưa có editor nào nộp kết quả.</p>
          {canSubmit && (
            <button
              onClick={() => startEditing(profile.id)}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              + Nộp kết quả
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => renderSubmissionCard(sub))}

          {canSubmit && !mySubmission && !editingUserId && (
            <button
              onClick={() => startEditing(profile.id)}
              className="w-full rounded-lg border-2 border-dashed border-purple-200 py-2 text-xs text-purple-600 hover:bg-purple-50 hover:border-purple-300 transition-colors font-medium"
            >
              + Nộp kết quả của bạn
            </button>
          )}
        </div>
      )}

      {/* New submission form (when not yet in list) */}
      {editingUserId === profile.id && !mySubmission && submissions.length > 0 && (
        <div className="mt-2 rounded-lg border border-purple-300 bg-purple-50 ring-1 ring-purple-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: '#7B1FA2' }}>
              {profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <span className="text-xs font-semibold text-gray-800">
              {profile.full_name} <span className="text-purple-500">(Bạn)</span>
            </span>
          </div>
          {renderEditForm()}
        </div>
      )}

      {/* All submitted notice */}
      {allSubmitted && !isAdmin && isCreator && isWorkingStatus && (
        <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-green-700 font-medium">
            Tất cả editor đã nộp. Bạn có thể gửi duyệt.
          </p>
        </div>
      )}
    </div>
  );
}
