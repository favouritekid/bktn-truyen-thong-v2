import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/users - Create a new user (admin+ only)
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const callerRole = auth.profile.role;
    const body = await request.json();
    const { email, password, full_name, role } = body;

    // Validate
    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 });
    }

    // Role hierarchy: super_admin can create admin+editor, admin can only create editor
    const allowedRoles = callerRole === 'super_admin' ? ['admin', 'editor'] : ['editor'];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Không có quyền tạo role này' }, { status: 403 });
    }

    // Create auth user with admin client
    const adminClient = createAdminClient();
    const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error('Supabase createUser error:', authError);
      const isDuplicate = authError.message?.toLowerCase().includes('already')
        || authError.status === 422;
      return NextResponse.json(
        { error: isDuplicate ? 'Email này đã được đăng ký' : 'Lỗi tạo tài khoản: ' + authError.message },
        { status: isDuplicate ? 409 : 400 }
      );
    }

    // Update the profile created by the trigger with correct full_name, role, and created_by
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({ full_name, role, created_by: auth.user.id })
      .eq('id', newUser.user.id)
      .select()
      .single();

    if (profileError) {
      console.error('Profile update error:', profileError);
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return NextResponse.json(
        { error: 'Lỗi cập nhật profile: ' + profileError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ user: profile }, { status: 201 });
  } catch (err) {
    console.error('POST /api/users error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
