import { getDb } from '../db/index.js';

export const DEFAULT_SETTINGS: Record<string, string> = {
  library_name: 'Çiğdemim Derneği Kütüphanesi',
  loan_days: '21',
  renew_days: '14',
  max_renewals: '1',
  max_active_loans: '3',
  hold_days: '3',
  fine_per_day: '0',
  contact_email: 'kutuphane@cigdemim.org',
  contact_phone: '',
};

export type Settings = Record<string, string>;

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;

  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? DEFAULT_SETTINGS[key] ?? fallback;
}

export function getSettingInt(key: string, fallback: number): number {
  const value = Number(getSetting(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

export function updateSettings(values: Record<string, string>): void {
  const db = getDb();
  const statement = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  db.transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      statement.run(key, value);
    }
  })();
}
