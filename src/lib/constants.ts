export const CHANNELS = ['Facebook', 'TikTok/YouTube', 'Website/Blog', 'Zalo OA'] as const;
export const STATUSES = ['Bản nháp', 'Chờ duyệt KH', 'Đã duyệt', 'Đang làm', 'Chờ duyệt KQ', 'Đã đăng'] as const;
export const PRIORITIES = ['Cao', 'Trung bình', 'Thấp'] as const;
export const CONTENT_TYPES = ['Bài viết', 'Video', 'Story/Reels', 'Infographic', 'Livestream'] as const;

export const STATUS_COLORS: Record<string, string> = {
  'Bản nháp': '#8B8F96',
  'Chờ duyệt KH': '#C2723E',
  'Đã duyệt': '#4E8FB5',
  'Đang làm': '#C09640',
  'Chờ duyệt KQ': '#8B6CA1',
  'Đã đăng': '#4A8C5E',
};

export const CHANNEL_COLORS: Record<string, string> = {
  'Facebook': '#5B8EC9',
  'TikTok/YouTube': '#C96B7A',
  'Website/Blog': '#8B72B8',
  'Zalo OA': '#5B84C9',
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
  draft: '#8B8F96',
  active: '#4A8C5E',
  paused: '#C09640',
  ended: '#4E8FB5',
  archived: '#6B7280',
};
