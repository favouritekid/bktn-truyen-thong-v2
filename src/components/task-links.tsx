'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { Task, LinkLabel } from '@/lib/types';

interface TaskLinksProps {
  task: Task;
  onRefresh: () => void;
}

export default function TaskLinks({ task, onRefresh }: TaskLinksProps) {
  const profile = useProfile();
  const { show } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [labelId, setLabelId] = useState('');
  const [labels, setLabels] = useState<LinkLabel[]>([]);
  const [adding, setAdding] = useState(false);

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isAssignee = task.assignees?.some(a => a.id === profile.id) ?? false;
  const canEdit = isAdmin || isAssignee;

  const links = task.links || [];

  useEffect(() => {
    async function loadLabels() {
      const supabase = createClient();
      const { data } = await supabase
        .from('link_labels')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setLabels((data as LinkLabel[]) || []);
    }
    if (showForm) loadLabels();
  }, [showForm]);

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
    if (!url.trim()) {
      show('Vui lòng nhập URL.', 'error');
      return;
    }
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase.from('task_links').insert({
      task_id: task.id,
      url: url.trim(),
      label_id: labelId || null,
      note: note.trim(),
      created_by: profile.id,
    });

    if (error) {
      show('Lỗi thêm liên kết: ' + error.message, 'error');
    } else {
      setUrl('');
      setNote('');
      setLabelId('');
      setShowForm(false);
      await logActivity('add_link', `Thêm liên kết: ${url.trim()}`);
      onRefresh();
    }
    setAdding(false);
  }, [url, note, labelId, task.id, profile.id, show, logActivity, onRefresh]);

  const handleDelete = useCallback(async (linkId: string) => {
    const supabase = createClient();
    const link = links.find(l => l.id === linkId);
    const { error } = await supabase
      .from('task_links')
      .delete()
      .eq('id', linkId);

    if (error) {
      show('Lỗi xóa liên kết: ' + error.message, 'error');
    } else {
      await logActivity('delete_link', `Xóa liên kết: ${link?.url}`);
      onRefresh();
    }
  }, [links, show, logActivity, onRefresh]);

  // Simple label color based on name hash
  const getLabelColor = (name: string): string => {
    const colors = ['#1877F2', '#FE2C55', '#7C3AED', '#0068FF', '#2E7D32', '#E65100', '#0288D1'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">
          Liên kết {links.length > 0 && `(${links.length})`}
        </h4>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            + Thêm
          </button>
        )}
      </div>

      {/* Links list */}
      {links.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400 italic">Chưa có liên kết.</p>
      ) : (
        <div className="space-y-2">
          {links.map(link => (
            <div key={link.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-2 group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {link.link_label && (
                    <span
                      className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: getLabelColor(link.link_label.name) }}
                    >
                      {link.link_label.name}
                    </span>
                  )}
                  {link.note && (
                    <span className="text-xs text-gray-500">{link.note}</span>
                  )}
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {link.url}
                </a>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(link.id)}
                  className="text-red-400 hover:text-red-600 text-sm shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Xóa"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={labelId}
              onChange={e => setLabelId(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Nhãn --</option>
              {labels.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ghi chú (tùy chọn)"
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !url.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Thêm
            </button>
            <button
              onClick={() => { setShowForm(false); setUrl(''); setNote(''); setLabelId(''); }}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
