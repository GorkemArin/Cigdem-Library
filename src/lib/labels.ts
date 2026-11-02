import type { CopyCondition, CopyStatus, RequestStatus, Role, UserStatus } from '../db/types.js';

export interface BadgeInfo {
  label: string;
  tone: 'success' | 'warn' | 'danger' | 'info' | 'muted' | 'accent';
}

const COPY_STATUS: Record<CopyStatus, BadgeInfo> = {
  available: { label: 'Müsait', tone: 'success' },
  on_loan: { label: 'Ödünçte', tone: 'warn' },
  reserved: { label: 'Rezerve', tone: 'info' },
  lost: { label: 'Kayıp', tone: 'danger' },
  repair: { label: 'Onarımda', tone: 'muted' },
  withdrawn: { label: 'Arşiv dışı', tone: 'muted' },
};

const CONDITION: Record<CopyCondition, BadgeInfo> = {
  new: { label: 'Yeni', tone: 'success' },
  good: { label: 'İyi', tone: 'info' },
  fair: { label: 'Orta', tone: 'warn' },
  poor: { label: 'Yıpranmış', tone: 'danger' },
};

const REQUEST_STATUS: Record<RequestStatus, BadgeInfo> = {
  pending: { label: 'Onay bekliyor', tone: 'warn' },
  approved: { label: 'Teslim bekliyor', tone: 'info' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
  cancelled: { label: 'İptal edildi', tone: 'muted' },
  fulfilled: { label: 'Teslim edildi', tone: 'success' },
};

const USER_STATUS: Record<UserStatus, BadgeInfo> = {
  pending: { label: 'Onay bekliyor', tone: 'warn' },
  active: { label: 'Aktif', tone: 'success' },
  suspended: { label: 'Askıda', tone: 'danger' },
};

const ROLE: Record<Role, BadgeInfo> = {
  admin: { label: 'Yönetici', tone: 'accent' },
  member: { label: 'Üye', tone: 'muted' },
};

const LANGUAGES: Record<string, string> = {
  tr: 'Türkçe',
  en: 'İngilizce',
  de: 'Almanca',
  fr: 'Fransızca',
  es: 'İspanyolca',
  it: 'İtalyanca',
  ru: 'Rusça',
  ar: 'Arapça',
  fa: 'Farsça',
  nl: 'Hollandaca',
  el: 'Yunanca',
  ku: 'Kürtçe',
  az: 'Azerbaycan Türkçesi',
};

export function copyStatusInfo(status: CopyStatus): BadgeInfo {
  return COPY_STATUS[status] ?? { label: status, tone: 'muted' };
}

export function conditionInfo(condition: CopyCondition): BadgeInfo {
  return CONDITION[condition] ?? { label: condition, tone: 'muted' };
}

export function requestStatusInfo(status: RequestStatus): BadgeInfo {
  return REQUEST_STATUS[status] ?? { label: status, tone: 'muted' };
}

export function userStatusInfo(status: UserStatus): BadgeInfo {
  return USER_STATUS[status] ?? { label: status, tone: 'muted' };
}

export function roleInfo(role: Role): BadgeInfo {
  return ROLE[role] ?? { label: role, tone: 'muted' };
}

export function languageLabel(code: string): string {
  return LANGUAGES[code] ?? code.toUpperCase();
}

export const LANGUAGE_OPTIONS = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'İngilizce' },
  { value: 'de', label: 'Almanca' },
  { value: 'fr', label: 'Fransızca' },
  { value: 'es', label: 'İspanyolca' },
  { value: 'it', label: 'İtalyanca' },
  { value: 'ru', label: 'Rusça' },
  { value: 'ar', label: 'Arapça' },
  { value: 'fa', label: 'Farsça' },
  { value: 'nl', label: 'Hollandaca' },
  { value: 'el', label: 'Yunanca' },
  { value: 'ku', label: 'Kürtçe' },
  { value: 'az', label: 'Azerbaycan Türkçesi' },
];

export const COPY_STATUS_OPTIONS: Array<{ value: CopyStatus; label: string }> = (
  Object.keys(COPY_STATUS) as CopyStatus[]
).map((value) => ({ value, label: COPY_STATUS[value].label }));

export const CONDITION_OPTIONS: Array<{ value: CopyCondition; label: string }> = (
  Object.keys(CONDITION) as CopyCondition[]
).map((value) => ({ value, label: CONDITION[value].label }));

const AUDIT_ACTIONS: Record<string, string> = {
  'book.create': 'Kitap eklendi',
  'book.update': 'Kitap künyesi güncellendi',
  'copy.create': 'Kopya eklendi',
  'copy.status': 'Kopya durumu değiştirildi',
  'copy.delete': 'Kopya silindi',
  'member.status': 'Üyelik durumu değiştirildi',
  'member.role': 'Kullanıcı rolü değiştirildi',
  'request.create': 'Ödünç talebi oluşturuldu',
  'request.approve': 'Ödünç talebi onaylandı',
  'request.reject': 'Ödünç talebi reddedildi',
  'request.cancel': 'Ödünç talebi iptal edildi',
  'request.fulfill': 'Kitap teslim edildi',
  'loan.create': 'Ödünç kaydı oluşturuldu',
  'loan.return': 'Kitap iade alındı',
  'loan.renew': 'Ödünç süresi uzatıldı',
  'settings.update': 'Ayarlar güncellendi',
  'profile.update': 'Profil güncellendi',
  'profile.password_change': 'Şifre değiştirildi',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action;
}
