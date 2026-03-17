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

export type Channel = typeof CHANNELS[number];
export type TaskStatus = typeof STATUSES[number];
export type Priority = typeof PRIORITIES[number];
export type ContentType = typeof CONTENT_TYPES[number];
