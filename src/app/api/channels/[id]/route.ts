import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// PATCH /api/channels/[id] - Update a channel
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { id } = await params;
    const body = await request.json();
    const { name, description, status } = body;

    const updates: Record<string, unknown> = { updated_by: auth.user.id };

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Tên kênh không được để trống' }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description;
    if (status !== undefined) {
      if (!['active', 'archived'].includes(status)) {
        return NextResponse.json({ error: 'Status không hợp lệ' }, { status: 400 });
      }
      updates.status = status;
      updates.archived_at = status === 'archived' ? new Date().toISOString() : null;
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('channels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tên kênh đã tồn tại' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ channel: data });
  } catch (err) {
    console.error('PATCH /api/channels/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
