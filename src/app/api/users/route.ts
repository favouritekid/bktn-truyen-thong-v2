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

// POST /api/users - Create a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    // Verify the caller is admin
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    // Parse body
    const body = await request.json();
    const { email, password, name, role } = body;

    // Validate
    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 });
    }

    if (!['admin', 'editor'].includes(role)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
    }

    // Create auth user with admin client
    // Note: DB trigger "on_auth_user_created" auto-inserts a profile row,
    // so we only need to update it with the correct name and role afterwards.
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

    // Update the profile created by the trigger with correct name and role
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({ name, role })
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
