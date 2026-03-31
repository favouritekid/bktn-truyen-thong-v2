import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { sendMessage, formatNotificationMessage } from '@/lib/zalo-bot';
import type { NotificationType } from '@/lib/zalo-bot';
import { NextRequest, NextResponse } from 'next/server';

const VALID_TYPES: NotificationType[] = [
  'content_approved', 'content_rejected',
  'result_approved', 'result_rejected',
  'pending_content_approval', 'pending_result_approval',
];

// Types that notify admins instead of assignees
const ADMIN_NOTIFY_TYPES: NotificationType[] = [
  'pending_content_approval',
  'pending_result_approval',
];

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyRole(['super_admin', 'admin', 'editor']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { taskId, type, rejectReason } = await req.json();

    if (!taskId || !type) {
      return NextResponse.json({ error: 'Missing taskId or type' }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch task
    const { data: task } = await admin
      .from('tasks')
      .select('id, title, status, deadline, campaign_id')
      .eq('id', taskId)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Fetch campaign name
    let campaignName: string | undefined;
    if (task.campaign_id) {
      const { data: campaign } = await admin
        .from('campaigns')
        .select('name')
        .eq('id', task.campaign_id)
        .single();
      campaignName = campaign?.name;
    }

    // Fetch channels
    const { data: taskChannels } = await admin
      .from('task_channels')
      .select('channel_id')
      .eq('task_id', taskId);

    let channels: string[] = [];
    if (taskChannels?.length) {
      const { data: channelData } = await admin
        .from('channels')
        .select('name')
        .in('id', taskChannels.map(tc => tc.channel_id));
      channels = channelData?.map(c => c.name) ?? [];
    }

    // Determine recipients: admins or assignees
    let recipientUserIds: string[];

    if (ADMIN_NOTIFY_TYPES.includes(type)) {
      // Notify all admin + super_admin
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin'])
        .eq('is_active', true);
      recipientUserIds = admins?.map(a => a.id) ?? [];
    } else {
      // Notify assignees
      const { data: assignees } = await admin
        .from('task_assignees')
        .select('user_id')
        .eq('task_id', taskId);
      recipientUserIds = assignees?.map(a => a.user_id) ?? [];
    }

    if (!recipientUserIds.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'No recipients' });
    }

    // Fetch Zalo chat_ids for recipients
    const { data: zaloUsers } = await admin
      .from('zalo_bot_users')
      .select('user_id, chat_id')
      .in('user_id', recipientUserIds)
      .eq('is_active', true);

    if (!zaloUsers?.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'No linked Zalo accounts' });
    }

    // Fetch action-by name
    const { data: actionProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.user.id)
      .single();

    const message = await formatNotificationMessage({
      type,
      taskId: task.id,
      taskTitle: task.title,
      campaignName,
      channels,
      deadline: task.deadline,
      actionBy: actionProfile?.full_name ?? 'N/A',
      rejectReason,
    });

    // Send to all recipients
    let sent = 0;
    let failed = 0;

    for (const zu of zaloUsers) {
      const result = await sendMessage(zu.chat_id, message);

      await admin.from('notification_logs').insert({
        task_id: taskId,
        recipient_user_id: zu.user_id,
        chat_id: zu.chat_id,
        notification_type: type,
        message,
        status: result.ok ? 'sent' : 'failed',
        error_detail: result.ok ? '' : (result.description ?? 'Unknown error'),
      });

      if (result.ok) sent++;
      else failed++;
    }

    return NextResponse.json({ ok: true, sent, failed });
  } catch (err) {
    console.error('POST /api/notifications/zalo error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
