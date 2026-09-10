import { cookies } from 'next/headers';
import {
  json,
  checkOrigin,
  str,
  hash,
  db,
  runtime,
  me,
  cleanSessionId,
} from '@/lib/server';
import {
  contactKey,
  scopedContactKey,
  passwordHash,
  verifyPassword,
  limitAccess,
} from '@/lib/registration-access';
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const data: any = await req.json();
    const sessionId = cleanSessionId(data.sessionId);
    const token = str(data.token || '', 150);
    const jar = await cookies();
    const options = {
      httpOnly: true,
      secure: new URL(req.url).protocol === 'https:',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    };
    if (data.type === 'admin') {
      await limitAccess(
        'admin',
        req.headers.get('cf-connecting-ip') || 'local',
        15,
      );
      if (
        !runtime.ADMIN_KEY ||
        (await hash(token)) !== (await hash(runtime.ADMIN_KEY))
      )
        return json({ error: '管理口令不正确' }, 403);
      jar.set(
        'ah_admin',
        await hash(runtime.ADMIN_KEY + '|admin-session'),
        options,
      );
    } else if (data.type === 'logout') {
      jar.delete('ah_admin');
    } else if (data.type === 'member-logout') {
      jar.delete('ah_member');
    } else if (data.type === 'set-password') {
      const current = await me(sessionId);
      if (!current) return json({ error: '请先打开自己的报名' }, 403);
      if (current.hasPassword)
        throw new Error('已有报名密码；忘记密码请联系主理人');
      await db()
        .prepare(
          'UPDATE people SET password_hash=?,contact_key=? WHERE id=? AND password_hash IS NULL',
        )
        .bind(
          await passwordHash(data.password),
          scopedContactKey(current.session_id || sessionId, current.contact),
          current.id,
        )
        .run();
    } else if (data.type === 'member') {
      const plainKey = contactKey(data.contact);
      const key = scopedContactKey(sessionId, data.contact);
      await limitAccess('member-contact', key);
      await limitAccess(
        'member-ip',
        req.headers.get('cf-connecting-ip') || 'local',
        40,
      );
      const row = await db()
        .prepare(
          `SELECT id,password_hash FROM people
           WHERE session_id=? AND (contact_key=? OR (?='session-001' AND contact_key=?))`,
        )
        .bind(sessionId, key, sessionId, plainKey)
        .first<{ id: string; password_hash: string | null }>();
      if (
        !(await verifyPassword(data.password, row?.password_hash || null)) ||
        !row
      )
        return json(
          { error: '联系方式或报名密码不正确；旧报名或忘记密码请联系主理人' },
          403,
        );
      const memberToken = crypto.randomUUID() + crypto.randomUUID();
      await db()
        .prepare('UPDATE people SET token_hash=? WHERE id=?')
        .bind(await hash(memberToken), row.id)
        .run();
      jar.set('ah_member', memberToken, options);
    } else throw new Error('请求无效');
    return json({ ok: true });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && !e.message.includes('D1_')
            ? e.message
            : '联系方式已被使用，请联系主理人',
      },
      400,
    );
  }
}
