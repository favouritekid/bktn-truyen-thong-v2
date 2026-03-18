import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/users/[id]/reset-password - Reset password for a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const callerRole = auth.profile.role;
    const { id } = await params;
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check target user role for hierarchy
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
    }

    // Admin can only reset editor passwords, super_admin can reset all
    if (callerRole === 'admin' && targetProfile.role !== 'editor') {
      return NextResponse.json({ error: 'Không có quyền đặt lại mật khẩu người dùng này' }, { status: 403 });
    }

    const { error } = await adminClient.auth.admin.updateUserById(id, {
      password,
    });

    if (error) {
      return NextResponse.json({ error: 'Lỗi đặt lại mật khẩu: ' + error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Đã đặt lại mật khẩu thành công' });
  } catch (err) {
    console.error('POST /api/users/[id]/reset-password error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
