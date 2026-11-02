import { getDb } from '../db/index.js';
import type { AuditEntry } from '../db/types.js';

export function logAudit(
  actorId: number | null,
  action: string,
  entityType: string | null = null,
  entityId: number | null = null,
  details: Record<string, unknown> | string | null = null,
): void {
  let serialized: string | null = null;
  if (typeof details === 'string') {
    serialized = details.slice(0, 2000);
  } else if (details) {
    serialized = JSON.stringify(details).slice(0, 2000);
  }

  getDb()
    .prepare(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(actorId, action, entityType, entityId, serialized);
}

export function listAudit(limit = 100): AuditEntry[] {
  return getDb()
    .prepare(
      `SELECT a.id, a.actor_id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
              u.full_name AS actor_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.id DESC
       LIMIT ?`,
    )
    .all(limit) as AuditEntry[];
}
