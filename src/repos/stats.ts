import { getDb } from '../db/index.js';
import { todayIso } from '../lib/dates.js';
import { countActiveLoans, countOverdueLoans } from './loans.js';
import { countPendingRequests } from './requests.js';

export interface PublicStats {
  books: number;
  copies: number;
  active_members: number;
  active_loans: number;
}

export function getPublicStats(): PublicStats {
  const db = getDb();
  const books = (db.prepare('SELECT COUNT(*) AS total FROM books').get() as { total: number }).total;
  const copies = (
    db
      .prepare("SELECT COUNT(*) AS total FROM copies WHERE status NOT IN ('withdrawn', 'lost')")
      .get() as { total: number }
  ).total;
  const activeMembers = (
    db.prepare("SELECT COUNT(*) AS total FROM users WHERE status = 'active'").get() as {
      total: number;
    }
  ).total;

  return {
    books,
    copies,
    active_members: activeMembers,
    active_loans: countActiveLoans(),
  };
}

export interface DashboardStats {
  books: number;
  copies: number;
  active_members: number;
  pending_members: number;
  active_loans: number;
  overdue_loans: number;
  pending_requests: number;
  available_copies: number;
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const single = (sql: string): number => (db.prepare(sql).get() as { total: number }).total;

  return {
    books: single('SELECT COUNT(*) AS total FROM books'),
    copies: single("SELECT COUNT(*) AS total FROM copies WHERE status NOT IN ('withdrawn', 'lost')"),
    active_members: single("SELECT COUNT(*) AS total FROM users WHERE status = 'active'"),
    pending_members: single("SELECT COUNT(*) AS total FROM users WHERE status = 'pending'"),
    active_loans: countActiveLoans(),
    overdue_loans: countOverdueLoans(),
    pending_requests: countPendingRequests(),
    available_copies: single("SELECT COUNT(*) AS total FROM copies WHERE status = 'available'"),
  };
}

export interface MonthlyLoans {
  month: string;
  label: string;
  total: number;
}

const MONTH_LABELS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function getMonthlyLoans(months = 6): MonthlyLoans[] {
  const rows = getDb()
    .prepare(
      `SELECT strftime('%Y-%m', loaned_at) AS month, COUNT(*) AS total
       FROM loans
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?`,
    )
    .all(months) as Array<{ month: string; total: number }>;

  return rows
    .map((row) => {
      const monthIndex = Number(row.month.slice(5, 7)) - 1;
      return {
        month: row.month,
        label: MONTH_LABELS[monthIndex] ?? row.month,
        total: row.total,
      };
    })
    .reverse();
}

export function getOverdueSummary(): { total: number; today: string } {
  return { total: countOverdueLoans(), today: todayIso() };
}
