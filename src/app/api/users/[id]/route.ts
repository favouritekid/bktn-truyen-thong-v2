import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Helper to verify admin access
async function verifyAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập', status: 401 };

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'admin') {
    return { error: 'Không có quyền thực hiện', status: 403 };
  }

  return { user };
}

// PATCH /api/users/[id] - Update user profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, role, status } = body;

    // Build update object with only provided fields
    const updates: Record<string, string> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) {
      if (!['admin', 'editor'].includes(role)) {
        return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
      }
      updates.role = role;
    }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return NextResponse.json({ error: 'Status không hợp lệ' }, { status: 400 });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu cập nhật' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: profile, error } = await adminClient
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Lỗi cập nhật: ' + error.message }, { status: 400 });
    }

    return NextResponse.json({ user: profile });
  } catch (err) {
    console.error('PATCH /api/users/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}

// DELETE /api/users/[id] - Permanently delete user (auth + profile)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Prevent self-deletion
    if (auth.user!.id === id) {
      return NextResponse.json({ error: 'Không thể xoá chính mình' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Delete profile first (FK or trigger may depend on auth user)
    const { error: profileError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', id);

    if (profileError) {
      return NextResponse.json({ error: 'Lỗi xoá profile: ' + profileError.message }, { status: 400 });
    }

    // Delete auth user
    const { error: authError } = await adminClient.auth.admin.deleteUser(id);

    if (authError) {
      console.error('Delete auth user error:', authError);
      return NextResponse.json({ error: 'Lỗi xoá tài khoản: ' + authError.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Đã xoá nhân viên' });
  } catch (err) {
    console.error('DELETE /api/users/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
