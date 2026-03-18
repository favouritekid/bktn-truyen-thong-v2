'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ProfileProvider } from './profile-context';
import { ToastProvider, useToast } from './ui/toast';
import PasswordInput from './ui/password-input';
import type { Profile } from '@/lib/types';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/kanban', label: 'Kanban', icon: '📌' },
  { href: '/calendar', label: 'Lịch', icon: '📅' },
];

const ADMIN_NAV_ITEMS = [
  { href: '/users', label: 'Nhân viên', icon: '👥' },
];

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { show } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) { show('Vui lòng nhập mật khẩu hiện tại.', 'error'); return; }
    if (newPassword.length < 6) { show('Mật khẩu mới phải có ít nhất 6 ký tự.', 'error'); return; }
    if (newPassword !== confirmPassword) { show('Xác nhận mật khẩu không khớp.', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        show(data.error || 'Lỗi đổi mật khẩu', 'error');
      } else {
        show('Đổi mật khẩu thành công!', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      }
    } catch {
      show('Lỗi kết nối server', 'error');
    }
    setSaving(false);
  }, [currentPassword, newPassword, confirmPassword, show, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Đổi mật khẩu</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              &times;
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu hiện tại <span className="text-red-500">*</span>
                </label>
                <PasswordInput
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                />
              </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                />
              </div>
            </div>

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
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const navItems = useMemo(() => {
    if (profile.role === 'admin') {
      return [...NAV_ITEMS, ...ADMIN_NAV_ITEMS];
    }
    return NAV_ITEMS;
  }, [profile.role]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <ProfileProvider profile={profile}>
      <ToastProvider>
        <header className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
          <div>
            <h1 className="text-lg font-semibold">Quản lý Truyền thông</h1>
            <p className="text-xs opacity-80">Trường CĐ Bách khoa Tây Nguyên</p>
          </div>
          <div className="flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full text-sm">
            <span>{profile.name}</span>
            <span className="bg-white/25 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
              {profile.role === 'admin' ? 'ADMIN' : 'NV'}
            </span>
            <button
              onClick={() => setShowChangePassword(true)}
              className="ml-1 bg-white/15 hover:bg-white/25 border border-white/30 text-white px-2 py-0.5 rounded text-[11px] transition-colors"
              title="Đổi mật khẩu"
            >
              Đổi MK
            </button>
            <button onClick={handleLogout} className="bg-white/15 hover:bg-white/25 border border-white/30 text-white px-2 py-0.5 rounded text-[11px] transition-colors">
              Thoát
            </button>
          </div>
        </header>

        <nav className="bg-white border-b border-gray-200 px-6 flex gap-1">
          {navItems.map(item => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                pathname === item.href
                  ? 'text-blue-700 border-blue-700'
                  : 'text-gray-500 border-transparent hover:text-blue-600'
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <main className="max-w-[1400px] mx-auto p-4">
          {children}
        </main>

        <ChangePasswordModal
          open={showChangePassword}
          onClose={() => setShowChangePassword(false)}
        />
      </ToastProvider>
    </ProfileProvider>
  );
}
