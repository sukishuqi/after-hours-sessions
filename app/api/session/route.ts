import {
  allPeople,
  allSongs,
  settings,
  me,
  json,
  isAdmin,
  cleanSessionId,
} from '@/lib/server';
import { savedLineup } from '@/lib/matching';
export async function GET(req: Request) {
  try {
    const sessionId = cleanSessionId(
      new URL(req.url).searchParams.get('session'),
    );
    const [config, songs, people, mine, admin] = await Promise.all([
      settings(sessionId),
      allSongs(sessionId),
      allPeople(sessionId),
      me(sessionId),
      isAdmin(),
    ]);
    return json({
      config,
      lineup: config.matchingPublishedAt
        ? savedLineup(songs, people).map((s) => ({
            ...s,
            members: s.members.map(({ personId, ...member }) => member),
          }))
        : [],
      songs: songs.map((s) => {
        const interested = people.filter(
          (p) =>
            p.participation === 'performer' &&
            p.selections.some((c) => c.songId === s.id),
        );
        return {
          ...s,
          count: interested.length,
          votes: people.filter(
            (p) =>
              p.participation !== 'performer' &&
              p.selections.some((c) => c.songId === s.id),
          ).length,
          counts: Object.fromEntries(
            s.roles.map((r) => [
              r,
              interested.filter((p) =>
                p.selections.some(
                  (c) => c.songId === s.id && c.roles.includes(r),
                ),
              ).length,
            ]),
          ),
        };
      }),
      mine,
      total: people.length,
      admin,
    });
  } catch {
    return json({ error: '暂时无法加载，请稍后重试。' }, 503);
  }
}
