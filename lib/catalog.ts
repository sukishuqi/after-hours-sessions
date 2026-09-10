export type SongDraft = {
  title: string;
  artist: string;
  preferred_key: string;
  version_url: string;
  nomination_note: string;
};
export const starterSongs = [
  {
    title: '山海',
    artist: '草东没有派对',
    aliases: ['山海'],
    version_url: 'https://www.youtube.com/watch?v=j2311FZWoFQ',
  },
  {
    title: '降雨机率',
    artist: '甜约翰 Sweet John',
    aliases: ['降雨机率', '降雨機率', '降雨几率', '降雨概率'],
    version_url: 'https://www.youtube.com/watch?v=3UYOS8Pcsks',
  },
  {
    title: '亲吻了再摸索',
    artist: '甜约翰 Sweet John',
    aliases: ['亲吻了再摸索', '親吻了再摸索'],
    version_url: 'https://www.youtube.com/watch?v=RSddiUXnIfE',
  },
  {
    title: '浴室',
    artist: 'deca joins',
    aliases: ['浴室'],
    version_url: 'https://www.youtube.com/watch?v=kZecE9AeELI',
  },
];
export const emptyDraft: SongDraft = {
  title: '',
  artist: '',
  preferred_key: '',
  version_url: '',
  nomination_note: '',
};
export function matchSong(title: string, existing: Partial<SongDraft>[] = []) {
  const q = title.normalize('NFKC').trim().toLowerCase();
  return (
    existing.find(
      (s) => s.title?.normalize('NFKC').trim().toLowerCase() === q,
    ) || starterSongs.find((s) => s.aliases.some((a) => a.toLowerCase() === q))
  );
}
export function canonicalTitle(title: string, artist: string) {
  const found = matchSong(title);
  return found && found.artist?.toLowerCase() === artist.trim().toLowerCase()
    ? found.title!
    : title;
}
