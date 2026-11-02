import type { SessionUser } from '../db/types.js';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { randomToken, sha256 } from './security.js';

export interface CreatedSession {
  token: string;
  expiresAt: string;
}

export function createSession(userId: number): CreatedSession {
  const db = getDb();
  const token = randomToken();
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, ?)`,
  ).run(sha256(token), userId, expires);

  return { token, expiresAt: expires };
}

export function getSessionUser(token: string): SessionUser | null {
  const db = getDb();
  const tokenHash = sha256(token);

  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.member_no,
              u.address, u.notes, u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    )
    .get(tokenHash) as SessionUser | undefined;

  return row ?? null;
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function deleteOtherSessions(userId: number, keepToken: string): void {
  getDb()
    .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
    .run(userId, sha256(keepToken));
}

export function cleanupSessions(): void {
  getDb()
    .prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')")
    .run();
}
