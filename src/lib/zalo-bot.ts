const ZALO_BOT_API = 'https://bot-api.zaloplatforms.com';

function getBotUrl(method: string) {
  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) throw new Error('ZALO_BOT_TOKEN is not configured');
  return `${ZALO_BOT_API}/bot${token}/${method}`;
}

interface ZaloBotResponse {
  ok: boolean;
  result?: Record<string, unknown>;
  description?: string;
  error_code?: number;
}

export async function sendMessage(chatId: string, text: string): Promise<ZaloBotResponse> {
  const res = await fetch(getBotUrl('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 2000) }),
  });
  return res.json();
}

export async function getMe(): Promise<ZaloBotResponse> {
  const res = await fetch(getBotUrl('getMe'), { method: 'POST' });
  return res.json();
}

export async function setWebhook(url: string, secretToken: string): Promise<ZaloBotResponse> {
  const res = await fetch(getBotUrl('setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken }),
  });
  return res.json();
}

// Format tin nhắn thông báo duyệt/từ chối
export type NotificationType =
  | 'content_approved' | 'content_rejected'
  | 'result_approved' | 'result_rejected'
  | 'pending_content_approval' | 'pending_result_approval';

async function shortenUrl(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const short = (await res.text()).trim();
      if (short.startsWith('http')) return short;
    }
  } catch (err) {
    console.error('shortenUrl error:', err);
  }
  return url;
}

export async function formatNotificationMessage(params: {
  type: NotificationType;
  taskId: string;
  taskTitle: string;
  campaignName?: string;
  channels?: string[];
  deadline?: string;
  actionBy: string;
  rejectReason?: string;
}): Promise<string> {
  const { type, taskId, taskTitle, campaignName, channels, deadline, actionBy, rejectReason } = params;

  const channelStr = channels?.length ? channels.join(', ') : 'N/A';
  const deadlineStr = deadline ? new Date(deadline).toLocaleDateString('vi-VN') : 'N/A';

  const LINE = '━━━━━━━━━━━━━━━━';

  const headers: Record<string, { icon: string; title: string }> = {
    content_approved:        { icon: '✅', title: 'KẾ HOẠCH ĐÃ DUYỆT' },
    content_rejected:        { icon: '❌', title: 'KẾ HOẠCH BỊ TỪ CHỐI' },
    result_approved:         { icon: '🎉', title: 'KẾT QUẢ ĐÃ DUYỆT - ĐÃ ĐĂNG' },
    result_rejected:         { icon: '🔄', title: 'KẾT QUẢ BỊ TRẢ LẠI' },
    pending_content_approval:{ icon: '📋', title: 'CÓ KẾ HOẠCH CẦN DUYỆT' },
    pending_result_approval: { icon: '📊', title: 'CÓ KẾT QUẢ CẦN DUYỆT' },
  };

  const actionLabels: Record<string, string> = {
    content_approved: 'Duyệt bởi',
    content_rejected: 'Từ chối bởi',
    result_approved: 'Duyệt bởi',
    result_rejected: 'Trả lại bởi',
    pending_content_approval: 'Gửi bởi',
    pending_result_approval: 'Gửi bởi',
  };

  const footers: Record<string, { icon: string; text: string }> = {
    content_approved:        { icon: '🚀', text: 'Hãy bắt đầu thực hiện' },
    content_rejected:        { icon: '⚠', text: 'Vui lòng chỉnh sửa và gửi duyệt lại' },
    result_approved:         { icon: '🏆', text: 'Task đã hoàn thành!' },
    result_rejected:         { icon: '⚠', text: 'Vui lòng chỉnh sửa kết quả và nộp lại' },
    pending_content_approval:{ icon: '👉', text: 'Vui lòng vào hệ thống để duyệt' },
    pending_result_approval: { icon: '👉', text: 'Vui lòng vào hệ thống để duyệt kết quả' },
  };

  const h = headers[type];
  const f = footers[type];

  let msg = `${LINE}\n${h.icon} ${h.title}\n${LINE}\n`;
  msg += `Tiêu đề: ${taskTitle}\n`;
  if (campaignName) msg += `Chiến dịch: ${campaignName}\n`;
  msg += `Kênh: ${channelStr}\n`;
  msg += `Deadline: ${deadlineStr}\n`;
  msg += `${actionLabels[type]}: ${actionBy}\n`;

  if (rejectReason) {
    msg += `\nLý do: ${rejectReason}\n`;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const shortLink = await shortenUrl(`${appUrl}/t/${taskId}`);
    msg += `\n${f.icon} ${f.text}:\n${shortLink}`;
  } else {
    msg += `\n${f.icon} ${f.text}.`;
  }

  return msg;
}
