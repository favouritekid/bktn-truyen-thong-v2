import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { sendMessage, formatNotificationMessage } from '@/lib/zalo-bot';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyRole(['super_admin', 'admin', 'editor']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { taskId, type, rejectReason } = await req.json();

    if (!taskId || !type) {
      return NextResponse.json({ error: 'Missing taskId or type' }, { status: 400 });
    }

    const validTypes = ['content_approved', 'content_rejected', 'result_approved', 'result_rejected'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch task with related data
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

    // Fetch assignees
    const { data: assignees } = await admin
      .from('task_assignees')
      .select('user_id')
      .eq('task_id', taskId);

    if (!assignees?.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'No assignees' });
    }

    // Fetch Zalo chat_ids for assignees
    const { data: zaloUsers } = await admin
      .from('zalo_bot_users')
      .select('user_id, chat_id')
      .in('user_id', assignees.map(a => a.user_id))
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

    const message = formatNotificationMessage({
      type,
      taskId: task.id,
      taskTitle: task.title,
      campaignName,
      channels,
      deadline: task.deadline,
      actionBy: actionProfile?.full_name ?? 'Admin',
      rejectReason,
    });

    // Send to all linked Zalo accounts
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
