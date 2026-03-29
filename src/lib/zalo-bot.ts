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
export function formatNotificationMessage(params: {
  type: 'content_approved' | 'content_rejected' | 'result_approved' | 'result_rejected';
  taskId: string;
  taskTitle: string;
  campaignName?: string;
  channels?: string[];
  deadline?: string;
  actionBy: string;
  rejectReason?: string;
}): string {
  const { type, taskId, taskTitle, campaignName, channels, deadline, actionBy, rejectReason } = params;

  const channelStr = channels?.length ? channels.join(', ') : 'N/A';
  const deadlineStr = deadline ? new Date(deadline).toLocaleDateString('vi-VN') : 'N/A';

  const headers: Record<string, string> = {
    content_approved: 'KE HOACH DA DUYET',
    content_rejected: 'KE HOACH BI TU CHOI',
    result_approved: 'KET QUA DA DUYET - DA DANG',
    result_rejected: 'KET QUA BI TRA LAI',
  };

  const footers: Record<string, string> = {
    content_approved: 'Hay bat dau thuc hien!',
    content_rejected: 'Vui long chinh sua va gui duyet lai.',
    result_approved: 'Task da hoan thanh!',
    result_rejected: 'Vui long chinh sua ket qua va nop lai.',
  };

  let msg = `[${headers[type]}]\n\n`;
  msg += `Ma: ${taskId}\n`;
  msg += `Tieu de: ${taskTitle}\n`;
  if (campaignName) msg += `Chien dich: ${campaignName}\n`;
  msg += `Kenh: ${channelStr}\n`;
  msg += `Deadline: ${deadlineStr}\n`;
  msg += `Boi: ${actionBy}\n`;

  if (rejectReason) {
    msg += `\nLy do: ${rejectReason}\n`;
  }

  msg += `\n${footers[type]}`;
  return msg;
}
