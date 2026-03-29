import { createAdminClient } from '@/lib/supabase/admin';
import { sendMessage } from '@/lib/zalo-bot';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Verify secret token
    const secretToken = req.headers.get('x-bot-api-secret-token');
    if (secretToken !== process.env.ZALO_BOT_WEBHOOK_SECRET) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.ok || !body.result) {
      return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

    const { event_name, message } = body.result;

    // Only handle text messages
    if (event_name !== 'message.text.received' || !message) {
      return NextResponse.json({ message: 'OK' });
    }

    const chatId = message.chat?.id;
    const text = (message.text ?? '').trim();
    const displayName = message.from?.display_name ?? '';

    if (!chatId) {
      return NextResponse.json({ message: 'OK' });
    }

    const admin = createAdminClient();

    // Check if this chat_id is already linked
    const { data: existing } = await admin
      .from('zalo_bot_users')
      .select('id, user_id')
      .eq('chat_id', chatId)
      .single();

    if (existing) {
      await sendMessage(chatId,
        `Ban da lien ket tai khoan thanh cong.\nBot se gui thong bao khi ke hoach duoc duyet hoac tu choi.`
      );
      return NextResponse.json({ message: 'OK' });
    }

    // Check if user sent an email to link
    // Format: user sends their email address
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailPattern.test(text)) {
      const email = text.toLowerCase();

      // Find profile by email
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', email)
        .eq('is_active', true)
        .single();

      if (!profile) {
        await sendMessage(chatId,
          `Khong tim thay tai khoan voi email: ${email}\nVui long gui dung email dang nhap he thong.`
        );
        return NextResponse.json({ message: 'OK' });
      }

      // Check if this profile already linked to another chat
      const { data: existingLink } = await admin
        .from('zalo_bot_users')
        .select('id')
        .eq('user_id', profile.id)
        .single();

      if (existingLink) {
        // Update to new chat_id
        await admin
          .from('zalo_bot_users')
          .update({ chat_id: chatId, display_name: displayName, linked_at: new Date().toISOString(), is_active: true })
          .eq('user_id', profile.id);
      } else {
        await admin
          .from('zalo_bot_users')
          .insert({ user_id: profile.id, chat_id: chatId, display_name: displayName });
      }

      await sendMessage(chatId,
        `Lien ket thanh cong!\n\nXin chao ${profile.full_name}.\nBot se tu dong gui thong bao khi:\n- Ke hoach duoc duyet hoac tu choi\n- Ket qua duoc duyet hoac tra lai\n\nGui "huy" de huy lien ket.`
      );
      return NextResponse.json({ message: 'OK' });
    }

    // Handle unlink command
    if (text.toLowerCase() === 'huy') {
      await admin
        .from('zalo_bot_users')
        .update({ is_active: false })
        .eq('chat_id', chatId);

      await sendMessage(chatId, 'Da huy lien ket. Ban se khong nhan thong bao nua.\nGui email de lien ket lai.');
      return NextResponse.json({ message: 'OK' });
    }

    // Default: send instructions
    await sendMessage(chatId,
      `Xin chao ${displayName}!\n\nDay la Bot thong bao cua he thong quan ly truyen thong.\n\nDe lien ket tai khoan, vui long gui email dang nhap he thong cua ban.\n\nVi du: ten@email.com`
    );

    return NextResponse.json({ message: 'OK' });
  } catch (err) {
    console.error('POST /api/zalo-webhook error:', err);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}
