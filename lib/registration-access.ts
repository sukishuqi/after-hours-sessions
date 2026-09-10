import { db, hash, str } from './server';

// A contact identifies a registration; it is never proof of ownership.
export function contactKey(value: unknown) {
  const contact = str(value, 150).normalize('NFKC').trim().toLowerCase();
  if (!contact) throw new Error('请填写联系方式');
  // Keep phone country codes explicit. Do not guess a country for the caller.
  return /^[+\d\s().-]+$/.test(contact)
    ? contact.replace(/[\s().-]/g, '')
    : contact;
}
export function scopedContactKey(sessionId: string, value: unknown) {
  return sessionId + '|' + contactKey(value);
}
export async function passwordHash(value: unknown, salt = crypto.randomUUID()) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    throw new Error('报名密码需要 8–128 个字符');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(value),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return (
    salt +
    ':' +
    Array.from(new Uint8Array(bits), (x) =>
      x.toString(16).padStart(2, '0'),
    ).join('')
  );
}
export async function verifyPassword(value: unknown, stored: string | null) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    return false;
  const candidate = await passwordHash(
    value,
    stored?.split(':')[0] || 'missing-registration',
  );
  if (!stored || candidate.length !== stored.length) return false;
  let difference = 0;
  for (let i = 0; i < candidate.length; i++)
    difference |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
  return difference === 0;
}
export async function limitAccess(
  scope: string,
  identity: string,
  maximum = 8,
) {
  const id = await hash(scope + '|' + identity),
    now = Date.now();
  const row = await db()
    .prepare(
      'INSERT INTO access_attempts (id,attempts,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING attempts',
    )
    .bind(id, now + 10 * 60 * 1000, now, now)
    .first<{ attempts: number }>();
  if (!row || row.attempts > maximum)
    throw new Error('尝试过于频繁，请 10 分钟后再试');
}
