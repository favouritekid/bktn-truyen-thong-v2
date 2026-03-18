import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { generateCampaignCode } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/campaigns - List all campaigns with channels
export async function GET() {
  try {
    const auth = await verifyRole(['super_admin', 'admin', 'editor']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('campaigns')
      .select('*, campaign_channels(channel_id, channels(*))')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Flatten channels from junction table
    const campaigns = (data || []).map((c: Record<string, unknown>) => {
      const campaignChannels = (c.campaign_channels as Array<{ channels: unknown }>) || [];
      return {
        ...c,
        channels: campaignChannels.map((cc) => cc.channels).filter(Boolean),
        campaign_channels: undefined,
      };
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error('GET /api/campaigns error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}

// POST /api/campaigns - Create a campaign
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRole(['super_admin', 'admin']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const body = await request.json();
    const { name, description, start_at, end_at, notes, channel_ids } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tên chiến dịch không được để trống' }, { status: 400 });
    }

    const code = generateCampaignCode();
    const adminClient = createAdminClient();

    const { data: campaign, error } = await adminClient
      .from('campaigns')
      .insert({
        code,
        name: name.trim(),
        description: description?.trim() || '',
        start_at: start_at || null,
        end_at: end_at || null,
        notes: notes?.trim() || '',
        status: 'draft',
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Insert channel links
    if (channel_ids?.length > 0) {
      await adminClient
        .from('campaign_channels')
        .insert(
          channel_ids.map((cid: string) => ({
            campaign_id: campaign.id,
            channel_id: cid,
          }))
        );
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error('POST /api/campaigns error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
