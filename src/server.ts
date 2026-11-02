import { createApp } from './app.js';
import { config, usesDefaultSecret } from './config.js';
import { closeDb } from './db/index.js';

const app = createApp();

if (usesDefaultSecret) {
  console.warn(
    'UYARI: SESSION_SECRET ortam değişkeni tanımlı değil. Yerel kullanım için sorun değil, ancak sunucuya taşımadan önce .env içinde güçlü bir değer belirleyin.',
  );
}

const server = app.listen(config.port, () => {
  console.log(`Çiğdemim Kütüphane çalışıyor: http://localhost:${config.port}`);
  console.log(`Veritabanı: ${config.dbPath}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} alındı, kapatılıyor...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });

  setTimeout(() => {
    closeDb();
    process.exit(1);
  }, 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
