// Real routes and migrations, using an isolated in-memory SQLite D1 adapter.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const ts = require('typescript'),
  Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..'),
  sql = new DatabaseSync(':memory:');
for (const file of fs
  .readdirSync(path.join(root, 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sql.exec(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8'));
const DB = {
  prepare(query) {
    let values = [];
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...values) || null;
      },
      async all() {
        return { results: sql.prepare(query).all(...values) };
      },
      async run() {
        const result = sql.prepare(query).run(...values);
        return { success: true, meta: { changes: result.changes } };
      },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sql.exec('COMMIT');
      return results;
    } catch (e) {
      sql.exec('ROLLBACK');
      throw e;
    }
  },
};
const jar = new Map();
const cookies = {
  get: (name) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  set: (name, value) => jar.set(name, value),
  delete: (name) => jar.delete(name),
};
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const original = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'cloudflare:workers') return { env: { DB } };
  if (name === 'next/headers') return { cookies: async () => cookies };
  if (name.startsWith('@/')) name = path.join(root, name.slice(2));
  return original.call(this, name, parent, main);
};
const server = require('../lib/server.ts'),
  access = require('../app/api/access/route.ts'),
  intent = require('../app/api/intent/route.ts');
async function call(route, body) {
  const response = await route.POST(
    new Request('https://test.invalid/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://test.invalid',
      },
      body: JSON.stringify({ sessionId: 'session-001', ...body }),
    }),
  );
  return { status: response.status, body: await response.json() };
}
async function success(route, body) {
  const response = await call(route, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
(async () => {
  const config = await server.settings();
  config.phase = 'intent';
  config.intentDeadline = '2099-09-01T20:00';
  await server.saveSettings('session-001', config);
  const credentials = {
    name: 'Test Musician',
    contact: 'test-signup',
    password: 'only-for-local-test',
  };
  await success(access, { type: 'register', ...credentials });
  const draft = await server.me('session-001');
  assert.equal(draft.status, 'draft');
  assert(draft.hasPassword);
  assert.equal(
    (await server.allPeople()).length,
    0,
    'Account-only drafts are not registrations',
  );
  assert.equal(
    (await server.allSessions())[0].total,
    0,
    'Drafts do not increase attendance',
  );
  assert.equal(
    (await call(access, { type: 'register', ...credentials })).status,
    409,
    'Duplicate account is rejected',
  );
  await success(access, { type: 'member-logout' });
  assert.equal(
    (
      await call(access, {
        type: 'member',
        contact: credentials.contact,
        password: 'incorrect-pass',
      })
    ).status,
    403,
  );
  await success(access, { type: 'member', ...credentials });
  const songs = await server.allSongs(),
    availability = config.dates.map((d) => d.id);
  const selections = songs
    .slice(0, 2)
    .map((song, i) => ({ songId: song.id, roles: ['主唱'], priority: i + 1 }));
  await success(intent, {
    name: credentials.name,
    contact: credentials.contact,
    participation: 'performer',
    availability,
    selections,
    note: '',
  });
  const submitted = await server.me('session-001');
  assert.equal(submitted.id, draft.id);
  assert.equal(submitted.status, 'intent');
  assert.deepEqual(submitted.availability, availability);
  assert.equal(submitted.selections.length, 2);
  assert.equal((await server.allPeople()).length, 1);
  assert.equal((await server.allSessions())[0].total, 1);
  await success(access, { type: 'member-logout' });
  config.phase = 'closed';
  await server.saveSettings('session-001', config);
  for (const participation of ['audience', 'openjam']) {
    const guest = {
      name: 'Test ' + participation,
      contact: 'test-' + participation,
      password: 'only-for-local-test',
    };
    await success(access, { type: 'register', ...guest });
    assert.equal(
      (
        await call(intent, {
          ...guest,
          participation: 'performer',
          availability,
          selections,
        })
      ).status,
      409,
      'Locked rehearsal remains closed',
    );
    await success(intent, {
      ...guest,
      participation,
      availability,
      selections: [],
      note: '',
    });
    assert.equal((await server.me('session-001')).participation, participation);
    await success(access, { type: 'member-logout' });
  }
  console.log(
    'PASS: draft registration, password login, duplicate protection, multi-date submission, attendance counts and closed-session guest branches.',
  );
  sql.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
