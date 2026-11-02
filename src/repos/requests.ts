import { getDb } from '../db/index.js';
import type { RequestWithDetails, RequestStatus } from '../db/types.js';

const DETAIL_COLUMNS = `
  r.*,
  u.full_name AS member_name,
  u.email AS member_email,
  b.title AS book_title,
  b.authors AS book_authors,
  c.inventory_no AS copy_inventory_no
`;

export function createRequest(userId: number, bookId: number, note: string | null): number {
  const result = getDb()
    .prepare(
      `INSERT INTO borrow_requests (user_id, book_id, member_note)
       VALUES (?, ?, ?)`,
    )
    .run(userId, bookId, note);

  return Number(result.lastInsertRowid);
}

export function findOpenRequestForUserBook(userId: number, bookId: number): { id: number; status: string } | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, status FROM borrow_requests
         WHERE user_id = ? AND book_id = ? AND status IN ('pending', 'approved')
         ORDER BY id DESC LIMIT 1`,
      )
      .get(userId, bookId) as { id: number; status: string } | undefined) ?? null
  );
}

export function countOpenRequestsForUser(userId: number): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM borrow_requests
         WHERE user_id = ? AND status IN ('pending', 'approved')`,
      )
      .get(userId) as { total: number }
  ).total;
}

export function listUserRequests(userId: number): RequestWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM borrow_requests r
       JOIN users u ON u.id = r.user_id
       JOIN books b ON b.id = r.book_id
       LEFT JOIN copies c ON c.id = r.copy_id
       WHERE r.user_id = ?
       ORDER BY (r.status IN ('pending', 'approved')) DESC, r.id DESC`,
    )
    .all(userId) as RequestWithDetails[];
}

export function getRequestWithDetails(id: number): RequestWithDetails | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${DETAIL_COLUMNS}
         FROM borrow_requests r
         JOIN users u ON u.id = r.user_id
         JOIN books b ON b.id = r.book_id
         LEFT JOIN copies c ON c.id = r.copy_id
         WHERE r.id = ?`,
      )
      .get(id) as RequestWithDetails | undefined) ?? null
  );
}

export type RequestFilter = 'open' | 'pending' | 'approved' | 'closed' | 'all';

export interface RequestSearchParams {
  filter: RequestFilter;
  page: number;
  perPage: number;
}

export interface RequestSearchResult {
  requests: RequestWithDetails[];
  total: number;
}

export function searchRequests(params: RequestSearchParams): RequestSearchResult {
  const db = getDb();
  let whereSql = '';

  if (params.filter === 'open') {
    whereSql = "WHERE r.status IN ('pending', 'approved')";
  } else if (params.filter === 'closed') {
    whereSql = "WHERE r.status IN ('rejected', 'cancelled', 'fulfilled')";
  } else if (params.filter !== 'all') {
    whereSql = 'WHERE r.status = ?';
  }

  const values: unknown[] = params.filter === 'pending' || params.filter === 'approved'
    ? [params.filter]
    : [];

  const baseFrom = `
    FROM borrow_requests r
    JOIN users u ON u.id = r.user_id
    JOIN books b ON b.id = r.book_id
    LEFT JOIN copies c ON c.id = r.copy_id
  `;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`)
    .get(...values) as { total: number };

  const requests = db
    .prepare(
      `SELECT ${DETAIL_COLUMNS} ${baseFrom} ${whereSql}
       ORDER BY (r.status = 'pending') DESC, (r.status = 'approved') DESC, r.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...values, params.perPage, (params.page - 1) * params.perPage) as RequestWithDetails[];

  return { requests, total: totalRow.total };
}

export function approveRequest(
  requestId: number,
  copyId: number,
  adminId: number,
  adminNote: string | null,
): void {
  const db = getDb();

  db.transaction(() => {
    const request = db.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(requestId) as
      | { id: number; status: RequestStatus; book_id: number }
      | undefined;
    if (!request) throw new Error('Talep bulunamadı.');
    if (request.status !== 'pending') throw new Error('Yalnızca bekleyen talepler onaylanabilir.');

    const copy = db.prepare('SELECT * FROM copies WHERE id = ?').get(copyId) as
      | { id: number; book_id: number; status: string }
      | undefined;
    if (!copy || copy.book_id !== request.book_id) throw new Error('Seçilen kopya bu kitaba ait değil.');
    if (copy.status !== 'available') throw new Error('Seçilen kopya müsait değil.');

    db.prepare(
      `UPDATE copies SET status = 'reserved',
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    ).run(copyId);

    db.prepare(
      `UPDATE borrow_requests
       SET status = 'approved', copy_id = ?, admin_note = ?, handled_by = ?,
           handled_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    ).run(copyId, adminNote, adminId, requestId);
  })();
}

export function closeRequest(
  requestId: number,
  status: 'rejected' | 'cancelled',
  adminId: number | null,
  adminNote: string | null,
): void {
  const db = getDb();

  db.transaction(() => {
    const request = db.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(requestId) as
      | { id: number; status: RequestStatus; copy_id: number | null }
      | undefined;
    if (!request) throw new Error('Talep bulunamadı.');
    if (!['pending', 'approved'].includes(request.status)) {
      throw new Error('Bu talep zaten kapatılmış.');
    }

    if (request.status === 'approved' && request.copy_id) {
      const copy = db.prepare('SELECT status FROM copies WHERE id = ?').get(request.copy_id) as
        | { status: string }
        | undefined;
      if (copy?.status === 'reserved') {
        db.prepare(
          `UPDATE copies SET status = 'available',
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE id = ?`,
        ).run(request.copy_id);
      }
    }

    db.prepare(
      `UPDATE borrow_requests
       SET status = ?, admin_note = COALESCE(?, admin_note), handled_by = ?,
           handled_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    ).run(status, adminNote, adminId, requestId);
  })();
}

export function cancelOwnRequest(requestId: number, userId: number): void {
  const db = getDb();

  db.transaction(() => {
    const request = db.prepare('SELECT * FROM borrow_requests WHERE id = ? AND user_id = ?').get(
      requestId,
      userId,
    ) as { id: number; status: RequestStatus } | undefined;

    if (!request) throw new Error('Talep bulunamadı.');
    if (request.status !== 'pending') {
      throw new Error('Yalnızca onay bekleyen talepler iptal edilebilir.');
    }

    db.prepare(`UPDATE borrow_requests SET status = 'cancelled' WHERE id = ?`).run(requestId);
  })();
}

export function countPendingRequests(): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS total FROM borrow_requests WHERE status = 'pending'")
      .get() as { total: number }
  ).total;
}

export function countOpenRequests(): number {
  return (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS total FROM borrow_requests WHERE status IN ('pending', 'approved')",
      )
      .get() as { total: number }
  ).total;
}

export function findApprovedRequestForCopy(copyId: number): { id: number } | null {
  return (
    (getDb()
      .prepare(
        "SELECT id FROM borrow_requests WHERE copy_id = ? AND status = 'approved' LIMIT 1",
      )
      .get(copyId) as { id: number } | undefined) ?? null
  );
}

export function listRecentRequests(limit = 8): RequestWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM borrow_requests r
       JOIN users u ON u.id = r.user_id
       JOIN books b ON b.id = r.book_id
       LEFT JOIN copies c ON c.id = r.copy_id
       ORDER BY (r.status = 'pending') DESC, r.id DESC
       LIMIT ?`,
    )
    .all(limit) as RequestWithDetails[];
}

export function listRequestsForBook(bookId: number, limit = 10): RequestWithDetails[] {
  return getDb()
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM borrow_requests r
       JOIN users u ON u.id = r.user_id
       JOIN books b ON b.id = r.book_id
       LEFT JOIN copies c ON c.id = r.copy_id
       WHERE r.book_id = ?
       ORDER BY (r.status = 'pending') DESC, r.id DESC
       LIMIT ?`,
    )
    .all(bookId, limit) as RequestWithDetails[];
}
