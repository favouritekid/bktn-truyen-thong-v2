'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/components/profile-context';
import { useToast } from '@/components/ui/toast';
import { isAdminOrAbove, formatDateVN } from '@/lib/utils';
import type { Channel } from '@/lib/types';

type ModalMode = 'closed' | 'create' | 'edit';

export default function ChannelsPage() {
  const profile = useProfile();
  const { show } = useToast();
  const isAdmin = isAdminOrAbove(profile.role);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels || []);
      } else {
        show(data.error || 'Lỗi tải danh sách kênh', 'error');
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setLoading(false);
  }, [show]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const filteredChannels = showArchived
    ? channels
    : channels.filter(c => c.status === 'active');

  const openCreate = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setEditingChannel(null);
    setModalMode('create');
  }, []);

  const openEdit = useCallback((ch: Channel) => {
    setFormName(ch.name);
    setFormDescription(ch.description);
    setEditingChannel(ch);
    setModalMode('edit');
  }, []);

  const closeModal = useCallback(() => {
    setModalMode('closed');
    setEditingChannel(null);
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { show('Vui lòng nhập tên kênh.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: formName.trim(), description: formDescription.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi tạo kênh', 'error');
      } else {
        show('Tạo kênh thành công!', 'success');
        closeModal();
        loadChannels();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [formName, formDescription, show, closeModal, loadChannels]);

  const handleEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    if (!formName.trim()) { show('Vui lòng nhập tên kênh.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${editingChannel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: formName.trim(), description: formDescription.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi cập nhật', 'error');
      } else {
        show('Cập nhật thành công!', 'success');
        closeModal();
        loadChannels();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [editingChannel, formName, formDescription, show, closeModal, loadChannels]);

  const handleToggleArchive = useCallback(async (ch: Channel) => {
    const newStatus = ch.status === 'active' ? 'archived' : 'active';
    const label = newStatus === 'archived' ? 'lưu trữ' : 'khôi phục';

    try {
      const res = await fetch(`/api/channels/${ch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || `Lỗi ${label}`, 'error');
      } else {
        show(`Đã ${label} kênh "${ch.name}".`, 'success');
        loadChannels();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadChannels]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500">Chỉ Admin mới có thể quản lý kênh.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-800">Quản lý Kênh</h2>
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
            + Thêm kênh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Đang tải...</p>
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Chưa có kênh nào.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên kênh</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Mô tả</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Ngày tạo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredChannels.map(ch => (
                  <tr key={ch.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{ch.name}</td>
                    <td className="px-4 py-3 text-gray-600">{ch.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        ch.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {ch.status === 'active' ? 'Hoạt động' : 'Lưu trữ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDateVN(ch.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(ch)}
                          className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleToggleArchive(ch)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            ch.status === 'active'
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {ch.status === 'active' ? 'Lưu trữ' : 'Khôi phục'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalMode !== 'closed' && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[80]" onClick={closeModal} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {modalMode === 'create' ? 'Thêm kênh mới' : 'Chỉnh sửa kênh'}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                  &times;
                </button>
              </div>

              <form
                onSubmit={modalMode === 'create' ? handleCreate : handleEdit}
                className="flex flex-col"
              >
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tên kênh <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nhập tên kênh..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                    <textarea
                      value={formDescription}
                      onChange={e => setFormDescription(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Mô tả kênh..."
                    />
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
                    {saving ? 'Đang lưu...' : modalMode === 'create' ? 'Tạo kênh' : 'Cập nhật'}
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
