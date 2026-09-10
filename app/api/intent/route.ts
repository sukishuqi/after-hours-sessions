import { cookies } from 'next/headers';
import {
  db,
  settings,
  me,
  json,
  checkOrigin,
  str,
  hash,
  allSongs,
  songMetadata,
  cleanSessionId,
} from '@/lib/server';
import { expired, normalSong, ROLES, type Selection } from '@/lib/shared';
import {
  contactKey,
  scopedContactKey,
  passwordHash,
} from '@/lib/registration-access';
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const data: any = await req.json();
    const sessionId = cleanSessionId(data.sessionId);
    const cfg = await settings(sessionId);
    const participation = data.participation || 'performer';
    if (!['performer', 'audience', 'openjam'].includes(participation))
      throw new Error('请选择参与方式');
    const performing = participation === 'performer';
    const rehearsalOpen =
      cfg.phase === 'intent' && !expired(cfg.intentDeadline);
    const guestOpen = cfg.phase === 'closed' && !performing;
    if (!rehearsalOpen && !guestOpen)
      return json(
        {
          error: performing
            ? '排练名额已锁定。'
            : '当前未开放登记，请联系主理人。',
        },
        409,
      );
    const name = str(data.name, 50),
      contact = str(data.contact, 150),
      note = str(data.note || '', 500);
    if (!name || !contact) throw new Error('请填写名字和联系方式');
    const current = await me(sessionId);
    if (current && current.status !== 'intent')
      throw new Error('安排已经确认，修改请联系主理人');
    const plainKey = contactKey(contact);
    const key = scopedContactKey(sessionId, contact);
    const duplicate = await db()
      .prepare(
        'SELECT id FROM people WHERE session_id=? AND (contact_key=? OR (contact_key IS NULL AND lower(trim(contact))=?))',
      )
      .bind(
        sessionId,
        key,
        sessionId === 'session-001' ? plainKey : contact.toLowerCase(),
      )
      .first<{ id: string }>();
    if (duplicate && duplicate.id !== current?.id)
      throw new Error(
        '这份联系方式已有报名，请从“查找我的报名”进入；旧报名请联系主理人',
      );
    const credential = current?.hasPassword
      ? null
      : await passwordHash(data.password);
    const availability = data.availability;
    if (
      !Array.isArray(availability) ||
      !availability.length ||
      availability.some((d: unknown) => !cfg.dates.some((c) => c.id === d))
    )
      throw new Error('请选择可参加的时间');
    if (
      !Array.isArray(data.selections) ||
      (performing && data.selections.length < 1) ||
      data.selections.length > 100
    )
      throw new Error('请至少选择一首意向歌曲；一次最多提交 100 首');
    const existing = await allSongs(sessionId);
    const selections: Selection[] = [];
    const statements: D1PreparedStatement[] = [];
    for (const [index, c] of data.selections.entries()) {
      const priority = c.priority ?? (index === 0 ? 1 : index === 1 ? 2 : 3);
      if (![1, 2, 3].includes(priority)) throw new Error('歌曲优先级无效');
      if (
        performing &&
        priority !== 3 &&
        selections.some((s) => s.priority === priority)
      )
        throw new Error('第一、第二优先各只能选择一首');
      if (
        performing &&
        (!Array.isArray(c.roles) ||
          !c.roles.length ||
          c.roles.some((r: string) => !ROLES.includes(r)))
      )
        throw new Error('请选择你能承担的角色');
      let songId = c.songId;
      if (c.newSong) {
        const title = str(c.newSong.title, 100),
          artist = str(c.newSong.artist, 100);
        if (!title || !artist) throw new Error('新歌需要歌名和歌手／乐队');
        const normal = normalSong(title, artist);
        songId = await hash(normal);
        const meta = songMetadata(c.newSong);
        statements.push(
          db()
            .prepare(
              'INSERT OR IGNORE INTO songs (id,title,artist,normal,roles,final,preferred_key,version_url,nomination_note) VALUES (?,?,?,?,?,0,?,?,?)',
            )
            .bind(
              songId,
              title,
              artist,
              normal,
              JSON.stringify(['主唱', '吉他', '贝斯', '鼓']),
              meta.preferred_key,
              meta.version_url,
              meta.nomination_note,
            ),
        );
        statements.push(
          db()
            .prepare(
              'INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final) VALUES (?,?,?,0)',
            )
            .bind(sessionId + ':' + songId, sessionId, songId),
        );
      } else if (!existing.some((s) => s.id === songId))
        throw new Error('歌曲不存在，请刷新');
      if (selections.some((s) => s.songId === songId))
        throw new Error('两首意向歌曲不能重复');
      selections.push({
        ...songMetadata(c.newSong || c),
        priority: performing ? priority : 3,
        songId,
        roles: performing ? ([...new Set(c.roles)] as string[]) : [],
      });
    }
    if (
      performing &&
      (!selections.some((s) => s.priority === 1) ||
        (selections.length > 1 && !selections.some((s) => s.priority === 2)))
    )
      throw new Error('请标明第一优先；选择多首时也需标明第二优先');
    const token = current ? null : crypto.randomUUID() + crypto.randomUUID();
    const id = current?.id || crypto.randomUUID();
    if (current) {
      statements.push(
        db()
          .prepare(
            'UPDATE people SET name=?,contact=?,availability=?,selections=?,note=?,participation=?,contact_key=?,password_hash=COALESCE(?,password_hash) WHERE id=? AND status=?',
          )
          .bind(
            name,
            contact,
            JSON.stringify(availability),
            JSON.stringify(selections),
            note,
            participation,
            key,
            credential,
            id,
            'intent',
          ),
      );
    } else {
      statements.push(
        db()
          .prepare(
            'INSERT INTO people (id,token_hash,name,contact,availability,selections,note,created,participation,contact_key,password_hash,session_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            await hash(token!),
            name,
            contact,
            JSON.stringify(availability),
            JSON.stringify(selections),
            note,
            new Date().toISOString(),
            participation,
            key,
            credential,
            sessionId,
          ),
      );
    }
    await db().batch(statements);
    if (token)
      (await cookies()).set('ah_member', token, {
        httpOnly: true,
        secure: new URL(req.url).protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 90,
      });
    return json({ ok: true });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && !e.message.includes('D1_')
            ? e.message
            : '提交失败；如已有报名，请先查找我的报名',
      },
      400,
    );
  }
}
