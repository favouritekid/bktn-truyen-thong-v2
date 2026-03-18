import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/channels - List all channels
export async function GET() {
  try {
    const auth = await verifyRole(['super_admin', 'admin', 'editor']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('channels')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ channels: data });
  } catch (err) {
    console.error('GET /api/channels error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}

// POST /api/channels - Create a channel
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const body = await request.json();
    const { name, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tên kênh không được để trống' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('channels')
      .insert({
        name: name.trim(),
        description: description?.trim() || '',
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tên kênh đã tồn tại' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ channel: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/channels error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
