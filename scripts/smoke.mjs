import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const DB_PATH = process.env.SMOKE_DB_PATH ?? 'data/library.db';

const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attributes] = raw.split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = attributes.some((attribute) =>
      /^max-age=0$/i.test(attribute.trim()),
    );
    if (!value || expired) jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(path, { method = 'GET', form } = {}) {
  const headers = { 'user-agent': 'cigdemim-smoke-test' };
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;

  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body,
    redirect: 'manual',
  });
  storeCookies(response);
  return response;
}

async function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    const text = await response.text();
    throw new Error(
      `${label}: beklenen ${expected}, gelen ${response.status}\n${text.slice(0, 600)}`,
    );
  }
  return response;
}

async function expectHtml(response, needle, label) {
  const text = await response.text();
  if (!text.includes(needle)) {
    throw new Error(`${label}: yanıt içinde "${needle}" bulunamadı.\n${text.slice(0, 600)}`);
  }
  return text;
}

function csrfToken() {
  const token = jar.get('cigdem_csrf');
  if (!token) throw new Error('CSRF çerezi bulunamadı.');
  return token;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/`, { redirect: 'manual' });
      if (response.ok) return;
    } catch {
      // Sunucu henüz açılmamış olabilir.
    }
    await delay(500);
  }
  throw new Error('Sunucu zamanında başlamadı.');
}

async function login(email, password) {
  jar.clear();
  const page = await request('/giris');
  await expectStatus(page, 200, 'Giriş sayfası');
  await expectHtml(page, 'name="_csrf"', 'Giriş formu');

  const response = await request('/giris', {
    method: 'POST',
    form: { _csrf: csrfToken(), email, password },
  });
  await expectStatus(response, 302, `${email} girişi`);
  const location = response.headers.get('location') ?? '';
  if (!location) throw new Error('Giriş yönlendirmesi yok.');
  return location;
}

async function get(path, label, needle) {
  const response = await request(path);
  await expectStatus(response, 200, label);
  if (needle) await expectHtml(response, needle, label);
  return response;
}

const checks = [];
function ok(message) {
  checks.push(message);
  console.log(`  ✓ ${message}`);
}

async function main() {
  await waitForServer();
  ok('Sunucu yanıt veriyor');

  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  const home = await request('/');
  await expectStatus(home, 200, 'Ana sayfa');
  const homeHtml = await expectHtml(home, 'Çiğdemim Kütüphane', 'Ana sayfa');
  if (!homeHtml.includes('name="_csrf"') && !homeHtml.includes('/giris')) {
    throw new Error('Ana sayfada beklenen bağlantılar yok.');
  }
  ok('Ana sayfa açılıyor');

  await get('/kitaplar', 'Katalog', 'Tutunamayanlar');
  ok('Katalog listeleniyor');

  await get('/kitaplar?q=cigdem', 'Türkçe karakter araması');
  await get('/kitaplar?q=atay', 'Yazar araması', 'Oğuz Atay');
  ok('FTS araması çalışıyor');

  await get('/kitaplar/1', 'Kitap detayı', 'Tutunamayanlar');
  ok('Kitap detayı açılıyor');

  const anonymousAdmin = await request('/admin');
  await expectStatus(anonymousAdmin, 302, 'Yetkisiz yönetim erişimi');
  ok('Yetkisiz yönetim erişimi yönlendiriliyor');

  const adminPath = await login('admin@cigdemim.org', 'Cigdem2026!');
  if (!adminPath.startsWith('/admin')) throw new Error(`Beklenmeyen yönetici yönlendirmesi: ${adminPath}`);
  await get('/admin', 'Yönetim paneli', 'Kütüphane paneli');
  ok('Yönetici girişi ve panel');

  await get('/admin/kitaplar', 'Yönetim kitapları', 'Tutunamayanlar');
  await get('/admin/kitaplar/1', 'Yönetim kitap detayı', 'Kopyalar');
  await get('/admin/kitaplar/1/duzenle', 'Künye düzenleme', 'Kitap künyesini düzenle');
  await get('/admin/kitaplar/yeni', 'Yeni kitap formu', 'Open Library');
  ok('Kitap yönetimi ekranları');

  await get('/admin/uyeler', 'Üyeler', 'Zeynep Kaya');
  await get('/admin/talepler', 'Talepler', 'Ödünç talepleri');
  await get('/admin/oduncler', 'Ödünçler', 'Doğrudan ödünç ver');
  await get('/admin/ayarlar', 'Ayarlar', 'Kütüphane ayarları');
  await get('/admin/kayitlar', 'İşlem kayıtları', 'İşlem kayıtları');
  ok('Yönetim ekranları açılıyor');

  const unknown = await request('/bu-sayfa-yok');
  await expectStatus(unknown, 404, '404 sayfası');
  ok('404 sayfası');

  const memberPath = await login('mehmet@example.com', 'Uye2026!');
  if (!memberPath.startsWith('/hesabim')) throw new Error(`Beklenmeyen üye yönlendirmesi: ${memberPath}`);
  await get('/hesabim', 'Üye paneli', 'Gecikmiş');
  ok('Üye girişi ve panel');

  const bookId = db
    .prepare("SELECT id FROM books WHERE title = 'Küçük Prens'")
    .get().id;
  const createResponse = await request('/hesabim/talepler', {
    method: 'POST',
    form: {
      _csrf: csrfToken(),
      book_id: String(bookId),
      member_note: 'Smoke test talebi.',
    },
  });
  await expectStatus(createResponse, 302, 'Talep oluşturma');
  if (createResponse.headers.get('location') !== `/kitaplar/${bookId}`) {
    throw new Error('Talep sonrası beklenmeyen yönlendirme.');
  }
  ok('Üye ödünç talebi oluşturuyor');

  const requestRow = db
    .prepare(
      `SELECT r.id FROM borrow_requests r
       JOIN users u ON u.id = r.user_id
       WHERE u.email = 'mehmet@example.com' AND r.book_id = ? AND r.status = 'pending'
       ORDER BY r.id DESC LIMIT 1`,
    )
    .get(bookId);
  if (!requestRow) throw new Error('Veritabanında yeni talep bulunamadı.');

  await login('admin@cigdemim.org', 'Cigdem2026!');
  const copyRow = db
    .prepare("SELECT id FROM copies WHERE book_id = ? AND status = 'available' ORDER BY id LIMIT 1")
    .get(bookId);
  if (!copyRow) throw new Error('Onay için müsait kopya bulunamadı.');

  const approveResponse = await request(`/admin/talepler/${requestRow.id}/onayla`, {
    method: 'POST',
    form: {
      _csrf: csrfToken(),
      copy_id: String(copyRow.id),
      admin_note: 'Smoke test onayı.',
      return_to: '/admin/talepler',
    },
  });
  await expectStatus(approveResponse, 302, 'Talep onaylama');
  ok('Yönetici talebi onaylıyor ve kopya rezerve ediliyor');

  const fulfillResponse = await request(`/admin/talepler/${requestRow.id}/teslim`, {
    method: 'POST',
    form: { _csrf: csrfToken(), return_to: '/admin/talepler' },
  });
  await expectStatus(fulfillResponse, 302, 'Teslim işlemi');
  ok('Yönetici teslim işlemini yapıyor');

  const activePage = await get('/admin/oduncler?durum=active', 'Aktif ödünçler');
  const activeHtml = await expectHtml(activePage, 'Küçük Prens', 'Aktif ödünçler');
  if (!activeHtml.includes('İade al')) throw new Error('Aktif ödünçte iade düğmesi yok.');

  const loanRow = db
    .prepare(
      `SELECT l.id FROM loans l
       JOIN users u ON u.id = l.user_id
       JOIN books b ON b.id = l.book_id
       WHERE u.email = 'mehmet@example.com' AND b.id = ? AND l.returned_at IS NULL
       ORDER BY l.id DESC LIMIT 1`,
    )
    .get(bookId);
  if (!loanRow) throw new Error('Veritabanında yeni ödünç bulunamadı.');

  const returnResponse = await request(`/admin/oduncler/${loanRow.id}/iade`, {
    method: 'POST',
    form: { _csrf: csrfToken(), return_to: '/admin/oduncler?durum=active' },
  });
  await expectStatus(returnResponse, 302, 'İade işlemi');
  ok('Yönetici iade işlemini yapıyor');

  const copyAfter = db.prepare('SELECT status FROM copies WHERE id = ?').get(copyRow.id);
  if (copyAfter.status !== 'available') {
    throw new Error(`İade sonrası kopya durumu müsait değil: ${copyAfter.status}`);
  }
  ok('İade sonrası kopya yeniden müsait');

  const olResponse = await request('/admin/api/openlibrary/ara?q=tutunamayanlar');
  if (olResponse.status !== 200 && olResponse.status !== 502) {
    throw new Error(`Open Library araması beklenmeyen durum döndürdü: ${olResponse.status}`);
  }
  ok(`Open Library uç noktası yanıt veriyor (${olResponse.status})`);

  db.close();
  console.log(`\n${checks.length} kontrol başarılı.`);
}

main().catch((error) => {
  console.error(`\nSmoke test başarısız: ${error.message}`);
  process.exitCode = 1;
});
