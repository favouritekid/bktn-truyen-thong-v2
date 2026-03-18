'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/components/profile-context';
import { useToast } from '@/components/ui/toast';
import { isAdminOrAbove, formatDateVN } from '@/lib/utils';
import type { LinkLabel } from '@/lib/types';

type ModalMode = 'closed' | 'create' | 'edit';

export default function LinkLabelsPage() {
  const profile = useProfile();
  const { show } = useToast();
  const isAdmin = isAdminOrAbove(profile.role);

  const [labels, setLabels] = useState<LinkLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingLabel, setEditingLabel] = useState<LinkLabel | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');

  const loadLabels = useCallback(async () => {
    try {
      const res = await fetch('/api/link-labels', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setLabels(data.link_labels || []);
      } else {
        show(data.error || 'Lỗi tải danh sách nhãn', 'error');
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setLoading(false);
  }, [show]);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  const openCreate = useCallback(() => {
    setFormName('');
    setEditingLabel(null);
    setModalMode('create');
  }, []);

  const openEdit = useCallback((label: LinkLabel) => {
    setFormName(label.name);
    setEditingLabel(label);
    setModalMode('edit');
  }, []);

  const closeModal = useCallback(() => {
    setModalMode('closed');
    setEditingLabel(null);
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { show('Vui lòng nhập tên nhãn.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/link-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: formName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi tạo nhãn', 'error');
      } else {
        show('Tạo nhãn thành công!', 'success');
        closeModal();
        loadLabels();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [formName, show, closeModal, loadLabels]);

  const handleEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLabel) return;
    if (!formName.trim()) { show('Vui lòng nhập tên nhãn.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/link-labels/${editingLabel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: formName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi cập nhật', 'error');
      } else {
        show('Cập nhật thành công!', 'success');
        closeModal();
        loadLabels();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [editingLabel, formName, show, closeModal, loadLabels]);

  const handleToggleActive = useCallback(async (label: LinkLabel) => {
    const newActive = !label.is_active;
    const action = newActive ? 'kích hoạt' : 'vô hiệu hóa';

    try {
      const res = await fetch(`/api/link-labels/${label.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: newActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || `Lỗi ${action}`, 'error');
      } else {
        show(`Đã ${action} nhãn "${label.name}".`, 'success');
        loadLabels();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadLabels]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500">Chỉ Admin mới có thể quản lý nhãn link.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-800">Quản lý Nhãn Link</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          + Thêm nhãn
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Đang tải...</p>
        </div>
      ) : labels.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Chưa có nhãn nào.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên nhãn</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Ngày tạo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {labels.map(label => (
                  <tr key={label.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{label.name}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(label)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                          label.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                        title={label.is_active ? 'Nhấn để vô hiệu hóa' : 'Nhấn để kích hoạt'}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          label.is_active ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        {label.is_active ? 'Hoạt động' : 'Đã tắt'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDateVN(label.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(label)}
                          className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        >
                          Sửa
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
                  {modalMode === 'create' ? 'Thêm nhãn mới' : 'Chỉnh sửa nhãn'}
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
                      Tên nhãn <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nhập tên nhãn..."
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
                    {saving ? 'Đang lưu...' : modalMode === 'create' ? 'Tạo nhãn' : 'Cập nhật'}
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
