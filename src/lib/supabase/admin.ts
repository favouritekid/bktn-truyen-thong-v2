import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from './server';
import { NextResponse } from 'next/server';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type UserRole = 'super_admin' | 'admin' | 'editor';

interface VerifyResult {
  user: { id: string; email?: string };
  profile: { id: string; role: UserRole };
}

interface VerifyError {
  error: string;
  status: number;
}

export async function verifyRole(
  allowedRoles: UserRole[]
): Promise<VerifyResult | VerifyError> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Chưa đăng nhập', status: 401 };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!profile || !allowedRoles.includes(profile.role as UserRole)) {
    return { error: 'Không có quyền thực hiện', status: 403 };
  }

  return { user, profile: profile as { id: string; role: UserRole } };
}

export function isVerifyError(result: VerifyResult | VerifyError): result is VerifyError {
  return 'error' in result;
}

export function verifyErrorResponse(err: VerifyError) {
  return NextResponse.json({ error: err.error }, { status: err.status });
}
