'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/ui/password-input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError('Vui lòng nhập email và mật khẩu.'); return; }

    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Email hoặc mật khẩu không đúng.'
        : authError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleLogin} className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Quản lý Truyền thông</h2>
        <p className="text-xs text-gray-400 mb-8">Trường CĐ Bách khoa Tây Nguyên</p>

        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-md text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          onKeyDown={e => e.key === 'Enter' && document.getElementById('pw')?.focus()}
        />
        <div className="mb-4">
          <PasswordInput
            id="pw"
            placeholder="Mật khẩu"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-md text-sm pr-12 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-md text-sm disabled:opacity-60 transition-colors"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>

        {error && <p className="text-red-600 text-xs mt-4">{error}</p>}
      </form>
    </div>
  );
}
