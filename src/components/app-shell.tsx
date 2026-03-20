'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ProfileProvider } from './profile-context';
import { ToastProvider, useToast } from './ui/toast';
import PasswordInput from './ui/password-input';
import { isAdminOrAbove } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import type { Profile } from '@/lib/types';

const NAV_ITEMS = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  },
  {
    href: '/kanban', label: 'Kanban',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" /></svg>,
  },
  {
    href: '/calendar', label: 'Lịch',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  },
];

const ADMIN_NAV_ITEMS = [
  {
    href: '/users', label: 'Nhân viên',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  },
  {
    href: '/campaigns', label: 'Chiến dịch',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>,
  },
  {
    href: '/channels', label: 'Kênh',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" /></svg>,
  },
  {
    href: '/link-labels', label: 'Nhãn link',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>,
  },
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
      <div className="fixed inset-0 bg-black/30 z-[80]" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Đổi mật khẩu</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mật khẩu hiện tại</label>
                <PasswordInput value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Nhập mật khẩu hiện tại" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mật khẩu mới</label>
                <PasswordInput value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Xác nhận mật khẩu mới</label>
                <PasswordInput value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu mới" />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">Hủy</button>
              <button type="submit" disabled={saving} className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm rounded-md transition-colors disabled:opacity-50">
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
  const [collapsed, setCollapsed] = useState(false);

  // Restore sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  const navItems = useMemo(() => {
    if (isAdminOrAbove(profile.role)) {
      return { main: NAV_ITEMS, admin: ADMIN_NAV_ITEMS };
    }
    return { main: NAV_ITEMS, admin: [] };
  }, [profile.role]);

  const roleLabel = ROLE_LABELS[profile.role] || profile.role.toUpperCase();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <ProfileProvider profile={profile}>
      <ToastProvider>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className={`flex flex-col bg-white border-r border-gray-200 shrink-0 transition-all duration-200 ${collapsed ? 'w-[52px]' : 'w-[220px]'}`}>
            {/* Logo area */}
            <div className="h-12 flex items-center px-3 border-b border-gray-100 shrink-0">
              {!collapsed ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-semibold text-gray-900 truncate">BKTN Truyền thông</span>
                  <button onClick={toggleCollapsed} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button onClick={toggleCollapsed} className="p-1 mx-auto text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-2 px-2">
              {/* Main nav */}
              <div className="space-y-0.5">
                {navItems.main.map(item => {
                  const isActive = pathname === item.href;
                  return (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 rounded-md transition-colors ${
                        collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-1.5'
                      } ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <span className={`shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>{item.icon}</span>
                      {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Admin section */}
              {navItems.admin.length > 0 && (
                <>
                  {!collapsed && (
                    <div className="mt-4 mb-1.5 px-2.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Quản trị</span>
                    </div>
                  )}
                  {collapsed && <div className="my-2 mx-2 border-t border-gray-100" />}
                  <div className="space-y-0.5">
                    {navItems.admin.map(item => {
                      const isActive = pathname === item.href;
                      return (
                        <button
                          key={item.href}
                          onClick={() => router.push(item.href)}
                          title={collapsed ? item.label : undefined}
                          className={`w-full flex items-center gap-2.5 rounded-md transition-colors ${
                            collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-1.5'
                          } ${
                            isActive
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <span className={`shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>{item.icon}</span>
                          {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </nav>

            {/* User section at bottom */}
            <div className="border-t border-gray-100 p-2 shrink-0">
              {!collapsed ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{profile.full_name}</p>
                      <p className="text-[10px] text-gray-400">{roleLabel}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 px-1">
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="flex-1 text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-1 rounded transition-colors"
                    >
                      Đổi MK
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex-1 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 py-1 rounded transition-colors"
                    >
                      Đăng xuất
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold" title={`${profile.full_name} (${roleLabel})`}>
                    {profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <button onClick={handleLogout} title="Đăng xuất" className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto">
            <div className="px-6 py-4">
              {children}
            </div>
          </main>
        </div>

        <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      </ToastProvider>
    </ProfileProvider>
  );
}
