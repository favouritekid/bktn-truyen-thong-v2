import { CHANNEL_COLORS } from './constants';

export function generateTaskId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `T-${y}${m}${d}-${rand}`;
}

export function formatDateVN(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeVN(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function getChannelColor(channel: string): string {
  return CHANNEL_COLORS[channel] ?? '#6B7280';
}

export function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  const now = new Date();
  return d < now;
}

export function isDueSoon(deadline: string | null, days: number = 2): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + days);
  return d >= now && d <= future;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function isAdminOrAbove(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role: string): boolean {
  return role === 'super_admin';
}

export function canDeleteTask(role: string, status: string, createdBy: string, userId: string): boolean {
  if (status === 'Đã đăng') return false;
  if (role === 'super_admin') return true;
  if (role === 'admin') return ['Bản nháp', 'Chờ duyệt KH'].includes(status);
  if (role === 'editor') return status === 'Bản nháp' && createdBy === userId;
  return false;
}

export function canArchiveTask(role: string, status: string, createdBy: string, userId: string): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  if (role === 'editor') return status === 'Bản nháp' && createdBy === userId;
  return false;
}

export function deleteRequiresWarning(status: string): boolean {
  return ['Đang làm', 'Chờ duyệt KQ'].includes(status);
}

export function getTaskMonth(deadline: string | null): string {
  if (!deadline) return '';
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `Thang ${month}-${year}`;
}

export function generateCampaignCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `C-${y}${m}${d}-${rand}`;
}
