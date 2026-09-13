import { canonicalTitle } from './catalog';
export const ROLES = ['主唱', '吉他', '贝斯', '鼓', '键盘', '和声', '其他'];
export type Selection = {
  manualStandbyRoles?: string[];
  substitute?: boolean;
  priority?: 1 | 2 | 3;
  songId: string;
  roles: string[];
  preferred_key?: string;
  version_url?: string;
  nomination_note?: string;
};
export type Song = {
  vacancy?: { ready: boolean; missing: string[]; date: string };
  preferred_key: string;
  version_url: string;
  nomination_note: string;
  id: string;
  title: string;
  artist: string;
  roles: string[];
  final: number;
  counts?: Record<string, number>;
  count?: number;
  votes?: number;
};
export type Person = {
  session_id: string;
  slots: Slot[];
  hasPassword: boolean;
  participation: 'performer' | 'audience' | 'openjam';
  id: string;
  name: string;
  contact: string;
  availability: string[];
  selections: Selection[];
  note: string;
  status: string;
  assignment: string;
  receipt: string | null;
  payment_method: string | null;
  review_note: string;
  created: string;
};
export type Settings = {
  matchingPublishedAt?: string;
  title: string;
  location: string;
  dates: { id: string; label: string }[];
  phase: 'intent' | 'curating' | 'payment' | 'locking' | 'closed';
  intentDeadline: string;
  paymentDeadline: string;
  selectedDate: string;
  deposit: string;
  paymentInfo: string;
  refundInfo: string;
  paynowQR: string;
  wechatQR: string;
  poster?: string;
  usePublicLibrary?: boolean;
  audienceVoteSeed?: number;
};
export type SessionSummary = {
  id: string;
  slug: string;
  config: Settings;
  total: number;
  created: string;
};
export type Slot = {
  songId: string;
  role: string;
  kind: 'main' | 'reserve';
  priority: 1 | 2 | 3;
};
export function needsDeposit(person: Pick<Person, 'slots' | 'participation'>) {
  return (
    person.participation === 'performer' &&
    person.slots.some((s) => s.kind === 'main')
  );
}
export function priorityOf(selection: Selection, index: number): 1 | 2 | 3 {
  return selection.priority || (index === 0 ? 1 : index === 1 ? 2 : 3);
}
export const defaults: Settings = {
  title: 'Session 001',
  location: '地点待定',
  dates: [
    { id: '2026-09-19T14:30', label: '9 月 19 日 · 周六 · 14:30' },
    { id: '2026-09-20T14:30', label: '9 月 20 日 · 周日 · 14:30' },
  ],
  phase: 'intent',
  intentDeadline: '',
  paymentDeadline: '',
  selectedDate: '',
  deposit: '10',
  paymentInfo: '',
  refundInfo: '',
  paynowQR: '',
  wechatQR: '',
  usePublicLibrary: true,
  audienceVoteSeed: 3,
};
export function expired(date: string) {
  return !!date && Date.now() > new Date(date + '+08:00').getTime();
}
export function normalSong(title: string, artist: string) {
  return (canonicalTitle(title, artist) + '|' + artist)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}
export function scoreTimes(
  dates: Settings['dates'],
  songs: Song[],
  people: Person[],
) {
  return dates
    .map((date) => {
      const available = people.filter((p) => p.availability.includes(date.id));
      const coverage = songs.map((song) => {
        const interested = available.filter(
          (p) =>
            p.participation === 'performer' &&
            p.selections.some((s) => s.songId === song.id),
        );
        const matched = new Map<string, string>();
        function assign(role: string, seen: Set<string>): boolean {
          for (const p of interested) {
            const choice = p.selections.find((s) => s.songId === song.id);
            if (
              !choice?.roles.includes(role) ||
              choice.manualStandbyRoles?.includes(role) ||
              seen.has(p.id)
            )
              continue;
            seen.add(p.id);
            const old = matched.get(p.id);
            if (!old || assign(old, seen)) {
              matched.set(p.id, role);
              return true;
            }
          }
          return false;
        }
        const missing = song.roles.filter((role) => !assign(role, new Set()));
        return {
          songId: song.id,
          title: song.title,
          ready: missing.length === 0,
          missing,
          count: interested.length,
        };
      });
      return {
        ...date,
        count: available.length,
        performers: available.filter((p) => p.participation === 'performer')
          .length,
        guests: available.filter((p) => p.participation !== 'performer').length,
        ready: coverage.filter((c) => c.ready).length,
        coverage,
      };
    })
    .sort((a, b) => b.ready - a.ready || b.count - a.count);
}
