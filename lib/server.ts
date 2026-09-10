import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import {
  defaults,
  normalSong,
  type Settings,
  type Person,
  type Song,
  type SessionSummary,
} from './shared';
import { starterSongs, type SongDraft } from './catalog';
export const runtime = env as unknown as {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_KEY?: string;
};
export function db() {
  return runtime.DB;
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export async function isAdmin() {
  const token = (await cookies()).get('ah_admin')?.value;
  return (
    !!runtime.ADMIN_KEY &&
    token === (await hash(runtime.ADMIN_KEY + '|admin-session'))
  );
}
export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('需要主理人登录');
}
export function cleanSessionId(value: unknown) {
  const id =
    typeof value === 'string' && /^session-[a-z0-9-]{1,40}$/.test(value)
      ? value
      : 'session-001';
  return id;
}
async function ensureLegacySession() {
  const exists = await db()
    .prepare('SELECT id FROM sessions WHERE id=?')
    .bind('session-001')
    .first();
  if (exists) return;
  const legacy = await db()
    .prepare('SELECT value FROM settings WHERE id=?')
    .bind('session')
    .first<{ value: string }>();
  const config = legacy ? JSON.parse(legacy.value) : defaults;
  await db().batch([
    db()
      .prepare(
        'INSERT OR IGNORE INTO sessions (id,slug,config,use_public_library,created) VALUES (?,?,?,?,?)',
      )
      .bind(
        'session-001',
        'session-001',
        JSON.stringify({ ...config, usePublicLibrary: true }),
        1,
        '2026-09-09T00:00:00.000Z',
      ),
    db().prepare(
      `INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final)
       SELECT 'session-001:' || id,'session-001',id,final FROM songs`,
    ),
  ]);
}
export async function settings(id = 'session-001'): Promise<Settings> {
  await ensureStarterSongs();
  await ensureLegacySession();
  const sessionId = cleanSessionId(id);
  const row = await db()
    .prepare('SELECT config,use_public_library FROM sessions WHERE id=?')
    .bind(sessionId)
    .first<{ config: string; use_public_library: number }>();
  if (!row) throw new Error('找不到这个 Session');
  const config = JSON.parse(row.config);
  return {
    ...config,
    usePublicLibrary: !!row.use_public_library,
    audienceVoteSeed: Math.max(
      3,
      Number(config.audienceVoteSeed || config.audienceMinimum || 3),
    ),
  };
}
export async function saveSettings(id: string, config: Settings) {
  const sessionId = cleanSessionId(id);
  await db()
    .prepare('UPDATE sessions SET config=?,use_public_library=? WHERE id=?')
    .bind(
      JSON.stringify(config),
      config.usePublicLibrary === false ? 0 : 1,
      sessionId,
    )
    .run();
}
export async function allSessions(): Promise<SessionSummary[]> {
  await ensureStarterSongs();
  await ensureLegacySession();
  const rows = await db()
    .prepare(
      `SELECT s.id,s.slug,s.config,s.created,COUNT(p.id) total
       FROM sessions s LEFT JOIN people p ON p.session_id=s.id AND p.status<>'draft'
       GROUP BY s.id ORDER BY s.created DESC`,
    )
    .all();
  const sessions = rows.results.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    config: JSON.parse(String(row.config)),
    total: Number(row.total || 0),
    created: String(row.created),
  }));
  const now = Date.now();
  function orderTime(session: SessionSummary) {
    const configured = session.config.selectedDate
      ? [session.config.selectedDate]
      : session.config.dates.map((date) => date.id);
    const times = configured
      .map((date) => Date.parse(date + '+08:00'))
      .filter(Number.isFinite);
    const next = times.filter((time) => time >= now).sort((a, b) => a - b)[0];
    if (next !== undefined) return { past: false, time: next };
    return {
      past: true,
      time: times.sort((a, b) => b - a)[0] || 0,
    };
  }
  return sessions.sort((a, b) => {
    const aOrder = orderTime(a);
    const bOrder = orderTime(b);
    if (aOrder.past !== bOrder.past) return aOrder.past ? 1 : -1;
    if (aOrder.time !== bOrder.time)
      return aOrder.past
        ? bOrder.time - aOrder.time
        : aOrder.time - bOrder.time;
    return b.created.localeCompare(a.created);
  });
}
export function person(row: Record<string, unknown>): Person {
  const {
    token_hash: _privateHash,
    password_hash: _passwordHash,
    contact_key: _contactKey,
    ...safe
  } = row;
  return {
    ...safe,
    slots: JSON.parse((row.slots as string) || '[]'),
    hasPassword: !!_passwordHash,
    availability: JSON.parse(row.availability as string),
    selections: JSON.parse(row.selections as string),
  } as unknown as Person;
}
export async function me(sessionId?: string) {
  const token = (await cookies()).get('ah_member')?.value;
  if (!token) return null;
  const row = await db()
    .prepare(
      sessionId
        ? 'SELECT * FROM people WHERE token_hash=? AND session_id=?'
        : 'SELECT * FROM people WHERE token_hash=?',
    )
    .bind(
      ...(sessionId
        ? [await hash(token), cleanSessionId(sessionId)]
        : [await hash(token)]),
    )
    .first();
  return row ? person(row) : null;
}
export async function allPeople(id = 'session-001') {
  const rows = await db()
    .prepare(
      "SELECT * FROM people WHERE session_id=? AND status<>'draft' ORDER BY created",
    )
    .bind(cleanSessionId(id))
    .all();
  return rows.results.map(person);
}
export async function allSongs(id = 'session-001'): Promise<Song[]> {
  await ensureStarterSongs();
  await ensureLegacySession();
  const sessionId = cleanSessionId(id);
  const session = await db()
    .prepare('SELECT use_public_library FROM sessions WHERE id=?')
    .bind(sessionId)
    .first<{ use_public_library: number }>();
  if (!session) throw new Error('找不到这个 Session');
  if (session.use_public_library)
    await db()
      .prepare(
        `INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final)
         SELECT ? || ':' || id,?,id,0 FROM songs`,
      )
      .bind(sessionId, sessionId)
      .run();
  const rows = await db()
    .prepare(
      `SELECT s.id,s.title,s.artist,s.normal,s.roles,
              s.preferred_key,s.version_url,s.nomination_note,ss.final
       FROM session_songs ss JOIN songs s ON s.id=ss.song_id
       WHERE ss.session_id=? ORDER BY s.rowid`,
    )
    .bind(sessionId)
    .all();
  return rows.results.map(
    (r) => ({ ...r, roles: JSON.parse(r.roles as string) }) as unknown as Song,
  );
}
export async function ensureStarterSongs() {
  const seeded = await db()
    .prepare('SELECT id FROM settings WHERE id=?')
    .bind('starter-song-pool-v1')
    .first();
  if (seeded) return;
  const statements = await Promise.all(
    starterSongs.map(async (s) => {
      const normal = normalSong(s.title, s.artist);
      return db()
        .prepare(
          'INSERT OR IGNORE INTO songs (id,title,artist,normal,roles,final,preferred_key,version_url,nomination_note) VALUES (?,?,?,?,?,0,?,?,?)',
        )
        .bind(
          await hash(normal),
          s.title,
          s.artist,
          normal,
          JSON.stringify(
            s.artist.includes('甜约翰')
              ? ['主唱', '吉他', '贝斯', '鼓', '键盘']
              : ['主唱', '吉他', '贝斯', '鼓'],
          ),
          '',
          s.version_url,
          '主理人预备曲目；调性及编曲待确认。',
        );
    }),
  );
  statements.push(
    db()
      .prepare('INSERT OR IGNORE INTO settings (id,value) VALUES (?,?)')
      .bind('starter-song-pool-v1', '1'),
  );
  await db().batch(statements);
}
export function songMetadata(data: Partial<SongDraft> = {}) {
  const preferred_key = str(data.preferred_key || '', 40),
    version_url = str(data.version_url || '', 2000),
    nomination_note = str(data.nomination_note || '', 500);
  if (version_url) {
    let url: URL;
    try {
      url = new URL(version_url);
    } catch {
      throw new Error('版本链接需要完整的 http 或 https 地址');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('版本链接需要完整的 http 或 https 地址');
  }
  return { preferred_key, version_url, nomination_note };
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin)
    throw new Error('请求来源不匹配');
}
export function str(v: unknown, max = 200) {
  if (typeof v !== 'string' || v.length > max)
    throw new Error('字段格式或长度不正确');
  return v.trim();
}
