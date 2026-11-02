import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // .env okunamazsa ortam değişkenleriyle devam edilir.
  }
}

const rawPort = Number(process.env.PORT ?? 3000);

export const config = {
  port: Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000,
  dbPath: process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data', 'library.db'),
  sessionSecret: process.env.SESSION_SECRET ?? 'cigdemim-local-dev-secret-change-me',
  isProduction: process.env.NODE_ENV === 'production',
  cookieName: 'cigdem_session',
  csrfCookieName: 'cigdem_csrf',
  flashCookieName: 'cigdem_flash',
  sessionDays: 30,
  timeZone: 'Europe/Istanbul',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@cigdemim.org',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Cigdem2026!',
  openLibraryUserAgent:
    'CigdemimKutuphane/0.1 (mahalle kutuphanesi; iletisim: kutuphane@cigdemim.org)',
};

export const usesDefaultSecret = !process.env.SESSION_SECRET;
