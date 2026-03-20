'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { LinkLabel, Task, TaskChecklist, TaskMemberSubmission, TaskMemberSubmissionLink } from '@/lib/types';

interface TaskSubmissionsProps {
  task: Task;
  onRefresh: () => void;
}

// Per-checklist-item entry in the edit form
interface ChecklistEntry {
  checklistItemId: string;
  title: string;
  url: string;
  labelId: string;
  note: string;
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
  checklist_item_id: string | null;
  label_id: string | null;
  url: string;
  note: string;
  created_at: string;
  link_label: LinkLabel | LinkLabel[] | null;
  checklist_item: { id: string; title: string } | { id: string; title: string }[] | null;
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
  const [checklistEntries, setChecklistEntries] = useState<ChecklistEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

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
        task_member_submission_links(id, submission_id, checklist_item_id, label_id, url, note, created_at, link_label:link_labels(id, name, is_active, created_at, updated_at), checklist_item:task_checklists(id, title))
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
        checklist_item: Array.isArray(l.checklist_item) ? l.checklist_item[0] : l.checklist_item,
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

  // Build checklist entries for edit form
  const startEditing = useCallback(async (userId: string) => {
    // Set editing immediately so UI responds
    setEditingUserId(userId);

    const supabase = createClient();

    // Fetch checklist items assigned to this user
    const { data: myItems } = await supabase
      .from('task_checklists')
      .select('id, title, sort_order, assignee_user_id, is_checked')
      .eq('task_id', task.id)
      .eq('assignee_user_id', userId)
      .order('sort_order');

    const items = (myItems || []) as TaskChecklist[];

    // Get existing submission to pre-fill
    const sub = submissions.find(s => s.user_id === userId);
    setSubmissionNote(sub?.note || '');

    // Build entries: one per checklist item, pre-filled from existing links
    const entries: ChecklistEntry[] = items.map(item => {
      const existingLink = sub?.links?.find(l => l.checklist_item_id === item.id);
      return {
        checklistItemId: item.id,
        title: item.title,
        url: existingLink?.url || '',
        labelId: existingLink?.label_id || '',
        note: existingLink?.note || '',
      };
    });

    setChecklistEntries(entries);
  }, [task.id, submissions]);

  const cancelEditing = useCallback(() => {
    setEditingUserId(null);
  }, []);

  const updateEntry = useCallback((idx: number, field: 'url' | 'labelId' | 'note', value: string) => {
    setChecklistEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }, []);

  const handleUploadToDrive = useCallback(async (idx: number, file: File) => {
    setUploadingIdx(idx);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        show('Phiên đăng nhập hết hạn.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaignName', task.campaign?.name || 'Không có chiến dịch');
      formData.append('taskTitle', task.title);
      formData.append('uploaderName', profile.full_name);

      const res = await fetch('/api/upload-drive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        show(result.error || 'Upload thất bại', 'error');
        return;
      }

      // Auto-fill the URL field with the Google Drive link
      updateEntry(idx, 'url', result.url);
      show(`Đã upload "${result.fileName}" lên Google Drive`, 'success');
    } catch {
      show('Lỗi upload file', 'error');
    } finally {
      setUploadingIdx(null);
      // Reset the file input
      const input = fileInputRefs.current.get(idx);
      if (input) input.value = '';
    }
  }, [show, updateEntry]);

  const handleSubmit = useCallback(async () => {
    // Validate: each checklist item must have a URL
    const incomplete = checklistEntries.filter(e => !e.url.trim());
    if (checklistEntries.length > 0 && incomplete.length > 0) {
      show(`Còn ${incomplete.length} mục chưa có link kết quả: ${incomplete.map(e => e.title).join(', ')}`, 'error');
      return;
    }

    if (checklistEntries.length === 0 && !submissionNote.trim()) {
      show('Vui lòng nhập ghi chú.', 'error');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const existingSubmission = submissions.find(s => s.user_id === profile.id);

    let submissionId: string;

    if (existingSubmission) {
      await supabase.from('task_member_submissions')
        .update({ note: submissionNote.trim(), updated_at: new Date().toISOString() })
        .eq('id', existingSubmission.id);
      submissionId = existingSubmission.id;

      // Delete old links
      await supabase.from('task_member_submission_links')
        .delete().eq('submission_id', submissionId);
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
      submissionId = newSub.id;
    }

    // Insert links tied to checklist items
    const linksToInsert = checklistEntries
      .filter(e => e.url.trim())
      .map(e => ({
        submission_id: submissionId,
        checklist_item_id: e.checklistItemId,
        label_id: e.labelId || null,
        url: e.url.trim(),
        note: e.note.trim(),
      }));

    if (linksToInsert.length > 0) {
      await supabase.from('task_member_submission_links').insert(linksToInsert);
    }

    // Auto-tick checklist items that have results
    const completedItemIds = checklistEntries
      .filter(e => e.url.trim())
      .map(e => e.checklistItemId);

    if (completedItemIds.length > 0) {
      await supabase.from('task_checklists')
        .update({ is_checked: true })
        .in('id', completedItemIds);
    }

    // Un-tick items without results (in case of update removing a link)
    const uncompletedItemIds = checklistEntries
      .filter(e => !e.url.trim())
      .map(e => e.checklistItemId);

    if (uncompletedItemIds.length > 0) {
      await supabase.from('task_checklists')
        .update({ is_checked: false })
        .in('id', uncompletedItemIds);
    }

    await supabase.from('activity_logs').insert({
      user_id: profile.id, action: 'submit_result',
      detail: `Nộp kết quả (${completedItemIds.length} mục)`, task_id: task.id,
    });

    show('Đã nộp kết quả.', 'success');
    setEditingUserId(null);
    setSaving(false);
    fetchSubmissions();
    onRefresh();
  }, [submissionNote, checklistEntries, submissions, profile.id, task.id, show, fetchSubmissions, onRefresh]);

  const handleDelete = useCallback(async (submissionId: string) => {
    if (!window.confirm('Xóa báo cáo kết quả? Checklist liên quan sẽ được đánh dấu chưa hoàn thành.')) return;
    const supabase = createClient();

    // Get links to find checklist items to un-tick
    const { data: links } = await supabase.from('task_member_submission_links')
      .select('checklist_item_id').eq('submission_id', submissionId);
    const itemIds = (links || []).map(l => l.checklist_item_id).filter(Boolean) as string[];

    await supabase.from('task_member_submission_links').delete().eq('submission_id', submissionId);
    const { error } = await supabase.from('task_member_submissions').delete().eq('id', submissionId);

    if (error) {
      show('Lỗi xóa: ' + error.message, 'error');
    } else {
      // Un-tick related checklist items
      if (itemIds.length > 0) {
        await supabase.from('task_checklists').update({ is_checked: false }).in('id', itemIds);
      }

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

  const filledCount = checklistEntries.filter(e => e.url.trim()).length;

  // Edit form grouped by checklist items
  const renderEditForm = () => (
    <div className="pt-2 space-y-2.5">
      {/* Checklist items - each with its own link input */}
      {checklistEntries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
              Công việc được giao ({filledCount}/{checklistEntries.length})
            </span>
          </div>
          <div className="h-1 rounded-full bg-blue-200">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: checklistEntries.length > 0 ? `${Math.round((filledCount / checklistEntries.length) * 100)}%` : '0%',
                backgroundColor: filledCount === checklistEntries.length ? '#2E7D32' : '#0288D1',
              }}
            />
          </div>
          {checklistEntries.map((entry, idx) => (
            <div key={entry.checklistItemId} className={`rounded-lg border p-2.5 ${entry.url.trim() ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  entry.url.trim() ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {entry.url.trim() ? '\u2713' : idx + 1}
                </div>
                <span className="text-xs font-semibold text-gray-800">{entry.title}</span>
              </div>
              <div className="ml-6 space-y-1.5">
                <div className="flex gap-1.5 items-center">
                  <select
                    value={entry.labelId}
                    onChange={e => updateEntry(idx, 'labelId', e.target.value)}
                    className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-[100px] shrink-0"
                  >
                    <option value="">Nhãn...</option>
                    {linkLabels.map(ll => (
                      <option key={ll.id} value={ll.id}>{ll.name}</option>
                    ))}
                  </select>
                  <input
                    type="url"
                    value={entry.url}
                    onChange={e => updateEntry(idx, 'url', e.target.value)}
                    placeholder="Link kết quả *"
                    className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="file"
                    ref={el => { if (el) fileInputRefs.current.set(idx, el); }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadToDrive(idx, f);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current.get(idx)?.click()}
                    disabled={uploadingIdx !== null}
                    className="shrink-0 px-1.5 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                    title="Upload file lên Google Drive"
                  >
                    {uploadingIdx === idx ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    )}
                    <span className="hidden sm:inline">{uploadingIdx === idx ? 'Uploading...' : 'Drive'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={entry.note}
                  onChange={e => updateEntry(idx, 'note', e.target.value)}
                  placeholder="Ghi chú cho mục này..."
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* General note */}
      <textarea
        value={submissionNote}
        onChange={e => setSubmissionNote(e.target.value)}
        rows={2}
        placeholder="Ghi chú chung (tùy chọn)..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />

      {/* Warning */}
      {checklistEntries.length > 0 && filledCount < checklistEntries.length && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>Còn {checklistEntries.length - filledCount} mục chưa có link. Bạn cần hoàn thành tất cả để nộp.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Nộp kết quả'}
        </button>
        <button onClick={cancelEditing} className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-300">
          Hủy
        </button>
      </div>
    </div>
  );

  // Display card: group links by checklist item
  const renderSubmissionCard = (sub: TaskMemberSubmission) => {
    const isMyCard = sub.user_id === profile.id;
    const isEditingThis = editingUserId === sub.user_id;
    const canModify = isMyCard && isWorkingStatus;
    const links = sub.links || [];
    const checklistLinks = links.filter(l => l.checklist_item_id);
    const otherLinks = links.filter(l => !l.checklist_item_id);

    return (
      <div
        key={sub.id}
        className={`rounded-lg border transition-all ${
          isEditingThis
            ? 'border-purple-300 bg-purple-50 ring-1 ring-purple-200 p-3'
            : 'border-gray-200 hover:border-gray-300 p-2.5'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{ backgroundColor: isMyCard ? '#7B1FA2' : '#6B7280' }}
          >
            {(sub.user?.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-gray-800">
              {sub.user?.full_name || 'Unknown'}
            </span>
            {isMyCard && <span className="text-[10px] text-purple-500 ml-1">(Bạn)</span>}
            <span className="text-[10px] text-gray-400 ml-2">
              {new Date(sub.updated_at || sub.submitted_at).toLocaleDateString('vi-VN')}
            </span>
          </div>
          {canModify && !isEditingThis && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEditing(sub.user_id)} className="p-1 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50 transition-colors" title="Sửa">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button onClick={() => handleDelete(sub.id)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Xóa">
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
            {/* Checklist-linked results */}
            {checklistLinks.length > 0 && (
              <div className="space-y-1.5">
                {checklistLinks.map(link => (
                  <div key={link.id} className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <span className="text-[10px] font-medium text-gray-500 block">{link.checklist_item?.title || 'Checklist'}</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                        {link.url}
                      </a>
                      {link.note && <span className="text-[10px] text-gray-400 block">{link.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Other links */}
            {otherLinks.length > 0 && (
              <div className={`space-y-1 ${checklistLinks.length > 0 ? 'mt-1.5' : ''}`}>
                {otherLinks.map(link => (
                  <div key={link.id} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                      {link.link_label?.name || 'Link'}
                    </span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate">
                      {link.url}
                    </a>
                  </div>
                ))}
              </div>
            )}
            {sub.note && (
              <p className={`text-[13px] text-gray-600 whitespace-pre-wrap ${links.length > 0 ? 'mt-1.5' : ''}`}>{sub.note}</p>
            )}
            {!sub.note && links.length === 0 && (
              <p className="text-xs text-gray-400 italic">Chưa có nội dung.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Kết quả ({submittedCount}/{totalAssignees})
        </h4>
      </div>

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

      {/* Submission cards */}
      <div className="space-y-2">
        {submissions.map(sub => renderSubmissionCard(sub))}

        {/* Button to start new submission */}
        {canSubmit && !mySubmission && !editingUserId && (
          submissions.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-sm text-gray-400 mb-2">Chưa có editor nào nộp kết quả.</p>
              <button onClick={() => startEditing(profile.id)} className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                + Nộp kết quả
              </button>
            </div>
          ) : (
            <button
              onClick={() => startEditing(profile.id)}
              className="w-full rounded-lg border-2 border-dashed border-purple-200 py-2 text-xs text-purple-600 hover:bg-purple-50 hover:border-purple-300 transition-colors font-medium"
            >
              + Nộp kết quả của bạn
            </button>
          )
        )}

        {/* No submissions and can't submit */}
        {submissions.length === 0 && !canSubmit && !editingUserId && (
          <p className="text-sm text-gray-400 text-center py-3">Chưa có editor nào nộp kết quả.</p>
        )}
      </div>

      {/* New submission form (not yet in list) */}
      {editingUserId === profile.id && !mySubmission && (
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

      {allSubmitted && isWorkingStatus && (
        <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-green-700 font-medium">
            {isCreator
              ? 'Tất cả editor đã nộp. Bạn có thể gửi duyệt.'
              : isAdmin
                ? 'Tất cả editor đã nộp kết quả.'
                : 'Tất cả editor đã nộp. Đang chờ người tạo task gửi duyệt.'}
          </p>
        </div>
      )}
    </div>
  );
}
