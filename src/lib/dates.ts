import { config } from '../config.js';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: config.timeZone,
});

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDateOnly(value)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDateOnly(value)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: config.timeZone,
  }).format(new Date());
}

export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const from = parseDateOnly(fromDateOnly).getTime();
  const to = parseDateOnly(toDateOnly).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function daysUntil(dateOnly: string): number {
  return daysBetween(todayIso(), dateOnly);
}

export interface DueInfo {
  days: number;
  tone: 'ok' | 'soon' | 'late';
  label: string;
}

export function dueInfo(dueAt: string): DueInfo {
  const days = daysUntil(dueAt);
  if (days < 0) {
    return { days, tone: 'late', label: `${Math.abs(days)} gün gecikti` };
  }
  if (days === 0) {
    return { days, tone: 'soon', label: 'Bugün teslim' };
  }
  if (days <= 2) {
    return { days, tone: 'soon', label: `${days} gün kaldı` };
  }
  return { days, tone: 'ok', label: `${days} gün kaldı` };
}

export function isOverdue(dueAt: string): boolean {
  return daysUntil(dueAt) < 0;
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
