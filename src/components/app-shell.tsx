'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ProfileProvider } from './profile-context';
import { ToastProvider } from './ui/toast';
import type { Profile } from '@/lib/types';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/kanban', label: 'Kanban', icon: '📌' },
  { href: '/calendar', label: 'Lịch', icon: '📅' },
];

export default function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

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
            <button onClick={handleLogout} className="ml-1 bg-white/15 hover:bg-white/25 border border-white/30 text-white px-2 py-0.5 rounded text-[11px] transition-colors">
              Thoát
            </button>
          </div>
        </header>

        <nav className="bg-white border-b border-gray-200 px-6 flex gap-1">
          {NAV_ITEMS.map(item => (
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
      </ToastProvider>
    </ProfileProvider>
  );
}
