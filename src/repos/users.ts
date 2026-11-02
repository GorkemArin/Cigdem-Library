import { getDb } from '../db/index.js';
import type { Role, SessionUser, User, UserStatus } from '../db/types.js';
import { todayIso } from '../lib/dates.js';

const PUBLIC_USER_COLUMNS = `
  id, full_name, email, phone, role, status, member_no, address, notes, created_at, updated_at
`;

export function findUserByEmail(email: string): User | null {
  return (
    (getDb().prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as
      | User
      | undefined) ?? null
  );
}

export function findUserById(id: number): User | null {
  return (
    (getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null
  );
}

export function getPublicUserById(id: number): SessionUser | null {
  return (
    (getDb()
      .prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`)
      .get(id) as SessionUser | undefined) ?? null
  );
}

export interface CreateUserInput {
  full_name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  password_hash: string;
  role?: Role;
  status?: UserStatus;
}

export function createUser(input: CreateUserInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (full_name, email, phone, address, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.full_name,
      input.email,
      input.phone ?? null,
      input.address ?? null,
      input.password_hash,
      input.role ?? 'member',
      input.status ?? 'pending',
    );

  return Number(result.lastInsertRowid);
}

export function updateProfile(
  id: number,
  input: { full_name: string; phone?: string | null; address?: string | null },
): void {
  getDb()
    .prepare(
      `UPDATE users SET full_name = ?, phone = ?, address = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    )
    .run(input.full_name, input.phone ?? null, input.address ?? null, id);
}

export function updatePassword(id: number, passwordHash: string): void {
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    )
    .run(passwordHash, id);
}

export function setUserStatus(id: number, status: UserStatus): void {
  const db = getDb();
  if (status === 'active') {
    const year = todayIso().slice(0, 4);
    db.prepare(
      `UPDATE users SET status = ?,
         member_no = COALESCE(member_no, ?),
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    ).run(status, `CM-${year}-${String(id).padStart(4, '0')}`, id);
    return;
  }

  db.prepare(
    `UPDATE users SET status = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ?`,
  ).run(status, id);
}

export function setUserRole(id: number, role: Role): void {
  getDb()
    .prepare(
      `UPDATE users SET role = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
    )
    .run(role, id);
}

export interface MemberListItem extends SessionUser {
  active_loans: number;
  overdue_loans: number;
  open_requests: number;
}

export interface MemberSearchParams {
  q?: string;
  status?: UserStatus | 'all';
  role?: Role | 'all';
  page: number;
  perPage: number;
}

export interface MemberSearchResult {
  members: MemberListItem[];
  total: number;
}

export function searchMembers(params: MemberSearchParams): MemberSearchResult {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.q) {
    const like = `%${params.q}%`;
    where.push('(full_name LIKE ? OR email LIKE ? OR member_no LIKE ?)');
    values.push(like, like, like);
  }

  if (params.status && params.status !== 'all') {
    where.push('status = ?');
    values.push(params.status);
  }

  if (params.role && params.role !== 'all') {
    where.push('role = ?');
    values.push(params.role);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const today = todayIso();

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM users ${whereSql}`)
    .get(...values) as { total: number };

  const members = db
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS},
        (SELECT COUNT(*) FROM loans l WHERE l.user_id = users.id AND l.returned_at IS NULL) AS active_loans,
        (SELECT COUNT(*) FROM loans l WHERE l.user_id = users.id AND l.returned_at IS NULL AND l.due_at < ?) AS overdue_loans,
        (SELECT COUNT(*) FROM borrow_requests r WHERE r.user_id = users.id AND r.status IN ('pending', 'approved')) AS open_requests
       FROM users
       ${whereSql}
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, full_name COLLATE NOCASE
       LIMIT ? OFFSET ?`,
    )
    .all(today, ...values, params.perPage, (params.page - 1) * params.perPage) as MemberListItem[];

  return { members, total: totalRow.total };
}

export function listActiveMembers(): SessionUser[] {
  return getDb()
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM users
       WHERE status = 'active' ORDER BY full_name COLLATE NOCASE`,
    )
    .all() as SessionUser[];
}

export function countMembers(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS total FROM users').get() as { total: number };
  return row.total;
}

export function countAdmins(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { total: number };
  return row.total;
}

export function countPendingMembers(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS total FROM users WHERE status = 'pending'")
    .get() as { total: number };
  return row.total;
}
