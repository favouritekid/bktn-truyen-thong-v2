'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/components/profile-context';
import { useToast } from '@/components/ui/toast';
import PasswordInput from '@/components/ui/password-input';
import { isAdminOrAbove, isSuperAdmin, formatDateVN } from '@/lib/utils';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import type { Profile } from '@/lib/types';

type ModalMode = 'closed' | 'create' | 'edit' | 'reset-password';

export default function UsersPage() {
  const profile = useProfile();
  const { show } = useToast();
  const isAdmin = isAdminOrAbove(profile.role);
  const isSA = isSuperAdmin(profile.role);

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'editor'>('editor');

  // Reset password field
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    // Admin only sees editors, super_admin sees all
    if (!isSA) {
      query = query.eq('role', 'editor');
    }

    const { data, error } = await query;

    if (error) {
      show('Lỗi tải danh sách nhân viên: ' + error.message, 'error');
    } else {
      setUsers((data as Profile[]) || []);
    }
    setLoading(false);
  }, [show, isSA]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Role options based on caller role
  const availableRoles = isSA
    ? [{ value: 'admin', label: 'Admin (Quản trị)' }, { value: 'editor', label: 'Editor (Nhân viên)' }]
    : [{ value: 'editor', label: 'Editor (Nhân viên)' }];

  const openCreate = useCallback(() => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('editor');
    setEditingUser(null);
    setModalMode('create');
  }, []);

  const openEdit = useCallback((user: Profile) => {
    setFormName(user.full_name);
    setFormEmail(user.email);
    setFormRole(user.role === 'super_admin' ? 'admin' : user.role as 'admin' | 'editor');
    setEditingUser(user);
    setModalMode('edit');
  }, []);

  const openResetPassword = useCallback((user: Profile) => {
    setNewPassword('');
    setEditingUser(user);
    setModalMode('reset-password');
  }, []);

  const closeModal = useCallback(() => {
    setModalMode('closed');
    setEditingUser(null);
  }, []);

  // Create user
  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) { show('Vui lòng nhập tên.', 'error'); return; }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail)) { show('Email không hợp lệ.', 'error'); return; }

    if (formPassword.length < 6) { show('Mật khẩu phải có ít nhất 6 ký tự.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: formEmail.trim(),
          password: formPassword,
          full_name: formName.trim(),
          role: formRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi tạo nhân viên', 'error');
      } else {
        show('Tạo nhân viên thành công!', 'success');
        closeModal();
        loadUsers();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [formName, formEmail, formPassword, formRole, show, closeModal, loadUsers]);

  // Edit user
  const handleEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!formName.trim()) { show('Vui lòng nhập tên.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: formName.trim(),
          role: formRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi cập nhật', 'error');
      } else {
        show('Cập nhật thành công!', 'success');
        closeModal();
        loadUsers();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [editingUser, formName, formRole, show, closeModal, loadUsers]);

  // Toggle is_active
  const handleToggleActive = useCallback(async (user: Profile) => {
    const newActive = !user.is_active;
    const label = newActive ? 'kích hoạt' : 'vô hiệu hóa';

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: newActive }),
      });

      const data = await res.json();
      if (!res.ok) {
        show(data.error || `Lỗi ${label}`, 'error');
      } else {
        show(`Đã ${label} tài khoản ${user.full_name}.`, 'success');
        loadUsers();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadUsers]);

  // Reset password
  const handleResetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (newPassword.length < 6) {
      show('Mật khẩu phải có ít nhất 6 ký tự.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi đặt lại mật khẩu', 'error');
      } else {
        show(`Đã đặt lại mật khẩu cho ${editingUser.full_name}.`, 'success');
        closeModal();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [editingUser, newPassword, show, closeModal]);

  // Delete user
  const handleDelete = useCallback(async (user: Profile) => {
    if (!confirm(`Bạn có chắc muốn xoá nhân viên "${user.full_name}" (${user.email})?\n\nHành động này không thể hoàn tác!`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi xoá nhân viên', 'error');
      } else {
        show(`Đã xoá nhân viên ${user.full_name}.`, 'success');
        loadUsers();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
  }, [show, loadUsers]);

  // Non-admin guard
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500">Chỉ Admin mới có thể quản lý nhân viên.</p>
        </div>
      </div>
    );
  }

  function formatDateTime(dt: string | undefined) {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${formatDateVN(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // Check if caller can manage this user
  function canManage(user: Profile) {
    if (user.role === 'super_admin') return false;
    if (isSA) return true;
    // admin can only manage editors
    return user.role === 'editor';
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-800">Quản lý Nhân viên</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          + Thêm nhân viên
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Đang tải...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Chưa có nhân viên nào.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Vai trò</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Đăng nhập cuối</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Hoạt động cuối</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.editor;
                  const manageable = canManage(user);
                  return (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{user.full_name}</td>
                      <td className="px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${roleColor.bg} ${roleColor.text}`}
                        >
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => manageable && handleToggleActive(user)}
                          disabled={!manageable}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                            user.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          } ${!manageable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                          title={manageable ? (user.is_active ? 'Nhấn để vô hiệu hóa' : 'Nhấn để kích hoạt') : ''}
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            user.is_active ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          {user.is_active ? 'Hoạt động' : 'Đã khóa'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDateTime(user.last_login_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDateTime(user.last_activity_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {manageable && (
                            <>
                              <button
                                onClick={() => openEdit(user)}
                                className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Chỉnh sửa"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => openResetPassword(user)}
                                className="px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                                title="Đặt lại mật khẩu"
                              >
                                Đổi MK
                              </button>
                              {user.id !== profile.id && (
                                <button
                                  onClick={() => handleDelete(user)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                  title="Xoá nhân viên"
                                >
                                  Xoá
                                </button>
                              )}
                            </>
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
      {(modalMode === 'create' || modalMode === 'edit') && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[80]" onClick={closeModal} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {modalMode === 'create' ? 'Thêm nhân viên mới' : 'Chỉnh sửa nhân viên'}
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
                      Họ tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nhập họ tên..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      disabled={modalMode === 'edit'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="email@example.com"
                    />
                    {modalMode === 'edit' && (
                      <p className="text-xs text-gray-400 mt-1">Email không thể thay đổi</p>
                    )}
                  </div>

                  {modalMode === 'create' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mật khẩu <span className="text-red-500">*</span>
                      </label>
                      <PasswordInput
                        value={formPassword}
                        onChange={e => setFormPassword(e.target.value)}
                        placeholder="Tối thiểu 6 ký tự"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vai trò <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formRole}
                      onChange={e => setFormRole(e.target.value as 'admin' | 'editor')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableRoles.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
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
                    {saving
                      ? 'Đang lưu...'
                      : modalMode === 'create'
                      ? 'Tạo nhân viên'
                      : 'Cập nhật'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Modal: Reset Password */}
      {modalMode === 'reset-password' && editingUser && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[80]" onClick={closeModal} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  Đặt lại mật khẩu
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                  &times;
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="flex flex-col">
                <div className="px-5 py-4 space-y-4">
                  <p className="text-sm text-gray-600">
                    Đặt mật khẩu mới cho <strong>{editingUser.full_name}</strong> ({editingUser.email})
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mật khẩu mới <span className="text-red-500">*</span>
                    </label>
                    <PasswordInput
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
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
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
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
