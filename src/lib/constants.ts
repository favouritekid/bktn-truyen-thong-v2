export const CHANNELS = ['Facebook', 'TikTok/YouTube', 'Website/Blog', 'Zalo OA'] as const;
export const STATUSES = ['Bản nháp', 'Chờ duyệt KH', 'Đã duyệt', 'Đang làm', 'Chờ duyệt KQ', 'Đã đăng'] as const;
export const PRIORITIES = ['Cao', 'Trung bình', 'Thấp'] as const;
export const CONTENT_TYPES = ['Bài viết', 'Video', 'Story/Reels', 'Infographic', 'Livestream'] as const;

export const STATUS_COLORS: Record<string, string> = {
  'Bản nháp': '#9E9E9E',
  'Chờ duyệt KH': '#E65100',
  'Đã duyệt': '#0288D1',
  'Đang làm': '#F57F17',
  'Chờ duyệt KQ': '#7B1FA2',
  'Đã đăng': '#2E7D32',
};

export const CHANNEL_COLORS: Record<string, string> = {
  'Facebook': '#1877F2',
  'TikTok/YouTube': '#FE2C55',
  'Website/Blog': '#7C3AED',
  'Zalo OA': '#0068FF',
};

export const RESULT_TYPES = [
  { value: 'link', label: 'Liên kết', icon: '🔗', placeholder: 'https://...' },
  { value: 'image', label: 'Hình ảnh', icon: '🖼️', placeholder: 'URL hình ảnh...' },
  { value: 'video', label: 'Video', icon: '🎬', placeholder: 'URL video...' },
  { value: 'document', label: 'Tài liệu', icon: '📄', placeholder: 'URL tài liệu...' },
  { value: 'text', label: 'Nội dung', icon: '📝', placeholder: 'Nội dung văn bản...' },
] as const;

export const LOCKED_STATUSES = ['Đã duyệt', 'Đang làm', 'Chờ duyệt KQ'] as const;

export type TaskStatus = typeof STATUSES[number];
export type Priority = typeof PRIORITIES[number];
export type ContentType = typeof CONTENT_TYPES[number];

// Roles
export const ROLES = ['super_admin', 'admin', 'editor'] as const;

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  editor: 'Editor',
};

export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: 'bg-red-100', text: 'text-red-700' },
  admin: { bg: 'bg-purple-100', text: 'text-purple-700' },
  editor: { bg: 'bg-blue-100', text: 'text-blue-700' },
};

// Campaign statuses
export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'ended', 'archived'] as const;

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  ended: 'Kết thúc',
  archived: 'Lưu trữ',
};

export const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: '#9E9E9E',
  active: '#2E7D32',
  paused: '#F57F17',
  ended: '#0288D1',
  archived: '#757575',
};
