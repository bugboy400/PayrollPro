import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function hashToken(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }
export function randomToken() { return crypto.randomBytes(32).toString('hex'); }
export async function passwordHash(password) { return bcrypt.hash(password, 12); }
export function sanitizeAudit(value) {
  const blocked = /password|token|secret|hash|jwt|authorization|cookie|refresh|api.?key|recovery/i;
  if (Array.isArray(value)) return value.map(sanitizeAudit);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k,v] of Object.entries(value)) if (!blocked.test(k)) out[k] = sanitizeAudit(v);
    return out;
  }
  return value;
}
export function changedFields(before, after, keys) {
  const changes = {};
  for (const key of keys) {
    const a = before?.[key] instanceof Date ? before[key].toISOString() : before?.[key];
    const b = after?.[key] instanceof Date ? after[key].toISOString() : after?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}
