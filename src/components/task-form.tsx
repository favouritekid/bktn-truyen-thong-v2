'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONTENT_TYPES, PRIORITIES } from '@/lib/constants';
import { generateTaskId, getTaskMonth } from '@/lib/utils';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { Campaign, Channel, Profile, Task } from '@/lib/types';

interface TaskFormProps {
  task: Task | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export default function TaskForm({ task, onClose, onSaved }: TaskFormProps) {
  const profile = useProfile();
  const { show } = useToast();
  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  const isEditing = !!task;

  // Lock fields: Admin can edit in Bản nháp, Chờ duyệt KH, Đã duyệt, Đang làm
  // Editor can only edit in Bản nháp (and only gets "Sửa" button there)
  const adminEditableStatuses = ['Bản nháp', 'Chờ duyệt KH', 'Đã duyệt', 'Đang làm'];
  const fieldsLocked = isEditing && !(isAdmin
    ? adminEditableStatuses.includes(task.status)
    : task.status === 'Bản nháp'
  );

  const [title, setTitle] = useState('');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [contentType, setContentType] = useState<string>(CONTENT_TYPES[0]);
  const [priority, setPriority] = useState<string>(PRIORITIES[1]);
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [campaignId, setCampaignId] = useState<string>('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignChannels, setCampaignChannels] = useState<Channel[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [allEditors, setAllEditors] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  // Load editors for assignee selection
  useEffect(() => {
    async function loadEditors() {
      const supabase = createClient();
      let query = supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at, updated_at')
        .eq('is_active', true);

      // Editors can only see other editors; admin sees all
      if (!isAdmin) {
        query = query.eq('role', 'editor');
      }

      const { data } = await query.order('full_name');
      setAllEditors(data as Profile[] || []);
    }
    loadEditors();
  }, [isAdmin]);

  // Load campaigns for dropdown
  useEffect(() => {
    async function loadCampaigns() {
      const supabase = createClient();
      const { data } = await supabase
        .from('campaigns')
        .select('id, code, name, status')
        .eq('status', 'active')
        .order('name');
      setCampaigns(data as Campaign[] || []);
    }
    loadCampaigns();
  }, []);

  // Load channels for selected campaign
  useEffect(() => {
    if (!campaignId) {
      setCampaignChannels([]);
      return;
    }
    async function loadCampaignChannels() {
      const supabase = createClient();
      const { data } = await supabase
        .from('campaign_channels')
        .select('channel_id, channels:channels(id, name, description, status, created_at, updated_at)')
        .eq('campaign_id', campaignId);

      const channels = ((data || []) as unknown as { channel_id: string; channels: Channel | Channel[] }[])
        .map(row => Array.isArray(row.channels) ? row.channels[0] : row.channels)
        .filter((ch): ch is Channel => !!ch && ch.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name));

      setCampaignChannels(channels);
    }
    loadCampaignChannels();
  }, [campaignId]);

  // Handle campaign change - reset channels if not in new campaign's channels
  const handleCampaignChange = useCallback((newCampaignId: string) => {
    setCampaignId(newCampaignId);
    setSelectedChannelIds([]); // Reset channels when campaign changes
  }, []);

  const toggleChannel = useCallback((channelId: string) => {
    if (fieldsLocked) return;
    setSelectedChannelIds(prev =>
      prev.includes(channelId) ? prev.filter(x => x !== channelId) : [...prev, channelId]
    );
  }, [fieldsLocked]);

  // Populate form when editing
  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setSelectedChannelIds(task.channels?.map(c => c.id) || []);
      setContentType(task.content_type || CONTENT_TYPES[0]);
      setPriority(task.priority || PRIORITIES[1]);
      setDeadline(task.deadline ? task.deadline.substring(0, 16) : '');
      setCampaignId(task.campaign_id || '');
      setDescription(task.description || '');
      setAdminNote(task.admin_note || '');
      setSelectedAssignees(task.assignees?.map(a => a.id) || []);
    }
  }, [task]);

  const toggleAssignee = useCallback((id: string) => {
    if (fieldsLocked) return;
    setSelectedAssignees(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, [fieldsLocked]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) { show('Vui lòng nhập tiêu đề.', 'error'); return; }
    if (selectedChannelIds.length === 0) { show('Vui lòng chọn ít nhất 1 kênh.', 'error'); return; }
    if (!campaignId) { show('Vui lòng chọn chiến dịch.', 'error'); return; }
    if (!deadline) { show('Vui lòng chọn deadline.', 'error'); return; }
    if (!isEditing && new Date(deadline) < new Date()) {
      show('Thời hạn không được ở quá khứ.', 'error');
      return;
    }
    if (selectedAssignees.length === 0) { show('Vui lòng chọn ít nhất một người phụ trách.', 'error'); return; }

    setSaving(true);
    const supabase = createClient();

    if (isEditing) {
      // Update task
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      // Only update non-locked fields, or all if not locked
      if (!fieldsLocked) {
        updates.title = title.trim();
        updates.campaign_id = campaignId;
        updates.content_type = contentType;
        updates.priority = priority;
        updates.deadline = deadline;
        updates.description = description;
      }

      // Admin note is always editable by admin
      if (isAdmin) {
        updates.admin_note = adminNote;
      }

      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', task.id);

      if (error) {
        show('Lỗi cập nhật: ' + error.message, 'error');
        setSaving(false);
        return;
      }

      // Update assignees and channels (only if not locked)
      if (!fieldsLocked) {
        // Remove old assignees
        await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', task.id);

        // Insert new assignees
        if (selectedAssignees.length > 0) {
          await supabase
            .from('task_assignees')
            .upsert(selectedAssignees.map(uid => ({ task_id: task.id, user_id: uid })), { ignoreDuplicates: true });
        }

        // Remove old channels
        await supabase
          .from('task_channels')
          .delete()
          .eq('task_id', task.id);

        // Insert new channels
        if (selectedChannelIds.length > 0) {
          await supabase
            .from('task_channels')
            .insert(selectedChannelIds.map(cid => ({ task_id: task.id, channel_id: cid })));
        }
      }

      // Rename Drive folder if title changed and task may have uploads
      if (!fieldsLocked && title.trim() !== (task.title || '') && task.title) {
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
                type: 'task',
                campaignName: task.campaign?.name || 'Không có chiến dịch',
                taskMonth: getTaskMonth(task.deadline),
                oldName: task.title,
                newName: title.trim(),
              }),
            });
          }
        } catch {
          // Drive rename is best-effort, don't block task update
        }
      }

      // Log
      await supabase.from('activity_logs').insert({
        user_id: profile.id,
        action: 'edit_task',
        detail: `Cập nhật task: ${title}`,
        task_id: task.id,
      });

      show('Đã cập nhật task.', 'success');
    } else {
      // Create new task
      const newId = generateTaskId();

      const { error } = await supabase
        .from('tasks')
        .insert({
          id: newId,
          title: title.trim(),
          campaign_id: campaignId,
          content_type: contentType,
          priority,
          deadline,
          description,
          admin_note: isAdmin ? adminNote : '',
          status: 'Bản nháp',
          created_by: profile.id,
        });

      if (error) {
        show('Lỗi tạo task: ' + error.message, 'error');
        setSaving(false);
        return;
      }

      // Insert assignees
      if (selectedAssignees.length > 0) {
        await supabase
          .from('task_assignees')
          .insert(selectedAssignees.map(uid => ({ task_id: newId, user_id: uid })));
      }

      // Insert channels
      if (selectedChannelIds.length > 0) {
        await supabase
          .from('task_channels')
          .insert(selectedChannelIds.map(cid => ({ task_id: newId, channel_id: cid })));
      }

      // Log
      await supabase.from('activity_logs').insert({
        user_id: profile.id,
        action: 'create_task',
        detail: `Tạo task mới: ${title}`,
        task_id: newId,
      });

      show('Đã tạo task mới.', 'success');
    }

    setSaving(false);
    onSaved();
    onClose();
  }, [title, selectedChannelIds, campaignId, contentType, priority, deadline, description, adminNote, selectedAssignees, isEditing, fieldsLocked, isAdmin, task, profile.id, show, onSaved, onClose]);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">
              {isEditing ? 'Chỉnh sửa Task' : 'Tạo Task mới'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              &times;
            </button>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tiêu đề <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={fieldsLocked}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="Nhập tiêu đề..."
              />
            </div>

            {/* Campaign */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Chiến dịch <span className="text-red-500">*</span>
              </label>
              <select
                value={campaignId}
                onChange={e => handleCampaignChange(e.target.value)}
                disabled={fieldsLocked}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">-- Chọn chiến dịch --</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Channel (multi-select) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kênh truyền thông <span className="text-red-500">*</span>
              </label>
              {!campaignId ? (
                <p className="text-sm text-gray-400 italic border border-gray-200 rounded-lg px-3 py-2">Chọn chiến dịch trước</p>
              ) : campaignChannels.length === 0 ? (
                <p className="text-sm text-gray-400 italic border border-gray-200 rounded-lg px-3 py-2">Chiến dịch chưa có kênh</p>
              ) : (
                <div className="border border-gray-300 rounded-lg p-2 flex flex-wrap gap-2">
                  {campaignChannels.map(c => (
                    <label
                      key={c.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md cursor-pointer text-sm transition-colors border ${
                        selectedChannelIds.includes(c.id)
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      } ${fieldsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannelIds.includes(c.id)}
                        onChange={() => toggleChannel(c.id)}
                        disabled={fieldsLocked}
                        className="accent-blue-600"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
              {selectedChannelIds.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">Đã chọn: {selectedChannelIds.length} kênh</p>
              )}
            </div>

            {/* Content Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loại nội dung
              </label>
              <select
                value={contentType}
                onChange={e => setContentType(e.target.value)}
                disabled={fieldsLocked}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                {CONTENT_TYPES.map(ct => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>

            {/* Priority + Deadline row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mức ưu tiên</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  disabled={fieldsLocked}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deadline <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  disabled={fieldsLocked}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả / Nội dung</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={fieldsLocked}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                placeholder="Mô tả chi tiết nội dung cần thực hiện..."
              />
            </div>

            {/* Assignees */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Người phụ trách <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                {allEditors.length === 0 ? (
                  <p className="text-sm text-gray-400 italic px-1">Đang tải...</p>
                ) : (
                  allEditors.map(editor => (
                    <label
                      key={editor.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-blue-50 transition-colors ${
                        selectedAssignees.includes(editor.id) ? 'bg-blue-50' : ''
                      } ${fieldsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAssignees.includes(editor.id)}
                        onChange={() => toggleAssignee(editor.id)}
                        disabled={fieldsLocked}
                        className="accent-blue-600"
                      />
                      <span className="text-sm">{editor.full_name}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">{editor.role === 'admin' || editor.role === 'super_admin' ? 'Admin' : 'NV'}</span>
                    </label>
                  ))
                )}
              </div>
              {selectedAssignees.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Đã chọn: {selectedAssignees.length} người
                </p>
              )}
            </div>

            {/* Admin Note */}
            {(isAdmin || (isEditing && task?.admin_note)) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú Admin
                  {!isAdmin && <span className="text-xs text-gray-400 ml-1">(chỉ đọc)</span>}
                </label>
                {isAdmin ? (
                  <textarea
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    rows={2}
                    className="w-full border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Ghi chú cho nhân viên..."
                  />
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 whitespace-pre-wrap">
                    {task?.admin_note}
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo Task'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
