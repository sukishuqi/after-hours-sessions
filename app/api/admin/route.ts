import {
  db,
  settings,
  allPeople,
  allSongs,
  json,
  requireAdmin,
  checkOrigin,
  str,
  hash,
  songMetadata,
  cleanSessionId,
  saveSettings,
  allSessions,
} from '@/lib/server';
import {
  scoreTimes,
  normalSong,
  ROLES,
  defaults,
  type Settings,
} from '@/lib/shared';
import { scopedContactKey, passwordHash } from '@/lib/registration-access';
import { matchLineup, savedLineup, slotsFor } from '@/lib/matching';
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    if (url.searchParams.get('view') === 'sessions')
      return json({ sessions: await allSessions() });
    const sessionId = cleanSessionId(url.searchParams.get('session'));
    const [config, people, songs] = await Promise.all([
      settings(sessionId),
      allPeople(sessionId),
      allSongs(sessionId),
    ]);
    return json({
      config,
      people: people.map((p) => ({ ...p, token_hash: undefined })),
      songs,
      scores: scoreTimes(config.dates, songs, people),
      lineup: config.matchingPublishedAt
        ? savedLineup(songs, people)
        : matchLineup(songs, people, config.selectedDate),
    });
  } catch {
    return json({ error: '需要主理人登录' }, 403);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await requireAdmin();
    const data: any = await req.json();
    const sessionId = cleanSessionId(data.sessionId);
    if (data.action === 'cleanup-registrations') {
      const config = await settings(sessionId);
      if (
        config.matchingPublishedAt ||
        !['intent', 'curating'].includes(config.phase)
      )
        throw new Error('请先回到收集意向阶段再清理');
      const operationId = str(data.operationId, 80);
      if (!/^[a-z0-9-]{1,80}$/.test(operationId))
        throw new Error('清理编号无效');
      const removals = data.removePeople || [],
        roleEdits = data.removeRoles || [];
      if (
        !Array.isArray(removals) ||
        !Array.isArray(roleEdits) ||
        (!removals.length && !roleEdits.length) ||
        removals.length + roleEdits.length > 30
      )
        throw new Error('清理清单无效');
      const archiveId = 'registration-trash:' + sessionId + ':' + operationId;
      const request = JSON.stringify({ removals, roleEdits });
      const archived = await db()
        .prepare('SELECT value FROM settings WHERE id=?')
        .bind(archiveId)
        .first<{ value: string }>();
      if (archived) {
        if (JSON.parse(archived.value).request !== request)
          throw new Error('清理编号已被其他操作使用');
        return json({
          ok: true,
          alreadyApplied: true,
          removed: removals.length,
          edited: roleEdits.length,
        });
      }
      const rows: Record<string, unknown>[] = [];
      const ids = new Set<string>();
      const statements: D1PreparedStatement[] = [];
      for (const item of [...removals, ...roleEdits]) {
        const id = str(item.id, 150),
          name = str(item.name, 50);
        if (ids.has(id)) throw new Error('重复目标');
        ids.add(id);
        const row = await db()
          .prepare(
            'SELECT * FROM people WHERE id=? AND session_id=? AND name=?',
          )
          .bind(id, sessionId, name)
          .first<Record<string, unknown>>();
        if (!row) throw new Error('报名记录已变化，请重新核对姓名');
        if (
          row.receipt ||
          ['pending', 'confirmed'].includes(String(row.status))
        )
          throw new Error('记录包含付款信息，不能作为测试数据清理');
        rows.push(row);
        if (removals.includes(item))
          statements.push(
            db()
              .prepare(
                'DELETE FROM people WHERE id=? AND session_id=? AND name=?',
              )
              .bind(id, sessionId, name),
          );
        else {
          if (
            !Array.isArray(item.roles) ||
            !item.roles.length ||
            item.roles.some((role: string) => !ROLES.includes(role))
          )
            throw new Error('移除角色无效');
          const selections = JSON.parse(String(row.selections))
            .map((s: any) => ({
              ...s,
              roles: s.roles.filter((r: string) => !item.roles.includes(r)),
              manualStandbyRoles: (s.manualStandbyRoles || []).filter(
                (r: string) => !item.roles.includes(r),
              ),
            }))
            .filter((s: any) => s.roles.length);
          const slots = JSON.parse(String(row.slots || '[]')).filter(
            (s: any) => !item.roles.includes(s.role),
          );
          statements.push(
            db()
              .prepare(
                'UPDATE people SET selections=?,slots=? WHERE id=? AND session_id=?',
              )
              .bind(
                JSON.stringify(selections),
                JSON.stringify(slots),
                id,
                sessionId,
              ),
          );
        }
      }
      // Archive full original rows inside the protected database for recovery.
      statements.unshift(
        db()
          .prepare('INSERT INTO settings (id,value) VALUES (?,?)')
          .bind(
            archiveId,
            JSON.stringify({
              request,
              created: new Date().toISOString(),
              rows,
            }),
          ),
      );
      await db().batch(statements);
      return json({
        ok: true,
        removed: removals.length,
        edited: roleEdits.length,
      });
    } else if (data.action === 'create-session') {
      const sessions = await allSessions();
      const next =
        Math.max(
          1,
          ...sessions.map((s) => Number(s.slug.match(/\d+$/)?.[0] || 0)),
        ) + 1;
      const id = `session-${String(next).padStart(3, '0')}`;
      const title = str(data.title, 100);
      const location = str(data.location || '地点待定', 150);
      const dates = Array.isArray(data.dates)
        ? data.dates
            .map((value: unknown) => str(value, 30))
            .filter((value: string) =>
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value),
            )
        : [];
      if (!title || !dates.length)
        throw new Error('请填写活动名称和至少一个候选时间');
      const config: Settings = {
        ...defaults,
        title,
        location,
        dates: dates.map((value: string) => ({
          id: value,
          label: new Intl.DateTimeFormat('zh-SG', {
            timeZone: 'Asia/Singapore',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(value + ':00+08:00')),
        })),
        deposit: str(data.deposit || '10', 20),
        usePublicLibrary: data.usePublicLibrary !== false,
        audienceVoteSeed: Math.max(
          3,
          Math.floor(Number(data.audienceVoteSeed) || 3),
        ),
      };
      if (
        !Number.isFinite(Number(config.deposit)) ||
        Number(config.deposit) <= 0
      )
        throw new Error('请填写有效定金金额');
      await db()
        .prepare(
          'INSERT INTO sessions (id,slug,config,use_public_library,created) VALUES (?,?,?,?,?)',
        )
        .bind(
          id,
          id,
          JSON.stringify(config),
          config.usePublicLibrary ? 1 : 0,
          new Date().toISOString(),
        )
        .run();
      if (config.usePublicLibrary)
        await db()
          .prepare(
            `INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final)
             SELECT ? || ':' || id,?,id,0 FROM songs`,
          )
          .bind(id, id)
          .run();
      return json({ ok: true, sessionId: id });
    } else if (data.action === 'reset-member-password') {
      const p = (await allPeople(sessionId)).find((p) => p.id === data.id);
      if (!p) throw new Error('找不到报名记录');
      const contact = p.contact || str(data.contact, 150);
      if (!contact) throw new Error('请先核实并填写本人的联系方式');
      const duplicate = await db()
        .prepare(
          'SELECT id FROM people WHERE session_id=? AND contact_key=? AND id<>?',
        )
        .bind(sessionId, scopedContactKey(sessionId, contact), p.id)
        .first();
      if (duplicate)
        throw new Error('该联系方式已有报名，请先核对，不要重复绑定');
      await db()
        .prepare(
          'UPDATE people SET password_hash=?,contact_key=?,token_hash=?,contact=? WHERE id=?',
        )
        .bind(
          await passwordHash(data.password),
          scopedContactKey(sessionId, contact),
          await hash(crypto.randomUUID()),
          contact,
          p.id,
        )
        .run();
    } else if (data.action === 'add-song') {
      const cfg = await settings(sessionId);
      if (
        cfg.matchingPublishedAt ||
        !['intent', 'curating'].includes(cfg.phase)
      )
        throw new Error('最终歌单已发布；请先暂停收款再修改');
      const title = str(data.song?.title, 100),
        artist = str(data.song?.artist, 100);
      if (!title || !artist) throw new Error('新歌需要歌名和歌手／乐队');
      const meta = songMetadata(data.song),
        normal = normalSong(title, artist);
      const songId = await hash(normal);
      await db()
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
        )
        .run();
      await db()
        .prepare(
          'INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final) VALUES (?,?,?,0)',
        )
        .bind(sessionId + ':' + songId, sessionId, songId)
        .run();
    } else if (data.action === 'config') {
      const old = await settings(sessionId);
      const input = data.config;
      const phases = ['intent', 'curating', 'payment', 'locking', 'closed'];
      if (!phases.includes(input.phase)) throw new Error('无效阶段');
      const config: Settings = {
        ...old,
        title: str(input.title, 100),
        location: str(input.location, 150),
        phase: input.phase,
        intentDeadline: str(input.intentDeadline, 30),
        paymentDeadline: str(input.paymentDeadline, 30),
        selectedDate: str(input.selectedDate, 30),
        deposit: str(input.deposit, 20),
        paymentInfo: str(input.paymentInfo, 1000),
        refundInfo: str(input.refundInfo, 1000),
        usePublicLibrary: input.usePublicLibrary !== false,
        audienceVoteSeed: Math.max(
          3,
          Math.floor(
            Number(input.audienceVoteSeed || input.audienceMinimum) || 3,
          ),
        ),
      };
      delete (config as Settings & { audienceMinimum?: number })
        .audienceMinimum;
      for (const v of [config.intentDeadline, config.paymentDeadline])
        if (
          v &&
          (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ||
            isNaN(Date.parse(v + '+08:00')))
        )
          throw new Error('截止时间无效');
      if (
        !config.title ||
        !Number.isFinite(Number(config.deposit)) ||
        Number(config.deposit) <= 0
      )
        throw new Error('请填写标题和有效定金金额');
      if (
        config.selectedDate &&
        !config.dates.some((d) => d.id === config.selectedDate)
      )
        throw new Error('选定时间无效');
      if (config.phase === 'locking' || config.phase === 'payment') {
        if (
          !config.selectedDate ||
          !config.paymentInfo ||
          !config.refundInfo ||
          (!config.paynowQR && !config.wechatQR) ||
          !config.paymentDeadline
        )
          throw new Error(
            '开放定金前，请选定时间，填写付款截止时间、付款说明和退款规则，并上传至少一个收款码',
          );
        const songs = await allSongs(sessionId);
        if (!songs.some((s) => s.final))
          throw new Error('请先确认至少一首最终歌曲');
      }
      if (
        old.matchingPublishedAt &&
        ['intent', 'curating'].includes(config.phase)
      ) {
        delete config.matchingPublishedAt;
        await db()
          .prepare('DELETE FROM settings WHERE id=?')
          .bind('lineup-publication:' + sessionId)
          .run();
      }
      if (config.phase === 'locking' && !old.matchingPublishedAt) {
        if (!['curating', 'payment'].includes(old.phase))
          throw new Error('请先切换到整理歌单并保存，再发布匹配名单');
        const [songs, people] = await Promise.all([
          allSongs(sessionId),
          allPeople(sessionId),
        ]);
        if (
          songs.filter((s) => s.final === 1).length > 6 ||
          songs.filter((s) => s.final === 2).length > 2
        )
          throw new Error('整场最多 6 首正式歌曲和 2 首备用歌曲');
        if (!songs.some((s) => s.final === 1))
          throw new Error('请先确认至少一首正式歌曲');
        const lineup = matchLineup(songs, people, config.selectedDate);
        // The host's selected setlist is authoritative. House musicians can
        // cover missing roles; existing matched members retain payable slots.
        config.matchingPublishedAt = new Date().toISOString();
        const updates = people
          .filter((p) => p.participation === 'performer')
          .map((p) => {
            const slots = slotsFor(p.id, lineup),
              matchedStatus = slots.some((s) => s.kind === 'main')
                ? 'invited'
                : slots.length
                  ? 'standby'
                  : 'unmatched',
              status =
                p.receipt &&
                slots.some((s) => s.kind === 'main') &&
                ['pending', 'confirmed', 'rejected'].includes(p.status)
                  ? p.status
                  : matchedStatus;
            const assignment = slots
              .map(
                (slot) =>
                  `${songs.find((s) => s.id === slot.songId)?.title} / ${slot.role} / ${slot.kind === 'reserve' ? '备用' : '正式'}`,
              )
              .join('\n');
            return db()
              .prepare(
                'UPDATE people SET slots=?,status=?,assignment=? WHERE id=?',
              )
              .bind(JSON.stringify(slots), status, assignment, p.id);
          });
        // A unique publication marker makes competing publish requests atomic.
        await db().batch([
          db()
            .prepare('INSERT INTO settings (id,value) VALUES (?,?)')
            .bind(
              'lineup-publication:' + sessionId,
              config.matchingPublishedAt,
            ),
          ...updates,
          db()
            .prepare(
              'UPDATE sessions SET config=?,use_public_library=? WHERE id=?',
            )
            .bind(
              JSON.stringify(config),
              config.usePublicLibrary === false ? 0 : 1,
              sessionId,
            ),
        ]);
        return json({ ok: true });
      }
      if (config.usePublicLibrary && old.usePublicLibrary === false)
        await db()
          .prepare(
            `INSERT OR IGNORE INTO session_songs (id,session_id,song_id,final)
             SELECT ? || ':' || id,?,id,0 FROM songs`,
          )
          .bind(sessionId, sessionId)
          .run();
      await saveSettings(sessionId, config);
    } else if (data.action === 'songs') {
      const cfg = await settings(sessionId);
      if (
        cfg.matchingPublishedAt ||
        !['intent', 'curating'].includes(cfg.phase)
      )
        throw new Error('名单已公布，不能改动歌单及已有席位');
      const existing = await allSongs(sessionId);
      if (
        !Array.isArray(data.songs) ||
        data.songs.length !== existing.length ||
        new Set(data.songs.map((s: any) => s.id)).size !== existing.length ||
        data.songs.some((s: any) => !existing.some((e) => e.id === s.id))
      )
        throw new Error('歌曲池已变化，请刷新后重新选择');
      const updates = data.songs.map((song: any) => {
        if (![0, 1, 2].includes(song.final)) throw new Error('歌曲类型无效');
        if (
          !Array.isArray(song.roles) ||
          !song.roles.length ||
          song.roles.some((r: string) => !ROLES.includes(r))
        )
          throw new Error('请至少选择一个需要的角色');
        return {
          ...songMetadata(song),
          id: song.id,
          final: song.final,
          roles: [...new Set(song.roles)],
        };
      });
      if (
        updates.filter((s: any) => s.final === 1).length > 6 ||
        updates.filter((s: any) => s.final === 2).length > 2
      )
        throw new Error('整场最多 6 首正式歌曲和 2 首备用歌曲');
      if (updates.length)
        await db().batch(
          updates.flatMap((song: any) => [
            db()
              .prepare(
                'UPDATE songs SET roles=?,preferred_key=?,version_url=?,nomination_note=? WHERE id=?',
              )
              .bind(
                JSON.stringify(song.roles),
                song.preferred_key,
                song.version_url,
                song.nomination_note,
                song.id,
              ),
            db()
              .prepare(
                'UPDATE session_songs SET final=? WHERE session_id=? AND song_id=?',
              )
              .bind(song.final, sessionId, song.id),
          ]),
        );
    } else if (data.action === 'song') {
      const cfg = await settings(sessionId);
      if (
        cfg.matchingPublishedAt ||
        !['intent', 'curating'].includes(cfg.phase)
      )
        throw new Error('最终歌单已发布；请先暂停收款再修改');
      if (
        !Array.isArray(data.roles) ||
        !data.roles.length ||
        data.roles.some((r: string) => !ROLES.includes(r))
      )
        throw new Error('请至少选择一个需要的角色');
      const meta = songMetadata(data);
      const final = Number(data.final);
      if (![0, 1, 2].includes(final)) throw new Error('歌曲类型无效');
      const other = (await allSongs(sessionId)).filter((s) => s.id !== data.id);
      if (
        (final === 1 && other.filter((s) => s.final === 1).length >= 6) ||
        (final === 2 && other.filter((s) => s.final === 2).length >= 2)
      )
        throw new Error('整场最多 6 首正式歌曲和 2 首备用歌曲');
      const songId = str(data.id, 100);
      await db().batch([
        db()
          .prepare(
            'UPDATE songs SET roles=?,preferred_key=?,version_url=?,nomination_note=? WHERE id=?',
          )
          .bind(
            JSON.stringify([...new Set(data.roles)]),
            meta.preferred_key,
            meta.version_url,
            meta.nomination_note,
            songId,
          ),
        db()
          .prepare(
            'UPDATE session_songs SET final=? WHERE session_id=? AND song_id=?',
          )
          .bind(final, sessionId, songId),
      ]);
    } else if (data.action === 'invite') {
      throw new Error('无需逐个邀请；请确认歌单后推进到待锁定，系统会自动分配');
    } else if (data.action === 'review') {
      if (!['confirmed', 'rejected'].includes(data.status))
        throw new Error('无效审核结果');
      const reviewNote = str(data.reviewNote || '', 500);
      if (data.status === 'rejected' && !reviewNote)
        throw new Error('请填写需要补充的原因');
      const r = await db()
        .prepare(
          "UPDATE people SET status=?,review_note=? WHERE id=? AND status='pending' AND receipt IS NOT NULL",
        )
        .bind(data.status, reviewNote, str(data.id, 100))
        .run();
      if (!r.meta.changes) throw new Error('记录已更新，请刷新后重试');
    } else throw new Error('未知操作');
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '操作失败' }, 400);
  }
}
