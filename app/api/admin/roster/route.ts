import {
  db,
  settings,
  allSongs,
  person,
  json,
  requireAdmin,
  checkOrigin,
  str,
  hash,
  cleanSessionId,
} from '@/lib/server';
import { normalSong, ROLES, type Person, type Selection } from '@/lib/shared';

// Host-only additive import. Blank contacts are intentional, never login identifiers.
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await requireAdmin();
    const data: any = await req.json();
    const sessionId = cleanSessionId(data.sessionId),
      config = await settings(sessionId);
    if (
      config.matchingPublishedAt ||
      !['intent', 'curating'].includes(config.phase)
    )
      throw new Error('请先回到收集意向阶段再导入');
    if (
      !Array.isArray(data.songs) ||
      !data.songs.length ||
      data.songs.length > 100
    )
      throw new Error('歌曲清单无效');
    const deadline =
      data.intentDeadline === undefined
        ? config.intentDeadline
        : str(data.intentDeadline, 30);
    if (
      deadline &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline) ||
        Number.isNaN(Date.parse(deadline + '+08:00')))
    )
      throw new Error('截止时间无效');
    const existingSongs = await allSongs(sessionId);
    const rows = await db()
      .prepare('SELECT * FROM people WHERE session_id=?')
      .bind(sessionId)
      .all();
    const existing = rows.results.map(person);
    const changes = new Map<string, { record: Person; isNew: boolean }>();
    const statements: D1PreparedStatement[] = [];
    const normalized = (name: string) =>
      name.normalize('NFKC').trim().toLowerCase();
    let newSongs = 0;
    for (const item of data.songs) {
      const title = str(item.title, 100);
      if (!title || !Array.isArray(item.members))
        throw new Error('歌名或成员清单无效');
      const found = item.id
        ? existingSongs.find((s) => s.id === item.id)
        : existingSongs.find((s) => normalized(s.title) === normalized(title));
      if (item.id && !found) throw new Error('指定歌曲不存在');
      const artist = found?.artist || str(item.artist || '原唱待确认', 100);
      const normal = normalSong(title, artist),
        songId = found?.id || (await hash(normal));
      if (!found) {
        newSongs++;
        statements.push(
          db()
            .prepare(
              'INSERT OR IGNORE INTO songs (id,title,artist,normal,roles,final) VALUES (?,?,?,?,?,0)',
            )
            .bind(
              songId,
              title,
              artist,
              normal,
              JSON.stringify(['主唱', '吉他', '贝斯', '鼓']),
            ),
        );
      }
      statements.push(
        db()
          .prepare(
            'INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final) VALUES (?,?,?,0)',
          )
          .bind(sessionId + ':' + songId, sessionId, songId),
      );
      for (const member of item.members) {
        const name = str(member.name, 50);
        if (
          !name ||
          !Array.isArray(member.roles) ||
          !member.roles.length ||
          member.roles.some((r: string) => !ROLES.includes(r))
        )
          throw new Error('成员姓名或角色无效');
        const holds: string[] = member.manualStandbyRoles || [];
        if (
          !Array.isArray(holds) ||
          holds.some((r) => !member.roles.includes(r))
        )
          throw new Error('补位角色无效');
        const matches = member.personId
          ? existing.filter((p) => p.id === member.personId)
          : existing.filter((p) => normalized(p.name) === normalized(name));
        if (matches.length > 1 || (member.personId && !matches.length))
          throw new Error('请核对同名报名或成员编号：' + name);
        const previous = matches[0];
        if (previous && previous.participation !== 'performer')
          throw new Error('已有非排练报名，请先核对身份：' + name);
        const id =
          previous?.id ||
          'pre-' + (await hash(sessionId + '|' + normalized(name)));
        if (!changes.has(id))
          changes.set(id, {
            isNew: !previous,
            record: previous
              ? {
                  ...previous,
                  selections: [...previous.selections],
                  slots: [...previous.slots],
                }
              : {
                  id,
                  session_id: sessionId,
                  name,
                  contact: '',
                  hasPassword: false,
                  participation: 'performer',
                  availability: [],
                  selections: [],
                  slots: [],
                  note: '主理人预登记；联系方式与可参加时间待本人确认。',
                  status: 'intent',
                  assignment: '',
                  receipt: null,
                  payment_method: null,
                  review_note: '',
                  created: new Date().toISOString(),
                },
          });
        const p = changes.get(id)!.record,
          old = p.selections.find((s) => s.songId === songId);
        const note = str(member.roleNote || '', 200);
        const heldRoles = [
          ...new Set([
            ...(old?.manualStandbyRoles || []).filter(
              (r) => !member.roles.includes(r),
            ),
            ...holds,
          ]),
        ];
        const selection: Selection = {
          ...old,
          songId,
          priority: old?.priority || 3,
          roles: [
            ...new Set([...(old?.roles || []), ...member.roles]),
          ] as string[],
          manualStandbyRoles: heldRoles,
          ...(member.substitute === undefined
            ? {}
            : { substitute: member.substitute === true }),
          nomination_note:
            note && !old?.nomination_note?.includes(note)
              ? [old?.nomination_note, note].filter(Boolean).join('；')
              : old?.nomination_note || '',
        };
        p.selections = [
          ...p.selections.filter((s) => s.songId !== songId),
          selection,
        ];
        p.slots = p.slots.filter(
          (s) => s.songId !== songId || !heldRoles.includes(s.role),
        );
      }
    }
    for (const { record: p, isNew } of changes.values()) {
      if (isNew)
        statements.push(
          db()
            .prepare(
              "INSERT INTO people (id,session_id,token_hash,name,contact,availability,selections,note,participation,status,created) VALUES (?,?,?,?,'','[]',?,?,'performer','intent',?)",
            )
            .bind(
              p.id,
              sessionId,
              await hash(crypto.randomUUID() + crypto.randomUUID()),
              p.name,
              JSON.stringify(p.selections),
              p.note,
              p.created,
            ),
        );
      else
        statements.push(
          db()
            .prepare(
              "UPDATE people SET selections=?,slots=?,status=CASE WHEN status='draft' OR (status='invited' AND ?=0) THEN 'intent' ELSE status END WHERE id=? AND session_id=?",
            )
            .bind(
              JSON.stringify(p.selections),
              JSON.stringify(p.slots),
              p.slots.length,
              p.id,
              sessionId,
            ),
        );
    }
    statements.push(
      db()
        .prepare('UPDATE sessions SET config=? WHERE id=?')
        .bind(
          JSON.stringify({ ...config, intentDeadline: deadline }),
          sessionId,
        ),
    );
    await db().batch(statements);
    return json({
      ok: true,
      songs: data.songs.length,
      newSongs,
      people: changes.size,
      created: [...changes.values()].filter((p) => p.isNew).length,
      updated: [...changes.values()].filter((p) => !p.isNew).length,
      intentDeadline: deadline,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && !e.message.includes('D1_')
            ? e.message
            : '导入失败，请刷新后核对记录',
      },
      400,
    );
  }
}
