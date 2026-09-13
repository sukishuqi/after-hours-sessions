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
import { songVacancies } from '@/lib/song-availability';
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
    const vacancies = songVacancies(songs, people, config);
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
          vacancy: vacancies.get(s.id),
          count: interested.length,
          votes:
            (config.usePublicLibrary === false
              ? 0
              : Math.max(3, Number(config.audienceVoteSeed) || 3)) +
            people.filter(
              (p) =>
                p.participation !== 'performer' &&
                p.selections.some((c) => c.songId === s.id),
            ).length,
          counts: Object.fromEntries(
            s.roles.map((r) => [
              r,
              interested.filter((p) =>
                p.selections.some(
                  (c) =>
                    c.songId === s.id &&
                    c.roles.includes(r) &&
                    !c.manualStandbyRoles?.includes(r) &&
                    !c.substitute,
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
