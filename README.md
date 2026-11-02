# Çiğdemim Kütüphane

Çiğdem Mahallesi'ndeki Çiğdemim Derneği için geliştirilen, yerel olarak çalışan mahalle kütüphanesi yönetim uygulaması.

Sunucu tarafında çalışır, verileri SQLite veritabanında tutar ve tüm işlemler tarayıcıdan yapılır. Amaç; kitap künyelerini standart alanlarla kaydetmek, katalogda arama yapmak, ödünç talebi → yönetici onayı → elden teslim → iade akışını yönetmek ve kitap künyelerini Open Library ile zenginleştirmektir.

## Özellikler

- **Rol bazlı erişim:** `admin` (kütüphane yöneticisi) ve `member` (standart üye).
- **Üyelik başvurusu:** Kayıt olan üye `pending` durumunda başlar; yönetici onaylayınca aktifleşir ve üye numarası atanır.
- **Katalog:** Kitap adı, yazar, ISBN, konu ve açıklama üzerinde Türkçe karakterlere duyarlı olmayan FTS5 araması; dil ve müsaitlik filtresi.
- **Kopya bazlı envanter:** Her fiziksel kitap ayrı envanter numarası ve durum ile izlenir (`available`, `on_loan`, `reserved`, `lost`, `repair`, `withdrawn`).
- **Ödünç akışı:** Üye talep oluşturur → yönetici uygun kopyayı rezerve eder → teslimde ödünç kaydı açılır → iade alındığında kopya yeniden müsait olur.
- **Ödünç yönetimi:** Gecikme takibi, süre uzatma, üye başına açık ödünç/talep limiti, teslim tarihi hesaplama.
- **Open Library entegrasyonu:** ISBN veya kitap adı/yazar ile künye arama; seçilen sonucu forma otomatik doldurma; kapak görseli desteği.
- **Yönetim araçları:** Üye onaylama/askıya alma, rol değiştirme, ayarlar, denetim kaydı, panel istatistikleri.
- **Güvenlik:** scrypt şifre hash'i, veritabanı tabanlı oturumlar, HttpOnly çerez, CSRF koruması, giriş/kayıt hız sınırı, Helmet CSP.

## Teknoloji

- Node.js 22+ (geliştirme Node 24 ile yapıldı)
- TypeScript
- Express 5
- better-sqlite3 (SQLite, FTS5)
- EJS (sunucu taraflı şablonlar)
- Zod (form doğrulama)
- Özel CSS + az miktarda vanilla JavaScript

## Kurulum

```bash
npm install
copy .env.example .env
npm run seed
npm run dev
```

Uygulama: <http://localhost:3000>

`.env` dosyası yoksa varsayılan değerler kullanılır. Sunucuya taşımadan önce `SESSION_SECRET` için uzun ve rastgele bir değer belirleyin.

### Demo hesaplar

| Rol | E-posta | Şifre |
| --- | --- | --- |
| Yönetici | `admin@cigdemim.org` | `Cigdem2026!` |
| Üye (aktif) | `uye@cigdemim.org` | `Uye2026!` |
| Üye (aktif, gecikmiş ödünç) | `mehmet@example.com` | `Uye2026!` |
| Üye (onay bekliyor) | `zeynep@example.com` | `Uye2026!` |

Seed betiği idempotenttir: yönetici e-postası zaten kayıtlıysa tekrar veri eklemez.

### Veritabanını sıfırlama

```bash
# Windows PowerShell
Remove-Item data\library.db, data\library.db-wal, data\library.db-shm -ErrorAction SilentlyContinue
npm run seed
```

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (tsx watch) |
| `npm run build` | TypeScript derlemesi + görünüm/statik dosya kopyalama |
| `npm start` | Derlenmiş uygulamayı çalıştırma |
| `npm run seed` | Örnek verileri oluşturma |
| `npm run typecheck` | TypeScript tip kontrolü |
| `npm test` | Birim testleri |
| `node scripts/smoke.mjs` | Çalışan sunucuya karşı uçtan uca HTTP duman testi |

Duman testi sunucu çalışırken ayrı bir terminalde çalıştırılmalıdır. Test; giriş, katalog, yönetim ekranları, talep oluşturma, onay, teslim ve iade akışını denetler.

## Proje yapısı

```text
src/
  app.ts              Express uygulaması, güvenlik başlıkları, rotalar
  server.ts           Sunucuyu başlatma ve kapatma
  config.ts           Ortam değişkenleri ve sabitler
  db/                 Şema, migration, bağlantı, tipler, seed
  repos/              Veritabanı sorguları ve iş akışları
  routes/             Genel, hesap, kimlik doğrulama ve yönetim rotaları
  middleware/         Oturum bağlamı, CSRF, yetki, hız sınırı
  lib/                ISBN, tarih, doğrulama, Open Library, güvenlik
views/                EJS şablonları
public/               CSS, JS, logo
tests/                Node test runner birim testleri
scripts/              Duman testi ve derleme yardımcıları
```

## İş akışı

1. Üye kayıt olur (`pending`).
2. Yönetici üyeliği onaylar (`active`), üye numarası atanır.
3. Üye katalogda kitap bulur ve talep oluşturur (`pending`).
4. Yönetici talebi uygun bir kopyayla onaylar (`approved`, kopya `reserved`).
5. Kitap elden teslim edilir; sistem ödünç kaydını açar (`fulfilled`, kopya `on_loan`).
6. İade alındığında ödünç kapanır ve kopya yeniden `available` olur.

## Open Library notları

- Arama: `https://openlibrary.org/search.json`
- ISBN araması önce search uç noktasını, sonuç yoksa `/isbn/{isbn}.json` edition kaydını dener.
- Kapaklar `https://covers.openlibrary.org` üzerinden gelir; CSP bu alan adına izin verir.
- Open Library'ye erişim yoksa form elle doldurulabilir; uygulamanın geri kalanı çalışmaya devam eder.
- Otomatik gelen künye her zaman kontrol edilmelidir; özellikle Türkçe baskılarda yayınevi/yıl bilgisi eksik veya farklı olabilir.

## Üretime geçmeden önce

- `.env` içinde güçlü bir `SESSION_SECRET` belirleyin ve `NODE_ENV=production` kullanın.
- HTTPS arkasında çalıştırın (oturum çerezi `secure` olur).
- Veritabanı yedeği için `data/library.db` dosyasını düzenli olarak yedekleyin.
- Derneğin KVKK aydınlatma metni ve açık rıza metnini ekleyin.
- E-posta doğrulama ve şifre sıfırlama akışını tamamlayın.
- Yönetici hesaplarını ve demo hesapları üretim verisinden kaldırın.

## Yol haritası fikirleri

- **Rezervasyon kuyruğu:** Müsait olmayan kitaplar için sıra; iade geldiğinde sıradaki üyeye otomatik rezerve.
- **Barkod / QR etiketleri:** Envanter numarasından yazdırılabilir etiketler ve telefonla hızlı teslim/iade.
- **E-posta hatırlatmaları:** Teslim tarihinden önce ve gecikmede otomatik bildirim.
- **Şifre sıfırlama ve e-posta doğrulama.**
- **Bağış kitap modülü:** Bağışçı, edinme kaynağı ve bağış makbuzu takibi.
- **Raporlar:** Aylık ödünç, en çok okunanlar, üye aktivitesi, kayıp/hasar oranı; CSV dışa aktarma.
- **KVKK metinleri ve veri silme talepleri.**
- **Çoklu şube / raf yönetimi** ve kitap konum haritası.
- **Etkinlik takvimi:** Mahalle okuma grubu, yazar buluşması, çocuk atölyesi.
- **Türkçe MARC/UNIMARC uyumu** ve toplu ISBN içe aktarma.
- **PostgreSQL'e geçiş** ve yedekleme otomasyonu.

## Lisans

Bu proje Çiğdemim Derneği için yerel kullanım amacıyla geliştirilmiştir. Lisans ve kullanım koşulları dernek yönetimiyle netleştirilecektir.

## Demo Hesaplar

- Rol	E-posta	Şifre
- Yönetici	admin@cigdemim.org	Cigdem2026!
- Aktif üye	uye@cigdemim.org	Uye2026!
- Aktif üye (gecikmiş ödünç)	mehmet@example.com	Uye2026!
- Onay bekleyen üye	zeynep@example.com	Uye2026!