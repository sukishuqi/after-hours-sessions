const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (module, path) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(path, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    path,
  );
const { matchLineup, slotsFor } = require('../lib/matching.ts');
const { needsDeposit } = require('../lib/shared.ts');
const song = (id, roles, final = 1) => ({ id, title: id, roles, final });
const person = (id, selections) => ({
  id,
  name: id,
  created: id,
  participation: 'performer',
  availability: ['date'],
  selections,
  slots: [],
});
const wish = (songId, roles, priority) => ({ songId, roles, priority });
const songs = [song('main', ['主唱', '吉他']), song('reserve', ['鼓'], 2)];
const people = [
  person('a', [wish('main', ['主唱', '吉他'], 1)]),
  person('b', [wish('main', ['吉他'], 2)]),
  person('c', [wish('main', ['吉他'], 3)]),
  person('d', [wish('reserve', ['鼓'], 1)]),
];
const lineup = matchLineup(songs, people, 'date');
assert(lineup.every((s) => s.ready));
assert.equal(
  lineup[0].members.find((m) => m.role === '吉他').personId,
  'b',
  'Second preference wins over other wishes',
);
assert.equal(
  new Set(lineup[0].members.map((m) => m.personId)).size,
  2,
  'One person cannot fill two roles in the same song',
);
assert(needsDeposit({ ...people[0], slots: slotsFor('a', lineup) }));
assert(
  !needsDeposit({ ...people[3], slots: slotsFor('d', lineup) }),
  'Reserve-only members do not pay',
);
assert(
  !needsDeposit({ ...people[2], slots: slotsFor('c', lineup) }),
  'Unmatched members do not pay',
);
assert.deepEqual(
  lineup,
  matchLineup(songs, people, 'date'),
  'Matching is deterministic',
);
assert(
  !matchLineup(songs, [people[0]], 'date')[0].ready,
  'A versatile musician cannot make an incomplete band complete',
);
assert(
  needsDeposit({
    ...people[0],
    slots: slotsFor('a', matchLineup(songs, [people[0]], 'date')),
  }),
  'Host-approved main members can pay before house roles are filled',
);
assert(
  !needsDeposit({
    ...people[3],
    slots: slotsFor(
      'd',
      matchLineup([song('reserve', ['鼓', '贝斯'], 2)], [people[3]], 'date'),
    ),
  }),
  'Partial reserve bands remain exempt',
);
assert.equal(
  matchLineup(songs, people, 'other-date')[0].members.length,
  0,
  'Date availability is respected',
);
console.log(
  'PASS: preference matching, unique roles, availability and reserve deposit exemption.',
);
const standby = person('standby', [
  { ...wish('main', ['主唱', '吉他'], 1), substitute: true },
]);
const regular = person('regular', [wish('main', ['主唱'], 3)]);
const filled = matchLineup([songs[0]], [regular, standby], 'date')[0];
assert.equal(
  filled.members.find((m) => m.role === '主唱').personId,
  'regular',
  'Standby never displaces an ordinary preference',
);
assert.equal(
  filled.members.find((m) => m.role === '吉他').personId,
  'standby',
  'Standby fills remaining roles',
);
assert.equal(
  matchLineup([songs[0]], [regular, standby], 'other-date')[0].members.length,
  0,
);
assert.equal(
  matchLineup([songs[0]], [...people, standby], 'date')[0].members.some(
    (m) => m.personId === 'standby',
  ),
  false,
  'A covered lineup leaves standby unassigned',
);
const {
  songVacancies,
  sortSongsByVacancy,
} = require('../lib/song-availability.ts');
const pool = [
  song('empty', ['主唱', '吉他', '鼓'], 0),
  song('close', ['主唱', '吉他'], 0),
  song('full', ['主唱'], 0),
];
const applicants = [
  person('multi', [
    wish('close', ['主唱', '吉他'], 1),
    wish('full', ['主唱'], 2),
  ]),
  person('backup', [{ ...wish('close', ['吉他'], 2), substitute: true }]),
];
const vacancies = songVacancies(pool, applicants, {
  dates: [{ id: 'date', label: 'date' }],
  selectedDate: '',
});
assert.equal(
  vacancies.get('close').missing.length,
  1,
  'One multi-role person cannot fill two positions; standby does not inflate coverage',
);
assert.deepEqual(
  sortSongsByVacancy(
    pool.map((s) => ({ ...s, vacancy: vacancies.get(s.id) })),
  ).map((s) => s.id),
  ['close', 'empty', 'full'],
);
const split = [
  person('singer', [wish('close', ['主唱'], 1)]),
  {
    ...person('guitar', [wish('close', ['吉他'], 1)]),
    availability: ['other'],
  },
];
assert.equal(
  songVacancies(pool, split, {
    dates: [{ id: 'date' }, { id: 'other' }],
    selectedDate: '',
  }).get('close').missing.length,
  1,
  'Different dates cannot be combined into a full band',
);
console.log(
  'PASS: vacancy ordering, shared-date coverage and non-displacing standby matching.',
);
const manual = person('manual', [
  { ...wish('main', ['主唱', '吉他'], 1), manualStandbyRoles: ['主唱'] },
]);
const manualMatch = matchLineup([songs[0]], [manual], 'date')[0];
assert(
  manualMatch.missing.includes('主唱'),
  'Manual standby leaves lead vocal open',
);
assert.equal(manualMatch.members[0].role, '吉他', 'Other roles are retained');
assert.equal(
  matchLineup(
    [songs[0]],
    [
      {
        ...manual,
        selections: manual.selections.map((s) => ({ ...s, substitute: true })),
      },
    ],
    'date',
  )[0].members.some((m) => m.role === '主唱'),
  false,
  'Automatic standby matching also respects manual-only roles',
);
