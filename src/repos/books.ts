import { getDb } from '../db/index.js';
import type { Book, BookWithStock, Copy, CopyCondition, CopyStatus } from '../db/types.js';

export interface BookInput {
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  subtitle: string | null;
  authors: string | null;
  publisher: string | null;
  published_year: number | null;
  language: string;
  page_count: number | null;
  categories: string | null;
  description: string | null;
  cover_url: string | null;
  openlibrary_key: string | null;
}

export interface BookSearchParams {
  q?: string;
  availableOnly?: boolean;
  language?: string;
  page: number;
  perPage: number;
  sort?: 'relevance' | 'newest' | 'title';
}

export interface BookSearchResult {
  books: BookWithStock[];
  total: number;
}

function makeFtsQuery(q: string): string | null {
  const tokens = q
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token}*`).join(' ');
}

const STOCK_SELECT = `
  (SELECT COUNT(*) FROM copies c
    WHERE c.book_id = b.id AND c.status NOT IN ('withdrawn', 'lost')) AS total_copies,
  (SELECT COUNT(*) FROM copies c
    WHERE c.book_id = b.id AND c.status = 'available') AS available_copies
`;

export function searchBooks(params: BookSearchParams): BookSearchResult {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];
  const joins: string[] = [];
  const ftsQuery = params.q ? makeFtsQuery(params.q) : null;

  if (ftsQuery) {
    joins.push('JOIN books_fts ON books_fts.rowid = b.id');
    where.push('books_fts MATCH ?');
    values.push(ftsQuery);
  }

  if (params.availableOnly) {
    where.push(
      "EXISTS (SELECT 1 FROM copies c WHERE c.book_id = b.id AND c.status = 'available')",
    );
  }

  if (params.language) {
    where.push('b.language = ?');
    values.push(params.language);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const joinSql = joins.join(' ');

  let orderSql = 'ORDER BY b.created_at DESC, b.id DESC';
  if (ftsQuery && (params.sort === 'relevance' || !params.sort)) {
    orderSql = 'ORDER BY bm25(books_fts), b.title COLLATE NOCASE';
  } else if (params.sort === 'title') {
    orderSql = 'ORDER BY b.title COLLATE NOCASE, b.id';
  }

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM books b ${joinSql} ${whereSql}`)
    .get(...values) as { total: number };

  const rows = db
    .prepare(
      `SELECT b.*, ${STOCK_SELECT}
       FROM books b ${joinSql} ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
    )
    .all(...values, params.perPage, (params.page - 1) * params.perPage) as BookWithStock[];

  return { books: rows, total: totalRow.total };
}

export function getBookById(id: number): Book | null {
  return (getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as Book | undefined) ?? null;
}

export function getBookWithStock(id: number): BookWithStock | null {
  return (
    (getDb()
      .prepare(`SELECT b.*, ${STOCK_SELECT} FROM books b WHERE b.id = ?`)
      .get(id) as BookWithStock | undefined) ?? null
  );
}

export function findBookByIsbn(isbn13: string | null, isbn10: string | null): Book | null {
  if (!isbn13 && !isbn10) return null;
  return (
    (getDb()
      .prepare(
        `SELECT * FROM books
         WHERE (? IS NOT NULL AND isbn13 = ?)
            OR (? IS NOT NULL AND isbn10 = ?)
         LIMIT 1`,
      )
      .get(isbn13, isbn13, isbn10, isbn10) as Book | undefined) ?? null
  );
}

export function createBook(input: BookInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO books
        (isbn13, isbn10, title, subtitle, authors, publisher, published_year,
         language, page_count, categories, description, cover_url, openlibrary_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.isbn13,
      input.isbn10,
      input.title,
      input.subtitle,
      input.authors,
      input.publisher,
      input.published_year,
      input.language,
      input.page_count,
      input.categories,
      input.description,
      input.cover_url,
      input.openlibrary_key,
    );

  return Number(result.lastInsertRowid);
}

export function updateBook(id: number, input: BookInput): void {
  getDb()
    .prepare(
      `UPDATE books SET
         isbn13 = ?, isbn10 = ?, title = ?, subtitle = ?, authors = ?, publisher = ?,
         published_year = ?, language = ?, page_count = ?, categories = ?, description = ?,
         cover_url = ?, openlibrary_key = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    )
    .run(
      input.isbn13,
      input.isbn10,
      input.title,
      input.subtitle,
      input.authors,
      input.publisher,
      input.published_year,
      input.language,
      input.page_count,
      input.categories,
      input.description,
      input.cover_url,
      input.openlibrary_key,
      id,
    );
}

export function listCopies(bookId: number): Copy[] {
  return getDb()
    .prepare('SELECT * FROM copies WHERE book_id = ? ORDER BY inventory_no')
    .all(bookId) as Copy[];
}

export function listAvailableCopies(bookId: number): Copy[] {
  return getDb()
    .prepare(
      "SELECT * FROM copies WHERE book_id = ? AND status = 'available' ORDER BY inventory_no",
    )
    .all(bookId) as Copy[];
}

export function getCopyById(id: number): Copy | null {
  return (getDb().prepare('SELECT * FROM copies WHERE id = ?').get(id) as Copy | undefined) ?? null;
}

export function nextInventoryNo(): string {
  const row = getDb()
    .prepare(
      `SELECT MAX(CAST(SUBSTR(inventory_no, 4) AS INTEGER)) AS max_no
       FROM copies WHERE inventory_no LIKE 'CM-%'`,
    )
    .get() as { max_no: number | null };

  const next = (row.max_no ?? 0) + 1;
  return `CM-${String(next).padStart(4, '0')}`;
}

export interface CopyInput {
  inventory_no?: string | null;
  condition?: CopyCondition;
  shelf_location?: string | null;
  acquired_at?: string | null;
  notes?: string | null;
}

export function addCopy(bookId: number, input: CopyInput): number {
  const inventoryNo = input.inventory_no?.trim() || nextInventoryNo();
  const result = getDb()
    .prepare(
      `INSERT INTO copies (book_id, inventory_no, condition, shelf_location, acquired_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      bookId,
      inventoryNo,
      input.condition ?? 'good',
      input.shelf_location ?? null,
      input.acquired_at ?? null,
      input.notes ?? null,
    );

  return Number(result.lastInsertRowid);
}

export function addCopies(
  bookId: number,
  count: number,
  options: { shelf_location?: string | null; condition?: CopyCondition } = {},
): number[] {
  const db = getDb();
  const ids: number[] = [];
  const insert = db.prepare(
    `INSERT INTO copies (book_id, inventory_no, condition, shelf_location)
     VALUES (?, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const inventoryNo = nextInventoryNo();
      const result = insert.run(
        bookId,
        inventoryNo,
        options.condition ?? 'good',
        options.shelf_location ?? null,
      );
      ids.push(Number(result.lastInsertRowid));
    }
  })();

  return ids;
}

export function updateCopyStatus(copyId: number, status: CopyStatus): void {
  getDb()
    .prepare(
      `UPDATE copies SET status = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    )
    .run(status, copyId);
}

export function deleteCopy(copyId: number): void {
  getDb().prepare('DELETE FROM copies WHERE id = ?').run(copyId);
}

export function copyUsageCounts(copyId: number): { loans: number; requests: number } {
  const row = getDb()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM loans WHERE copy_id = ?) AS loans,
        (SELECT COUNT(*) FROM borrow_requests WHERE copy_id = ?) AS requests`,
    )
    .get(copyId, copyId) as { loans: number; requests: number };
  return row;
}

export function listLanguages(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT language, COUNT(*) AS total FROM books
       GROUP BY language ORDER BY total DESC, language`,
    )
    .all() as Array<{ language: string; total: number }>;
  return rows.map((row) => row.language);
}
