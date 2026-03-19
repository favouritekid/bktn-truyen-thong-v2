'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { LinkLabel, Task, TaskMemberSubmission, TaskMemberSubmissionLink } from '@/lib/types';

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
  const [loading, setLoading] = useState(true);
  const [linkLabels, setLinkLabels] = useState<LinkLabel[]>([]);

  // Form state for current editor's submission
  const [editingSubmission, setEditingSubmission] = useState(false);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionLinks, setSubmissionLinks] = useState<{ labelId: string; url: string; note: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isAssignee = task.assignees?.some(a => a.id === profile.id) ?? false;
  const canSubmit = isAssignee && ['Đang làm', 'Cần sửa'].includes(task.status);

  // Load link labels
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

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`submissions-${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_member_submissions', filter: `task_id=eq.${task.id}` }, () => {
        fetchSubmissions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_member_submission_links' }, () => {
        fetchSubmissions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [task.id, fetchSubmissions]);

  // Start editing my submission
  const startEditing = useCallback(() => {
    const mySubmission = submissions.find(s => s.user_id === profile.id);
    if (mySubmission) {
      setSubmissionNote(mySubmission.note || '');
      setSubmissionLinks(
        (mySubmission.links || []).map(l => ({ labelId: l.label_id || '', url: l.url, note: l.note }))
      );
    } else {
      setSubmissionNote('');
      setSubmissionLinks([{ labelId: '', url: '', note: '' }]);
    }
    setEditingSubmission(true);
  }, [submissions, profile.id]);

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

    // Check if there's an existing submission for this user+task
    const existingSubmission = submissions.find(s => s.user_id === profile.id);

    if (existingSubmission) {
      // Update existing
      await supabase
        .from('task_member_submissions')
        .update({ note: submissionNote.trim(), updated_at: new Date().toISOString() })
        .eq('id', existingSubmission.id);

      // Delete old links and re-insert
      await supabase
        .from('task_member_submission_links')
        .delete()
        .eq('submission_id', existingSubmission.id);

      if (validLinks.length > 0) {
        await supabase
          .from('task_member_submission_links')
          .insert(validLinks.map(l => ({
            submission_id: existingSubmission.id,
            label_id: l.labelId || null,
            url: l.url.trim(),
            note: l.note.trim(),
          })));
      }
    } else {
      // Create new
      const { data: newSub, error } = await supabase
        .from('task_member_submissions')
        .insert({
          task_id: task.id,
          user_id: profile.id,
          note: submissionNote.trim(),
        })
        .select('id')
        .single();

      if (error || !newSub) {
        show('Lỗi nộp kết quả: ' + (error?.message || 'Unknown'), 'error');
        setSaving(false);
        return;
      }

      if (validLinks.length > 0) {
        await supabase
          .from('task_member_submission_links')
          .insert(validLinks.map(l => ({
            submission_id: newSub.id,
            label_id: l.labelId || null,
            url: l.url.trim(),
            note: l.note.trim(),
          })));
      }
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: profile.id,
      action: 'submit_result',
      detail: `Nộp/cập nhật kết quả`,
      task_id: task.id,
    });

    show('Đã nộp kết quả.', 'success');
    setEditingSubmission(false);
    setSaving(false);
    fetchSubmissions();
    onRefresh();
  }, [submissionNote, submissionLinks, submissions, profile.id, task.id, show, fetchSubmissions, onRefresh]);

  const totalAssignees = task.assignees?.length || 0;
  const submittedCount = submissions.length;
  const allSubmitted = totalAssignees > 0 && submittedCount >= totalAssignees;
  const isCreator = task.created_by === profile.id;
  const mySubmission = submissions.find(s => s.user_id === profile.id);

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Kết quả ({submittedCount}/{totalAssignees} editor đã nộp)
        </h4>
        {canSubmit && !editingSubmission && (
          <button onClick={startEditing} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
            {mySubmission ? 'Cập nhật kết quả' : '+ Nộp kết quả'}
          </button>
        )}
      </div>

      {/* Progress indicator */}
      {totalAssignees > 0 && (
        <div className="h-1.5 rounded-full bg-gray-200 mb-3">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.round((submittedCount / totalAssignees) * 100)}%`,
              backgroundColor: allSubmitted ? '#2E7D32' : '#7B1FA2',
            }}
          />
        </div>
      )}

      {/* Editor submission form */}
      {editingSubmission && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3 mb-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Ghi chú</label>
            <textarea
              value={submissionNote}
              onChange={e => setSubmissionNote(e.target.value)}
              rows={2}
              placeholder="Ghi chú về kết quả..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Link kết quả</label>
            <div className="space-y-2">
              {submissionLinks.map((link, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select
                    value={link.labelId}
                    onChange={e => updateLinkRow(idx, 'labelId', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-[120px] shrink-0"
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
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="text"
                    value={link.note}
                    onChange={e => updateLinkRow(idx, 'note', e.target.value)}
                    placeholder="Mô tả"
                    className="w-[100px] border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {submissionLinks.length > 1 && (
                    <button onClick={() => removeLinkRow(idx)} className="text-red-400 hover:text-red-600 text-sm shrink-0 py-1.5">&times;</button>
                  )}
                </div>
              ))}
              <button onClick={addLinkRow} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
                + Thêm link
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving} className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Nộp kết quả'}
            </button>
            <button onClick={() => setEditingSubmission(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Display all submissions */}
      {submissions.length === 0 && !editingSubmission ? (
        <p className="text-sm text-gray-400 text-center py-3">Chưa có editor nào nộp kết quả.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => (
            <div key={sub.id} className={`rounded-lg border p-3 ${sub.user_id === profile.id ? 'border-purple-200 bg-purple-50/50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700">
                  {sub.user?.full_name || 'Unknown'}
                  {sub.user_id === profile.id && <span className="text-purple-500 ml-1">(Bạn)</span>}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(sub.updated_at || sub.submitted_at).toLocaleDateString('vi-VN')}
                </span>
              </div>
              {sub.note && (
                <p className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">{sub.note}</p>
              )}
              {sub.links && sub.links.length > 0 && (
                <div className="space-y-1">
                  {sub.links.map(link => (
                    <div key={link.id} className="flex items-center gap-2 text-sm">
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                        {link.link_label?.name || 'Link'}
                      </span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all truncate">
                        {link.url}
                      </a>
                      {link.note && <span className="text-gray-400 text-xs shrink-0">({link.note})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info: all submitted status */}
      {allSubmitted && !isAdmin && isCreator && ['Đang làm'].includes(task.status) && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-sm text-green-700 font-medium">
            Tất cả editor đã nộp kết quả. Bạn có thể gửi duyệt.
          </p>
        </div>
      )}
    </div>
  );
}
