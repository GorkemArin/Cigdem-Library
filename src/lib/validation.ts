import { z } from 'zod';
import { normalizeIsbnPair } from './isbn.js';

function preprocessOptional(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value ?? undefined;
}

export function optionalText(max: number): z.ZodType<string | undefined> {
  return z.preprocess(preprocessOptional, z.string().max(max).optional());
}

export function optionalInt(min: number, max: number, message: string): z.ZodType<number | undefined> {
  return z.preprocess(
    preprocessOptional,
    z.coerce.number().int(message).min(min, message).max(max, message).optional(),
  );
}

const optionalIsbn = z.preprocess(
  preprocessOptional,
  z
    .string()
    .max(25, 'ISBN en fazla 25 karakter olabilir.')
    .refine((value) => normalizeIsbnPair(value) !== null, 'Geçerli bir ISBN-10 veya ISBN-13 girin.')
    .optional(),
);

const optionalDate = z.preprocess(
  preprocessOptional,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih GG.AA.YYYY biçiminde olmalı.')
    .optional(),
);

const optionalUrl = z.preprocess(
  preprocessOptional,
  z.string().url('Geçerli bir adres girin.').max(600, 'Adres çok uzun.').optional(),
);

export const registerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, 'Ad ve soyad en az 3 karakter olmalı.')
    .max(120, 'Ad ve soyad en fazla 120 karakter olabilir.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Geçerli bir e-posta adresi girin.')
    .max(200, 'E-posta adresi çok uzun.'),
  phone: optionalText(30),
  address: optionalText(300),
  password: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalı.')
    .max(128, 'Şifre en fazla 128 karakter olabilir.'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Şifrenizi girin.'),
});

export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, 'Ad ve soyad en az 3 karakter olmalı.')
    .max(120, 'Ad ve soyad en fazla 120 karakter olabilir.'),
  phone: optionalText(30),
  address: optionalText(300),
});

export const passwordSchema = z.object({
  current_password: z.string().min(1, 'Mevcut şifrenizi girin.'),
  new_password: z
    .string()
    .min(8, 'Yeni şifre en az 8 karakter olmalı.')
    .max(128, 'Yeni şifre en fazla 128 karakter olabilir.'),
});

export const bookSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Kitap adı zorunlu.')
    .max(300, 'Kitap adı en fazla 300 karakter olabilir.'),
  subtitle: optionalText(300),
  authors: optionalText(300),
  isbn: optionalIsbn,
  publisher: optionalText(200),
  published_year: optionalInt(1000, 2100, 'Yayın yılı 1000 ile 2100 arasında olmalı.'),
  language: z
    .string()
    .trim()
    .min(2, 'Dil kodu en az 2 karakter olmalı.')
    .max(20, 'Dil kodu çok uzun.')
    .default('tr'),
  page_count: optionalInt(1, 20000, 'Sayfa sayısı 1 ile 20000 arasında olmalı.'),
  categories: optionalText(400),
  description: optionalText(8000),
  cover_url: optionalUrl,
  openlibrary_key: optionalText(300),
  copies_count: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? 1 : value),
    z.coerce.number().int('Kopya sayısı tam sayı olmalı.').min(0, 'Kopya sayısı negatif olamaz.').max(20, 'Tek seferde en fazla 20 kopya eklenebilir.'),
  ),
  shelf_location: optionalText(120),
  copy_condition: z.enum(['new', 'good', 'fair', 'poor']).default('good'),
});

export const copySchema = z.object({
  inventory_no: optionalText(40),
  shelf_location: optionalText(120),
  condition: z.enum(['new', 'good', 'fair', 'poor']).default('good'),
  acquired_at: optionalDate,
  notes: optionalText(500),
});

export const copyStatusSchema = z.object({
  status: z.enum(['available', 'on_loan', 'reserved', 'lost', 'repair', 'withdrawn']),
});

export const memberStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const memberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const requestSchema = z.object({
  book_id: z.coerce.number().int().positive('Kitap seçilemedi.'),
  member_note: optionalText(500),
});

export const requestApproveSchema = z.object({
  copy_id: z.coerce.number().int().positive('Bir kopya seçin.'),
  admin_note: optionalText(500),
});

export const requestCloseSchema = z.object({
  admin_note: optionalText(500),
});

export const settingsSchema = z.object({
  library_name: z.string().trim().min(1, 'Kütüphane adı zorunlu.').max(120),
  loan_days: z.coerce.number().int().min(1, 'En az 1 gün.').max(90, 'En fazla 90 gün.'),
  renew_days: z.coerce.number().int().min(1, 'En az 1 gün.').max(60, 'En fazla 60 gün.'),
  max_renewals: z.coerce.number().int().min(0).max(5, 'En fazla 5 kez uzatılabilir.'),
  max_active_loans: z.coerce.number().int().min(1, 'En az 1.').max(20, 'En fazla 20.'),
  hold_days: z.coerce.number().int().min(1, 'En az 1 gün.').max(30, 'En fazla 30 gün.'),
  fine_per_day: z.coerce.number().min(0, 'Negatif olamaz.').max(1000, 'Çok yüksek bir değer.'),
  contact_email: optionalText(200),
  contact_phone: optionalText(40),
});

export const manualLoanSchema = z.object({
  user_id: z.coerce.number().int().positive('Üye seçin.'),
  copy_id: z.coerce.number().int().positive('Kopya seçin.'),
  notes: optionalText(500),
});
