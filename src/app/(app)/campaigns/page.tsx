'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/components/profile-context';
import { useToast } from '@/components/ui/toast';
import { isAdminOrAbove, formatDateVN } from '@/lib/utils';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/lib/constants';
import type { Campaign, Channel } from '@/lib/types';

type ModalMode = 'closed' | 'create' | 'edit';

// Valid next statuses for status transition buttons
const NEXT_STATUSES: Record<string, { value: string; label: string; color: string }[]> = {
  draft: [{ value: 'active', label: 'Kích hoạt', color: 'bg-green-600 hover:bg-green-700' }],
  active: [
    { value: 'paused', label: 'Tạm dừng', color: 'bg-amber-600 hover:bg-amber-700' },
    { value: 'ended', label: 'Kết thúc', color: 'bg-blue-600 hover:bg-blue-700' },
  ],
  paused: [
    { value: 'active', label: 'Tiếp tục', color: 'bg-green-600 hover:bg-green-700' },
    { value: 'ended', label: 'Kết thúc', color: 'bg-blue-600 hover:bg-blue-700' },
  ],
  ended: [],
  archived: [],
};

export default function CampaignsPage() {
  const profile = useProfile();
  const { show } = useToast();
  const isAdmin = isAdminOrAbove(profile.role);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStartAt, setFormStartAt] = useState('');
  const [formEndAt, setFormEndAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formChannelIds, setFormChannelIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [campRes, chRes] = await Promise.all([
        fetch('/api/campaigns', { credentials: 'include' }),
        fetch('/api/channels', { credentials: 'include' }),
      ]);
      const campData = await campRes.json();
      const chData = await chRes.json();

      if (campRes.ok) setCampaigns(campData.campaigns || []);
      if (chRes.ok) setAllChannels((chData.channels || []).filter((c: Channel) => c.status === 'active'));
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setLoading(false);
  }, [show]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCampaigns = showArchived
    ? campaigns
    : campaigns.filter(c => c.status !== 'archived');

  const openCreate = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setFormStartAt('');
    setFormEndAt('');
    setFormNotes('');
    setFormChannelIds([]);
    setEditingCampaign(null);
    setModalMode('create');
  }, []);

  const openEdit = useCallback((c: Campaign) => {
    setFormName(c.name);
    setFormDescription(c.description);
    setFormStartAt(c.start_at ? c.start_at.split('T')[0] : '');
    setFormEndAt(c.end_at ? c.end_at.split('T')[0] : '');
    setFormNotes(c.notes);
    setFormChannelIds(c.channels?.map(ch => ch.id) || []);
    setEditingCampaign(c);
    setModalMode('edit');
  }, []);

  const closeModal = useCallback(() => {
    setModalMode('closed');
    setEditingCampaign(null);
  }, []);

  const toggleChannel = useCallback((id: string) => {
    setFormChannelIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { show('Vui lòng nhập tên chiến dịch.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          start_at: formStartAt || null,
          end_at: formEndAt || null,
          notes: formNotes.trim(),
          channel_ids: formChannelIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi tạo chiến dịch', 'error');
      } else {
        show('Tạo chiến dịch thành công!', 'success');
        closeModal();
        loadData();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [formName, formDescription, formStartAt, formEndAt, formNotes, formChannelIds, show, closeModal, loadData]);

  const handleEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign) return;
    if (!formName.trim()) { show('Vui lòng nhập tên chiến dịch.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${editingCampaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          start_at: formStartAt || null,
          end_at: formEndAt || null,
          notes: formNotes.trim(),
          channel_ids: formChannelIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi cập nhật', 'error');
      } else {
        show('Cập nhật thành công!', 'success');
        closeModal();
        loadData();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [editingCampaign, formName, formDescription, formStartAt, formEndAt, formNotes, formChannelIds, show, closeModal, loadData]);

  const handleStatusChange = useCallback(async (campaign: Campaign, newStatus: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi chuyển trạng thái', 'error');
      } else {
        show(`Chuyển trạng thái: ${CAMPAIGN_STATUS_LABELS[campaign.status]} → ${CAMPAIGN_STATUS_LABELS[newStatus]}`, 'success');
        loadData();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadData]);

  const handleArchive = useCallback(async (campaign: Campaign) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'archive' }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi lưu trữ', 'error');
      } else {
        show(`Đã lưu trữ chiến dịch "${campaign.name}".`, 'success');
        loadData();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadData]);

  const handleRestore = useCallback(async (campaign: Campaign) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'restore' }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi khôi phục', 'error');
      } else {
        show(`Đã khôi phục chiến dịch "${campaign.name}".`, 'success');
        loadData();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadData]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500">Chỉ Admin mới có thể quản lý chiến dịch.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-800">Quản lý Chiến dịch</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="accent-blue-600"
            />
            Hiện đã lưu trữ
          </label>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            + Tạo chiến dịch
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Đang tải...</p>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Chưa có chiến dịch nào.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Mã</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Bắt đầu</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Kết thúc</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Kênh</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map(c => {
                  const statusColor = CAMPAIGN_STATUS_COLORS[c.status] || '#9E9E9E';
                  const nextStatuses = NEXT_STATUSES[c.status] || [];
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: statusColor }}
                        >
                          {CAMPAIGN_STATUS_LABELS[c.status] || c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDateVN(c.start_at)|| '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDateVN(c.end_at) || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.channels?.map(ch => (
                            <span key={ch.id} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                              {ch.name}
                            </span>
                          ))}
                          {(!c.channels || c.channels.length === 0) && (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {c.status !== 'archived' && (
                            <button
                              onClick={() => openEdit(c)}
                              className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            >
                              Sửa
                            </button>
                          )}
                          {nextStatuses.map(ns => (
                            <button
                              key={ns.value}
                              onClick={() => handleStatusChange(c, ns.value)}
                              className={`px-2.5 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${ns.color}`}
                            >
                              {ns.label}
                            </button>
                          ))}
                          {c.status !== 'archived' && (
                            <button
                              onClick={() => handleArchive(c)}
                              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              Lưu trữ
                            </button>
                          )}
                          {c.status === 'archived' && (
                            <button
                              onClick={() => handleRestore(c)}
                              className="px-2.5 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 rounded-md transition-colors"
                            >
                              Khôi phục
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit */}
      {modalMode !== 'closed' && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[80]" onClick={closeModal} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {modalMode === 'create' ? 'Tạo chiến dịch mới' : 'Chỉnh sửa chiến dịch'}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                  &times;
                </button>
              </div>

              <form
                onSubmit={modalMode === 'create' ? handleCreate : handleEdit}
                className="flex-1 overflow-y-auto flex flex-col"
              >
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tên chiến dịch <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nhập tên chiến dịch..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                    <textarea
                      value={formDescription}
                      onChange={e => setFormDescription(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Mô tả chiến dịch..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                      <input
                        type="date"
                        value={formStartAt}
                        onChange={e => setFormStartAt(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                      <input
                        type="date"
                        value={formEndAt}
                        onChange={e => setFormEndAt(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                    <textarea
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ghi chú..."
                    />
                  </div>

                  {/* Channel multi-select */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kênh triển khai</label>
                    <div className="border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                      {allChannels.length === 0 ? (
                        <p className="text-sm text-gray-400 italic px-1">Chưa có kênh nào</p>
                      ) : (
                        allChannels.map(ch => (
                          <label
                            key={ch.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-blue-50 transition-colors ${
                              formChannelIds.includes(ch.id) ? 'bg-blue-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formChannelIds.includes(ch.id)}
                              onChange={() => toggleChannel(ch.id)}
                              className="accent-blue-600"
                            />
                            <span className="text-sm">{ch.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {formChannelIds.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Đã chọn: {formChannelIds.length} kênh
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Đang lưu...' : modalMode === 'create' ? 'Tạo chiến dịch' : 'Cập nhật'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
