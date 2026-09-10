import type { Person, Song, Slot } from './shared';
import { priorityOf } from './shared';

export type MatchedSong = {
  songId: string;
  title: string;
  kind: 'main' | 'reserve';
  ready: boolean;
  missing: string[];
  members: {
    personId: string;
    name: string;
    role: string;
    priority: 1 | 2 | 3;
  }[];
};
type Edge = { to: number; reverse: number; capacity: number; cost: number };

// Min-cost maximum flow. Each person-song gate permits one role per song.
// Songs are sequential, so a musician may play multiple songs. Extra wishes
// are expensive; there is no artificial guarantee or hard cap of two songs.
function matchGroup(
  songs: Song[],
  people: Person[],
  date: string,
  kind: Slot['kind'],
): MatchedSong[] {
  const candidates = people
    .filter(
      (p) => p.participation === 'performer' && p.availability.includes(date),
    )
    .sort(
      (a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id),
    );
  const graph: Edge[][] = [[], []],
    source = 0,
    sink = 1;
  const node = () => {
    graph.push([]);
    return graph.length - 1;
  };
  function edge(from: number, to: number, capacity: number, cost: number) {
    const forward = { to, reverse: graph[to].length, capacity, cost };
    graph[from].push(forward);
    graph[to].push({
      to: from,
      reverse: graph[from].length - 1,
      capacity: 0,
      cost: -cost,
    });
    return forward;
  }
  const roleNodes = new Map<string, number>();
  for (const song of songs)
    for (const role of song.roles) {
      const n = node();
      roleNodes.set(song.id + '|' + role, n);
      edge(n, sink, 1, 0);
    }
  const links: {
    songId: string;
    person: Person;
    role: string;
    priority: 1 | 2 | 3;
    edge: Edge;
  }[] = [];
  for (const person of candidates) {
    const p = node();
    edge(source, p, 1, 0);
    edge(source, p, 1, 20);
    edge(source, p, Math.max(0, songs.length - 2), 500);
    person.selections.forEach((selection, index) => {
      const song = songs.find((s) => s.id === selection.songId);
      if (!song) return;
      const priority = priorityOf(selection, index),
        gate = node();
      edge(p, gate, 1, priority === 1 ? 0 : priority === 2 ? 1000 : 100000);
      for (const role of song.roles)
        if (selection.roles.includes(role))
          links.push({
            songId: song.id,
            person,
            role,
            priority,
            edge: edge(gate, roleNodes.get(song.id + '|' + role)!, 1, 0),
          });
    });
  }
  while (true) {
    const distance = Array(graph.length).fill(Infinity),
      previousNode = Array(graph.length).fill(-1),
      previousEdge = Array(graph.length).fill(-1);
    const queue = [source],
      queued = new Set([source]);
    distance[source] = 0;
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      queued.delete(u);
      graph[u].forEach((e, i) => {
        if (e.capacity > 0 && distance[e.to] > distance[u] + e.cost) {
          distance[e.to] = distance[u] + e.cost;
          previousNode[e.to] = u;
          previousEdge[e.to] = i;
          if (!queued.has(e.to)) {
            queued.add(e.to);
            queue.push(e.to);
          }
        }
      });
    }
    if (previousNode[sink] < 0) break;
    for (let v = sink; v !== source; v = previousNode[v]) {
      const e = graph[previousNode[v]][previousEdge[v]];
      e.capacity--;
      graph[v][e.reverse].capacity++;
    }
  }
  return songs.map((song) => {
    const members = links
      .filter((l) => l.songId === song.id && l.edge.capacity === 0)
      .map((l) => ({
        personId: l.person.id,
        name: l.person.name,
        role: l.role,
        priority: l.priority,
      }));
    const missing = song.roles.filter(
      (role) => !members.some((m) => m.role === role),
    );
    return {
      songId: song.id,
      title: song.title,
      kind,
      ready: missing.length === 0,
      missing,
      members,
    };
  });
}
export function matchLineup(
  songs: Song[],
  people: Person[],
  date: string,
): MatchedSong[] {
  if (!date) return [];
  return [
    ...matchGroup(
      songs.filter((s) => s.final === 1),
      people,
      date,
      'main',
    ),
    ...matchGroup(
      songs.filter((s) => s.final === 2),
      people,
      date,
      'reserve',
    ),
  ];
}
export function slotsFor(personId: string, lineup: MatchedSong[]): Slot[] {
  return lineup.flatMap((s) =>
    s.members
      .filter((m) => m.personId === personId)
      .map((m) => ({
        songId: s.songId,
        role: m.role,
        kind: s.kind,
        priority: m.priority,
      })),
  );
}
export function savedLineup(songs: Song[], people: Person[]): MatchedSong[] {
  return songs
    .filter((s) => s.final > 0)
    .map((song) => {
      const members = people.flatMap((p) =>
        (p.slots || [])
          .filter((slot) => slot.songId === song.id)
          .map((slot) => ({
            personId: p.id,
            name: p.name,
            role: slot.role,
            priority: slot.priority,
          })),
      );
      const missing = song.roles.filter(
        (role) => !members.some((m) => m.role === role),
      );
      return {
        songId: song.id,
        title: song.title,
        kind: song.final === 2 ? 'reserve' : 'main',
        members,
        missing,
        ready: missing.length === 0,
      };
    });
}
