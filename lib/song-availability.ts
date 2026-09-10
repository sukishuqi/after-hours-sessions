import { scoreTimes, type Person, type Settings, type Song } from './shared';

// Count distinct musicians on one common date, not raw role-interest totals.
// Standby volunteers do not make an unfilled regular lineup look complete.
export function songVacancies(
  songs: Song[],
  people: Person[],
  config: Settings,
) {
  const primary = people.map((p) => ({
    ...p,
    selections: p.selections.filter((s) => !s.substitute),
  }));
  const dates = config.selectedDate
    ? [{ id: config.selectedDate, label: config.selectedDate }]
    : config.dates;
  const coverage = scoreTimes(dates, songs, primary);
  return new Map(
    songs.map((song) => {
      const best = coverage
        .map((date) => ({
          date: date.id,
          ...date.coverage.find((s) => s.songId === song.id)!,
        }))
        .sort((a, b) => a.missing.length - b.missing.length)[0];
      return [
        song.id,
        {
          ready: best?.ready || false,
          missing: best?.missing || [...song.roles],
          date: best?.date || '',
        },
      ];
    }),
  );
}

export function sortSongsByVacancy(songs: Song[]) {
  return [...songs].sort((a, b) => {
    const aMissing = a.vacancy?.missing.length ?? a.roles.length;
    const bMissing = b.vacancy?.missing.length ?? b.roles.length;
    if ((aMissing === 0) !== (bMissing === 0)) return aMissing === 0 ? 1 : -1;
    return aMissing - bMissing;
  });
}
