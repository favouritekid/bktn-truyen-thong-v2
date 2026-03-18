import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['paused', 'ended'],
  paused: ['active', 'ended'],
  ended: ['archived'],
  archived: [], // restore handled separately
};

// PATCH /api/campaigns/[id] - Update a campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { id } = await params;
    const body = await request.json();
    const { name, description, start_at, end_at, notes, status, channel_ids, action } = body;

    const adminClient = createAdminClient();

    // Fetch current campaign
    const { data: current } = await adminClient
      .from('campaigns')
      .select('id, code, name, description, start_at, end_at, status, notes, created_by, updated_by, archived_at, status_before_archive, created_at, updated_at')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: 'Không tìm thấy chiến dịch' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_by: auth.user.id };

    // Handle archive action
    if (action === 'archive') {
      updates.status = 'archived';
      updates.archived_at = new Date().toISOString();
      updates.status_before_archive = current.status;
    }
    // Handle restore action
    else if (action === 'restore') {
      if (current.status !== 'archived') {
        return NextResponse.json({ error: 'Chỉ khôi phục được chiến dịch đã lưu trữ' }, { status: 400 });
      }
      updates.status = current.status_before_archive || 'draft';
      updates.archived_at = null;
      updates.status_before_archive = null;
    }
    // Handle status transition
    else if (status !== undefined && status !== current.status) {
      const allowed = VALID_TRANSITIONS[current.status as string] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json({
          error: `Không thể chuyển từ "${current.status}" sang "${status}"`,
        }, { status: 400 });
      }
      updates.status = status;
    }

    // Update other fields
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Tên chiến dịch không được để trống' }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description;
    if (start_at !== undefined) updates.start_at = start_at || null;
    if (end_at !== undefined) updates.end_at = end_at || null;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await adminClient
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Update channel links if provided
    if (channel_ids !== undefined) {
      // Remove old
      await adminClient
        .from('campaign_channels')
        .delete()
        .eq('campaign_id', id);

      // Insert new
      if (channel_ids.length > 0) {
        await adminClient
          .from('campaign_channels')
          .insert(
            channel_ids.map((cid: string) => ({
              campaign_id: id,
              channel_id: cid,
            }))
          );
      }
    }

    return NextResponse.json({ campaign: data });
  } catch (err) {
    console.error('PATCH /api/campaigns/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
