import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// PATCH /api/users/[id] - Update user profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const callerRole = auth.profile.role;
    const { id } = await params;
    const body = await request.json();
    const { full_name, role, is_active } = body;

    // Fetch target user to check hierarchy
    const adminClient = createAdminClient();
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
    }

    // Admin can only manage editors, super_admin can manage admin+editor
    if (callerRole === 'admin' && targetProfile.role !== 'editor') {
      return NextResponse.json({ error: 'Không có quyền quản lý người dùng này' }, { status: 403 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) {
      const allowedRoles = callerRole === 'super_admin' ? ['admin', 'editor'] : ['editor'];
      if (!allowedRoles.includes(role)) {
        return NextResponse.json({ error: 'Không có quyền gán role này' }, { status: 403 });
      }
      updates.role = role;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active phải là boolean' }, { status: 400 });
      }
      updates.is_active = is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu cập nhật' }, { status: 400 });
    }

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
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const callerRole = auth.profile.role;
    const { id } = await params;

    // Prevent self-deletion
    if (auth.user.id === id) {
      return NextResponse.json({ error: 'Không thể xoá chính mình' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch target to check hierarchy
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
    }

    // Admin can only delete editors, super_admin can delete admin+editor
    if (callerRole === 'admin' && targetProfile.role !== 'editor') {
      return NextResponse.json({ error: 'Không có quyền xoá người dùng này' }, { status: 403 });
    }

    // Cannot delete super_admin
    if (targetProfile.role === 'super_admin') {
      return NextResponse.json({ error: 'Không thể xoá Super Admin' }, { status: 403 });
    }

    // Delete profile first
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
