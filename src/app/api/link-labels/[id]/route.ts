import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// PATCH /api/link-labels/[id] - Update a link label
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { id } = await params;
    const body = await request.json();
    const { name, is_active } = body;

    const updates: Record<string, unknown> = { updated_by: auth.user.id };

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Tên nhãn không được để trống' }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (is_active !== undefined) {
      updates.is_active = is_active;
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('link_labels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tên nhãn đã tồn tại' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ link_label: data });
  } catch (err) {
    console.error('PATCH /api/link-labels/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
