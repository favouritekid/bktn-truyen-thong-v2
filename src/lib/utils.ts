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

export function generateCampaignCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `C-${y}${m}${d}-${rand}`;
}
