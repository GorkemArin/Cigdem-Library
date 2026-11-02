import { getDb } from '../db/index.js';
import type { Loan, LoanWithDetails } from '../db/types.js';
import { addDays, todayIso } from '../lib/dates.js';

export function getLoanById(id: number): Loan | null {
  return (getDb().prepare('SELECT * FROM loans WHERE id = ?').get(id) as Loan | undefined) ?? null;
}

const DETAIL_COLUMNS = `
  l.*,
  u.full_name AS member_name,
  u.email AS member_email,
  b.title AS book_title,
  b.authors AS book_authors,
  c.inventory_no AS inventory_no
`;

export function getLoanWithDetails(id: number): LoanWithDetails | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${DETAIL_COLUMNS}
         FROM loans l
         JOIN users u ON u.id = l.user_id
         JOIN books b ON b.id = l.book_id
         JOIN copies c ON c.id = l.copy_id
         WHERE l.id = ?`,
      )
      .get(id) as LoanWithDetails | undefined) ?? null
  );
}

export function listUserLoans(userId: number): LoanWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM loans l
       JOIN users u ON u.id = l.user_id
       JOIN books b ON b.id = l.book_id
       JOIN copies c ON c.id = l.copy_id
       WHERE l.user_id = ?
       ORDER BY (l.returned_at IS NOT NULL), l.due_at ASC, l.id DESC`,
    )
    .all(userId) as LoanWithDetails[];
}

export function listUserActiveLoans(userId: number): LoanWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM loans l
       JOIN users u ON u.id = l.user_id
       JOIN books b ON b.id = l.book_id
       JOIN copies c ON c.id = l.copy_id
       WHERE l.user_id = ? AND l.returned_at IS NULL
       ORDER BY l.due_at ASC`,
    )
    .all(userId) as LoanWithDetails[];
}

export function findActiveLoanByCopy(copyId: number): Loan | null {
  return (
    (getDb()
      .prepare('SELECT * FROM loans WHERE copy_id = ? AND returned_at IS NULL')
      .get(copyId) as Loan | undefined) ?? null
  );
}

export function findActiveLoanForUserBook(userId: number, bookId: number): Loan | null {
  return (
    (getDb()
      .prepare(
        'SELECT * FROM loans WHERE user_id = ? AND book_id = ? AND returned_at IS NULL LIMIT 1',
      )
      .get(userId, bookId) as Loan | undefined) ?? null
  );
}

export function countActiveLoansForUser(userId: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS total FROM loans WHERE user_id = ? AND returned_at IS NULL')
    .get(userId) as { total: number };
  return row.total;
}

export function countOverdueLoansForUser(userId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total FROM loans
       WHERE user_id = ? AND returned_at IS NULL AND due_at < ?`,
    )
    .get(userId, todayIso()) as { total: number };
  return row.total;
}

export interface CreateLoanInput {
  copy_id: number;
  user_id: number;
  book_id: number;
  request_id?: number | null;
  loaned_by: number | null;
  due_at: string;
  notes?: string | null;
}

export function createLoan(input: CreateLoanInput): number {
  const db = getDb();

  return db.transaction(() => {
    const copy = db.prepare('SELECT * FROM copies WHERE id = ?').get(input.copy_id) as
      | { id: number; book_id: number; status: string }
      | undefined;

    if (!copy) throw new Error('Kopya bulunamadı.');
    if (copy.book_id !== input.book_id) throw new Error('Kopya bu kitaba ait değil.');
    if (copy.status !== 'available' && copy.status !== 'reserved') {
      throw new Error('Bu kopya şu anda ödünç verilebilir durumda değil.');
    }

    const existing = db
      .prepare('SELECT id FROM loans WHERE copy_id = ? AND returned_at IS NULL')
      .get(input.copy_id);
    if (existing) throw new Error('Bu kopya zaten ödünçte.');

    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(input.user_id) as
      | { status: string }
      | undefined;
    if (!user || user.status !== 'active') {
      throw new Error('Yalnızca aktif üyelere ödünç verilebilir.');
    }

    const result = db
      .prepare(
        `INSERT INTO loans (copy_id, book_id, user_id, request_id, loaned_by, due_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.copy_id,
        input.book_id,
        input.user_id,
        input.request_id ?? null,
        input.loaned_by,
        input.due_at,
        input.notes ?? null,
      );

    db.prepare(
      `UPDATE copies SET status = 'on_loan',
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    ).run(input.copy_id);

    if (input.request_id) {
      db.prepare(
        `UPDATE borrow_requests SET status = 'fulfilled', handled_by = ?, handled_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ? AND status = 'approved'`,
      ).run(input.loaned_by, input.request_id);
    }

    return Number(result.lastInsertRowid);
  })();
}

export function returnLoan(loanId: number, returnedBy: number): Loan {
  const db = getDb();

  return db.transaction(() => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as Loan | undefined;
    if (!loan) throw new Error('Ödünç kaydı bulunamadı.');
    if (loan.returned_at) throw new Error('Bu kitap zaten iade alınmış.');

    db.prepare(
      `UPDATE loans SET returned_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), returned_by = ?
       WHERE id = ?`,
    ).run(returnedBy, loanId);

    const copy = db.prepare('SELECT status FROM copies WHERE id = ?').get(loan.copy_id) as
      | { status: string }
      | undefined;
    if (copy && copy.status === 'on_loan') {
      db.prepare(
        `UPDATE copies SET status = 'available',
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?`,
      ).run(loan.copy_id);
    }

    return db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as Loan;
  })();
}

export function renewLoan(loanId: number, extraDays: number, maxRenewals: number): Loan {
  const db = getDb();

  return db.transaction(() => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as Loan | undefined;
    if (!loan) throw new Error('Ödünç kaydı bulunamadı.');
    if (loan.returned_at) throw new Error('İade edilmiş bir ödünç uzatılamaz.');
    if (loan.due_at < todayIso()) throw new Error('Gecikmiş ödünç uzatılamaz; önce iade alın.');
    if (loan.renew_count >= maxRenewals) throw new Error('Uzatma hakkı dolmuş.');

    const newDue = addDays(loan.due_at, extraDays);
    db.prepare('UPDATE loans SET due_at = ?, renew_count = renew_count + 1 WHERE id = ?').run(
      newDue,
      loanId,
    );

    return db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as Loan;
  })();
}

export type LoanFilter = 'active' | 'overdue' | 'returned' | 'all';

export interface LoanSearchParams {
  filter: LoanFilter;
  q?: string;
  page: number;
  perPage: number;
}

export interface LoanSearchResult {
  loans: LoanWithDetails[];
  total: number;
}

export function searchLoans(params: LoanSearchParams): LoanSearchResult {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];
  const today = todayIso();

  if (params.filter === 'active') {
    where.push('l.returned_at IS NULL');
  } else if (params.filter === 'overdue') {
    where.push('l.returned_at IS NULL AND l.due_at < ?');
    values.push(today);
  } else if (params.filter === 'returned') {
    where.push('l.returned_at IS NOT NULL');
  }

  if (params.q) {
    const like = `%${params.q}%`;
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR b.title LIKE ? OR c.inventory_no LIKE ?)');
    values.push(like, like, like, like);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const baseFrom = `
    FROM loans l
    JOIN users u ON u.id = l.user_id
    JOIN books b ON b.id = l.book_id
    JOIN copies c ON c.id = l.copy_id
  `;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`)
    .get(...values) as { total: number };

  const orderSql =
    params.filter === 'returned'
      ? 'ORDER BY l.returned_at DESC, l.id DESC'
      : 'ORDER BY (l.returned_at IS NOT NULL), l.due_at ASC, l.id DESC';

  const loans = db
    .prepare(
      `SELECT ${DETAIL_COLUMNS} ${baseFrom} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    )
    .all(...values, params.perPage, (params.page - 1) * params.perPage) as LoanWithDetails[];

  return { loans, total: totalRow.total };
}

export function listLoansForBook(bookId: number, limit = 20): LoanWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM loans l
       JOIN users u ON u.id = l.user_id
       JOIN books b ON b.id = l.book_id
       JOIN copies c ON c.id = l.copy_id
       WHERE l.book_id = ?
       ORDER BY l.id DESC LIMIT ?`,
    )
    .all(bookId, limit) as LoanWithDetails[];
}

export function countActiveLoans(): number {
  return (
    getDb().prepare('SELECT COUNT(*) AS total FROM loans WHERE returned_at IS NULL').get() as {
      total: number;
    }
  ).total;
}

export function countOverdueLoans(): number {
  return (
    getDb()
      .prepare(
        'SELECT COUNT(*) AS total FROM loans WHERE returned_at IS NULL AND due_at < ?',
      )
      .get(todayIso()) as { total: number }
  ).total;
}

export interface AvailableCopyOption {
  id: number;
  inventory_no: string;
  book_title: string;
  book_authors: string | null;
  shelf_location: string | null;
}

export function listAvailableCopiesForLoan(): AvailableCopyOption[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.inventory_no, c.shelf_location,
              b.title AS book_title, b.authors AS book_authors
       FROM copies c
       JOIN books b ON b.id = c.book_id
       WHERE c.status = 'available'
       ORDER BY b.title COLLATE NOCASE, c.inventory_no`,
    )
    .all() as AvailableCopyOption[];
}

export function listRecentLoans(limit = 8): LoanWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM loans l
       JOIN users u ON u.id = l.user_id
       JOIN books b ON b.id = l.book_id
       JOIN copies c ON c.id = l.copy_id
       ORDER BY l.id DESC LIMIT ?`,
    )
    .all(limit) as LoanWithDetails[];
}

export function popularBooks(limit = 5): Array<{ id: number; title: string; authors: string | null; loan_count: number }> {
  return getDb()
    .prepare(
      `SELECT b.id, b.title, b.authors, COUNT(l.id) AS loan_count
       FROM books b
       JOIN loans l ON l.book_id = b.id
       GROUP BY b.id
       ORDER BY loan_count DESC, b.title
       LIMIT ?`,
    )
    .all(limit) as Array<{ id: number; title: string; authors: string | null; loan_count: number }>;
}
