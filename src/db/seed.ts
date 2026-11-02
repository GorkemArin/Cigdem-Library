import { config } from '../config.js';
import { closeDb, getDb } from './index.js';
import { hashPassword } from '../lib/security.js';
import { addCopies, createBook } from '../repos/books.js';
import { createUser, findUserByEmail, setUserStatus } from '../repos/users.js';
import { approveRequest, createRequest } from '../repos/requests.js';
import { addDays, todayIso } from '../lib/dates.js';

interface SeedBook {
  title: string;
  authors: string;
  publisher: string;
  published_year: number;
  page_count: number;
  language: string;
  categories: string;
  description: string;
  copies: number;
}

const DEMO_PASSWORD = 'Uye2026!';

const BOOKS: SeedBook[] = [
  {
    title: 'Tutunamayanlar',
    authors: 'Oğuz Atay',
    publisher: 'İletişim Yayınları',
    published_year: 1971,
    page_count: 724,
    language: 'tr',
    categories: 'Roman, Türk edebiyatı, Modern klasik',
    description:
      'Selim Işık’ın ardından kalan metinlerin peşine düşen Turgut Özben’in, bireyin toplumla ve kendisiyle hesaplaşmasını anlatan romanı. Türk edebiyatının dönüm noktalarından biri kabul edilir.',
    copies: 2,
  },
  {
    title: 'Kürk Mantolu Madonna',
    authors: 'Sabahattin Ali',
    publisher: 'Yapı Kredi Yayınları',
    published_year: 1943,
    page_count: 160,
    language: 'tr',
    categories: 'Roman, Türk edebiyatı, Aşk',
    description:
      'Berlin’de tanıştığı Maria Puder’e duyduğu aşkı yıllar sonra bir defter aracılığıyla anlatan Raif’in hikâyesi. Sessiz, içe dönük bir anlatımla insanın yalnızlığını ve tutunma çabasını işler.',
    copies: 2,
  },
  {
    title: 'Puslu Kıtalar Atlası',
    authors: 'İhsan Oktay Anar',
    publisher: 'İletişim Yayınları',
    published_year: 1995,
    page_count: 239,
    language: 'tr',
    categories: 'Roman, Tarihî kurgu, Fantastik',
    description:
      'On yedinci yüzyıl İstanbul’unda geçen, haritalar, düşler ve felsefi sorular etrafında örülen çok katmanlı bir roman. Okuru, gerçek ile hayalin sınırında gezdirir.',
    copies: 1,
  },
  {
    title: 'Küçük Prens',
    authors: 'Antoine de Saint-Exupéry',
    publisher: 'Can Yayınları',
    published_year: 1943,
    page_count: 96,
    language: 'tr',
    categories: 'Çocuk, Klasik, Felsefe',
    description:
      'Bir pilotun çölde karşılaştığı küçük gezegenli çocuğun gözünden büyüklerin dünyasını sorgulayan, her yaştan okura seslenen klasik.',
    copies: 2,
  },
  {
    title: 'Sefiller',
    authors: 'Victor Hugo',
    publisher: 'Can Yayınları',
    published_year: 1862,
    page_count: 1720,
    language: 'tr',
    categories: 'Klasik, Roman, Dünya edebiyatı',
    description:
      'Yoksulluk, adalet ve merhamet temaları etrafında birbirine bağlanan hayatlar üzerinden on dokuzuncu yüzyıl Fransa’sını anlatan büyük roman.',
    copies: 1,
  },
  {
    title: 'Bir Bilim Adamının Romanı',
    authors: 'Oğuz Atay',
    publisher: 'İletişim Yayınları',
    published_year: 1975,
    page_count: 272,
    language: 'tr',
    categories: 'Biyografi, Bilim, Türk edebiyatı',
    description:
      'İstanbul Teknik Üniversitesi’nde yetişen bir mühendis ve akademisyenin, Mustafa İnan’ın hayatı üzerinden Cumhuriyet dönemi bilim hayatına bakış.',
    copies: 1,
  },
  {
    title: 'Şeker Portakalı',
    authors: 'José Mauro de Vasconcelos',
    publisher: 'Can Yayınları',
    published_year: 1968,
    page_count: 182,
    language: 'tr',
    categories: 'Roman, Çocuk, Dünya edebiyatı',
    description:
      'Yoksul bir ailenin hayal gücü kuvvetli çocuğu Zezé’nin dünyayı, sevgiyi ve acıyı keşfedişini onun gözünden anlatan roman.',
    copies: 1,
  },
  {
    title: 'Sinekli Bakkal',
    authors: 'Halide Edib Adıvar',
    publisher: 'Can Yayınları',
    published_year: 1936,
    page_count: 480,
    language: 'tr',
    categories: 'Roman, Türk edebiyatı, Tarihî kurgu',
    description:
      'II. Abdülhamid dönemi İstanbul’unda bir mahalle ve o mahallenin insanları üzerinden gelenek, değişim ve toplumsal hayatı anlatan roman.',
    copies: 1,
  },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function seed(): void {
  const db = getDb();

  if (findUserByEmail(config.seedAdminEmail)) {
    console.log('Seed atlandı: yönetici hesabı zaten mevcut.');
    return;
  }

  const run = db.transaction(() => {
    const adminId = createUser({
      full_name: 'Kütüphane Yöneticisi',
      email: config.seedAdminEmail,
      password_hash: hashPassword(config.seedAdminPassword),
      role: 'admin',
      status: 'active',
    });
    setUserStatus(adminId, 'active');

    const ayseId = createUser({
      full_name: 'Ayşe Yılmaz',
      email: 'uye@cigdemim.org',
      phone: '0555 000 00 01',
      address: 'Çiğdem Mahallesi',
      password_hash: hashPassword(DEMO_PASSWORD),
      status: 'active',
    });
    setUserStatus(ayseId, 'active');

    const mehmetId = createUser({
      full_name: 'Mehmet Demir',
      email: 'mehmet@example.com',
      phone: '0555 000 00 02',
      password_hash: hashPassword(DEMO_PASSWORD),
      status: 'active',
    });
    setUserStatus(mehmetId, 'active');

    createUser({
      full_name: 'Zeynep Kaya',
      email: 'zeynep@example.com',
      phone: '0555 000 00 03',
      password_hash: hashPassword(DEMO_PASSWORD),
      status: 'pending',
    });

    const bookIds: Record<string, number> = {};
    for (const book of BOOKS) {
      const id = createBook({
        isbn13: null,
        isbn10: null,
        title: book.title,
        subtitle: null,
        authors: book.authors,
        publisher: book.publisher,
        published_year: book.published_year,
        language: book.language,
        page_count: book.page_count,
        categories: book.categories,
        description: book.description,
        cover_url: null,
        openlibrary_key: null,
      });
      addCopies(id, book.copies, { shelf_location: 'Salon A', condition: 'good' });
      bookIds[book.title] = id;
    }

    const copyFor = (bookId: number, index = 0): number => {
      const copies = db
        .prepare('SELECT id FROM copies WHERE book_id = ? ORDER BY id')
        .all(bookId) as Array<{ id: number }>;
      const copy = copies[index];
      if (!copy) throw new Error('Seed için kopya bulunamadı.');
      return copy.id;
    };

    // Ayşe'nin aktif ödüncü: 5 gün sonra teslim.
    const ayseLoanCopy = copyFor(bookIds['Kürk Mantolu Madonna']!, 0);
    const ayseLoan = db
      .prepare(
        `INSERT INTO loans (copy_id, book_id, user_id, loaned_by, loaned_at, due_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ayseLoanCopy,
        bookIds['Kürk Mantolu Madonna'],
        ayseId,
        adminId,
        isoDaysAgo(16),
        addDays(todayIso(), 5),
      );
    db.prepare("UPDATE copies SET status = 'on_loan' WHERE id = ?").run(ayseLoanCopy);

    // Mehmet'in gecikmiş ödüncü.
    const mehmetLoanCopy = copyFor(bookIds['Puslu Kıtalar Atlası']!, 0);
    db.prepare(
      `INSERT INTO loans (copy_id, book_id, user_id, loaned_by, loaned_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      mehmetLoanCopy,
      bookIds['Puslu Kıtalar Atlası'],
      mehmetId,
      adminId,
      isoDaysAgo(30),
      addDays(todayIso(), -3),
    );
    db.prepare("UPDATE copies SET status = 'on_loan' WHERE id = ?").run(mehmetLoanCopy);

    // Geçmişte iade edilmiş bir ödünç.
    db.prepare(
      `INSERT INTO loans
        (copy_id, book_id, user_id, loaned_by, loaned_at, due_at, returned_at, returned_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      copyFor(bookIds['Şeker Portakalı']!, 0),
      bookIds['Şeker Portakalı'],
      ayseId,
      adminId,
      isoDaysAgo(40),
      isoDaysAgo(19),
      isoDaysAgo(12),
      adminId,
    );

    // Bekleyen talep.
    createRequest(ayseId, bookIds['Tutunamayanlar']!, 'Hafta sonu teslim alabilirim.');

    // Onaylanmış, teslim bekleyen talep.
    const approved = createRequest(mehmetId, bookIds['Sefiller']!, null);
    approveRequest(
      approved,
      copyFor(bookIds['Sefiller']!, 0),
      adminId,
      'Teslim için kütüphaneye bekliyoruz.',
    );

    console.log('Örnek veriler oluşturuldu.');
    console.log(`Yönetici: ${config.seedAdminEmail} / ${config.seedAdminPassword}`);
    console.log(`Demo üye: uye@cigdemim.org / ${DEMO_PASSWORD}`);
  });

  run();
}

try {
  seed();
} finally {
  closeDb();
}
