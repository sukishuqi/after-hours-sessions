'use client';
import { useEffect, useState } from 'react';
import { Lineup } from '@/components/lineup';
import type { MatchedSong } from '@/lib/matching';
import { priorityOf } from '@/lib/shared';
import { TestingGuide } from '@/components/testing-guide';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ROLES,
  type Settings,
  type Song,
  type Person,
  scoreTimes,
} from '@/lib/shared';
import { LanguageSwitch, useLocale } from '@/lib/locale';
import {
  SongFields,
  RehearsalFields,
  SongReference,
} from '@/components/song-fields';
import { emptyDraft, type SongDraft } from '@/lib/catalog';
export default function AdminSession() {
  const { t } = useLocale();
  const sessionId =
    typeof window === 'undefined'
      ? 'session-001'
      : window.location.pathname.match(/\/admin\/(session-[a-z0-9-]+)/)?.[1] ||
        'session-001';
  const [savedSongs, setSavedSongs] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>(
    {},
  );
  const [newSong, setNewSong] = useState<SongDraft>(emptyDraft);
  const [data, setData] = useState<{
      config: Settings;
      lineup: MatchedSong[];
      people: Person[];
      songs: Song[];
      scores: ReturnType<typeof scoreTimes>;
    } | null>(null),
    [key, setKey] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [assignments, setAssignments] = useState<Record<string, string>>({}),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [checking, setChecking] = useState(true);
  async function load() {
    const r = await fetch(
      '/api/admin?session=' + encodeURIComponent(sessionId),
    );
    if (!r.ok) {
      setChecking(false);
      return;
    }
    const d: any = await r.json();
    setData(d);
    setSavedSongs(JSON.stringify(d.songs));
    setAssignments(
      Object.fromEntries(d.people.map((p: Person) => [p.id, p.assignment])),
    );
    setChecking(false);
  }
  useEffect(() => {
    load().catch(() => {
      setError(t('暂时无法加载', 'Unable to load'));
      setChecking(false);
    });
  }, [sessionId]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('操作失败', 'Action failed'));
    } finally {
      setBusy(false);
    }
  }
  const songsDirty = !!data && JSON.stringify(data.songs) !== savedSongs;
  function updateSong(id: string, patch: Partial<Song>) {
    setData((d) =>
      d
        ? {
            ...d,
            songs: d.songs.map((song) =>
              song.id === id ? { ...song, ...patch } : song,
            ),
          }
        : d,
    );
  }
  async function post(body: unknown) {
    if (songsDirty && (body as { action: string }).action !== 'songs')
      throw new Error(
        t(
          '歌单修改尚未保存，请先点击“保存全部歌单”',
          'Save your setlist changes first with Save entire setlist',
        ),
      );
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(body as object), sessionId }),
    });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d.error);
    await load();
    setMessage(t('已保存', 'Saved'));
  }
  function field(k: keyof Settings, v: string) {
    setData((d) => (d ? { ...d, config: { ...d.config, [k]: v } } : d));
  }
  return (
    <main className="workspace">
      <header>
        <div className="brand-nav">
          <a href="/">
            <img src="/logo.svg" alt="After Hours" />
          </a>
          <a href="/admin" className="back-link">
            {t('← 主理人首页', '← Host sessions')}
          </a>
        </div>
        <div className="row">
          <a
            href={'/sessions/' + sessionId}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('报名页面 ↗', 'Registration ↗')}
          </a>
          <LanguageSwitch />
        </div>
      </header>
      <section className="intro">
        <p className="eyebrow">AFTER HOURS / BACKSTAGE</p>
        <h1>
          {t('把这一场，', 'Bring this session')}
          <span>{t('凑在一起。', ' together.')}</span>
        </h1>
      </section>
      {error && (
        <p role="alert" className="error">
          {t(error)}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {checking ? (
        <p>{t('加载中…', 'Loading…')}</p>
      ) : !data ? (
        <section className="panel" style={{ maxWidth: 500 }}>
          <h2>{t('主理人登录', 'Host sign-in')}</h2>
          <p className="muted">
            {t(
              '管理口令仅供主理人使用，请勿分享给报名者。',
              'Keep the host passphrase private. Do not share it with attendees.',
            )}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await fetch('/api/access', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'admin', token: key }),
                });
                const d: any = await r.json();
                if (!r.ok) throw new Error(d.error);
                setKey('');
                await load();
              });
            }}
          >
            <label htmlFor="adminKey">{t('管理口令', 'Host passphrase')}</label>
            <input
              type="password"
              id="adminKey"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button style={{ marginTop: 16 }} disabled={busy}>
              {t('进入管理', 'Sign in')}
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 24 }}>
            <span className="badge">
              {data.people.length} {t('人已报名', 'registrations')}
            </span>
            <span className="badge">
              {data.people.filter((p) => p.status === 'pending').length}{' '}
              {t('笔付款待核对', 'payments to review')}
            </span>
            <button className="subtle" onClick={() => run(load)}>
              {t('刷新数据', 'Refresh')}
            </button>
            <button
              className="subtle"
              onClick={() =>
                run(async () => {
                  await fetch('/api/access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'logout', token: '' }),
                  });
                  setData(null);
                })
              }
            >
              {t('退出', 'Sign out')}
            </button>
          </div>
          <TestingGuide />
          <Tabs defaultValue="setup">
            <TabsList style={{ height: 'auto', flexWrap: 'wrap' }}>
              <TabsTrigger value="setup">
                {t('时间与阶段', 'Schedule & stages')}
              </TabsTrigger>
              <TabsTrigger value="songs">
                {t('最终歌单', 'Setlist')}
              </TabsTrigger>
              <TabsTrigger value="people">
                {t('阵容与付款', 'Lineup & payments')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="setup">
              <div className="columns">
                <section className="panel">
                  <h2>{t('活动设置', 'Session settings')}</h2>
                  <p className="muted">
                    {t(
                      '先保存最终时间与整理歌单阶段。确认正式／备用曲目及收款信息后，切换到待锁定：自动公布匹配并开放定金，无需逐个邀请。',
                      'Save the final date and Curate setlist stage. Confirm main/reserve songs and payment details, then publish at Awaiting confirmation. Matching and deposits open together, with no individual invitations.',
                    )}
                  </p>
                  <label>{t('活动名称', 'Session name')}</label>
                  <input
                    value={data.config.title}
                    onChange={(e) => field('title', e.target.value)}
                  />
                  <label>{t('地点', 'Location')}</label>
                  <input
                    value={data.config.location}
                    onChange={(e) => field('location', e.target.value)}
                  />
                  <label className="check option">
                    <Checkbox
                      checked={data.config.usePublicLibrary !== false}
                      onCheckedChange={(checked) =>
                        setData((current) =>
                          current
                            ? {
                                ...current,
                                config: {
                                  ...current.config,
                                  usePublicLibrary: !!checked,
                                },
                              }
                            : current,
                        )
                      }
                    />
                    <span>
                      {t(
                        '本 Session 沿用公共歌曲库',
                        'Use the shared song library for this session',
                      )}
                    </span>
                  </label>
                  <p className="muted">
                    {t(
                      '开启后，之前积累的歌曲会加入本场候选池；本场新增歌曲也会继续留在公共曲库。',
                      'Turn this on to add songs collected in earlier sessions. New suggestions from this session also remain in the shared library.',
                    )}
                  </p>
                  <label>{t('当前阶段', 'Current stage')}</label>
                  <Tabs
                    value={data.config.phase}
                    onValueChange={(v) => field('phase', String(v))}
                  >
                    <TabsList style={{ height: 'auto', flexWrap: 'wrap' }}>
                      {[
                        ['intent', '收集意向', 'Collect interest'],
                        ['curating', '整理歌单', 'Curate setlist'],

                        [
                          'locking',
                          '待锁定 · 发布名单并收定金',
                          'Publish lineup & collect deposits',
                        ],
                        ['closed', '排练名额已锁定', 'Rehearsal places locked'],
                      ].map(([v, zh, en]) => (
                        <TabsTrigger key={v} value={v}>
                          {t(zh, en)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <div className="grid2">
                    <div>
                      <label>
                        {t(
                          '意向截止（新加坡时间）',
                          'Interest deadline (Singapore)',
                        )}
                      </label>
                      <input
                        type="datetime-local"
                        value={data.config.intentDeadline}
                        onChange={(e) =>
                          field('intentDeadline', e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label>
                        {t(
                          '定金截止（新加坡时间）',
                          'Deposit deadline (Singapore)',
                        )}
                      </label>
                      <input
                        type="datetime-local"
                        value={data.config.paymentDeadline}
                        onChange={(e) =>
                          field('paymentDeadline', e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <label>{t('最终时间', 'Confirmed date')}</label>
                  <Tabs
                    value={data.config.selectedDate}
                    onValueChange={(v) => field('selectedDate', String(v))}
                  >
                    <TabsList style={{ height: 'auto', flexWrap: 'wrap' }}>
                      {data.config.dates.map((d) => (
                        <TabsTrigger key={d.id} value={d.id}>
                          {t(d.label)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <label>
                    {t('定金（SGD / 人）', 'Deposit (SGD / person)')}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={data.config.deposit}
                    onChange={(e) => field('deposit', e.target.value)}
                  />
                  <label>
                    {t(
                      '付款说明（微信人民币金额请在这里说明）',
                      'Payment instructions (include CNY amount for WeChat)',
                    )}
                  </label>
                  <textarea
                    value={data.config.paymentInfo}
                    onChange={(e) => field('paymentInfo', e.target.value)}
                  />
                  <label>
                    {t(
                      '取消 / 未成团 / 退款规则',
                      'Cancellation / failed session / refund policy',
                    )}
                  </label>
                  <textarea
                    value={data.config.refundInfo}
                    onChange={(e) => field('refundInfo', e.target.value)}
                  />
                  <button
                    style={{ marginTop: 20 }}
                    disabled={busy}
                    onClick={() =>
                      run(() => post({ action: 'config', config: data.config }))
                    }
                  >
                    {t('保存设置与阶段', 'Save settings & stage')}
                  </button>
                  <p className="muted">
                    {t(
                      '截止时间会自动停止对应提交；阶段切换由你手动确认。',
                      'Deadlines stop submissions automatically; stage changes are controlled by you.',
                    )}
                  </p>
                  <div className="divider" />
                  <h3>{t('收款二维码', 'Payment QR codes')}</h3>
                  <p className="muted">
                    {t(
                      '请先保存上方设置。上传二维码会刷新页面数据。',
                      'Save the settings above first. Uploading a QR code refreshes this page.',
                    )}
                  </p>
                  {(['poster', 'paynowQR', 'wechatQR'] as const).map((kind) => (
                    <div className="option" key={kind}>
                      <label htmlFor={kind}>
                        {kind === 'poster'
                          ? t('Session 海报', 'Session poster')
                          : kind === 'paynowQR'
                            ? 'PayNow'
                            : t('微信支付', 'WeChat Pay')}
                      </label>
                      {data.config[kind] && (
                        <img
                          className="qr"
                          alt={kind}
                          src={
                            '/api/file?session=' +
                            encodeURIComponent(sessionId) +
                            '&key=' +
                            encodeURIComponent(data.config[kind])
                          }
                        />
                      )}
                      <input
                        id={kind}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            run(async () => {
                              const body = new FormData();
                              body.set('file', f);
                              body.set('kind', kind);
                              body.set('sessionId', sessionId);
                              const r = await fetch('/api/upload', {
                                method: 'POST',
                                body,
                              });
                              const d: any = await r.json();
                              if (!r.ok) throw new Error(d.error);
                              await load();
                              setMessage(t('二维码已保存', 'QR code saved'));
                            });
                        }}
                      />
                    </div>
                  ))}
                </section>
                <aside className="panel">
                  <p className="eyebrow">TIME CHECK</p>
                  <h2>{t('哪天更容易凑齐？', 'Which date comes together?')}</h2>
                  <p className="muted">
                    {t(
                      '优先比较能凑齐角色的歌曲数，再比较人数。每首歌按不同的人承担不同角色计算；这是意向匹配，不是最终阵容。',
                      'Ranks dates by songs with distinct people for each role, then attendee count. This is a feasibility check, not a confirmed lineup.',
                    )}
                  </p>
                  {data.scores.map((s, i) => (
                    <div key={s.id} className="song">
                      <h3>{t(s.label)}</h3>
                      <p>
                        <span className="stats">{s.count}</span>{' '}
                        {t('人可来', 'available')} · {s.ready}{' '}
                        {t('首可凑齐', 'songs feasible')}
                      </p>
                      <p className="muted">
                        {t('排练演出', 'Rehearsal')} {s.performers} ·{' '}
                        {t('观众 / Open Jam', 'Audience / Open Jam')} {s.guests}
                      </p>
                      {i === 0 && s.count > 0 && (
                        <span className="badge">
                          {t('当前推荐', 'Current recommendation')}
                        </span>
                      )}
                      {s.coverage
                        .filter((c) => c.count)
                        .map((c) => (
                          <p className="muted" key={c.songId}>
                            {c.title} ·{' '}
                            {c.ready
                              ? t('角色齐全', 'Roles covered')
                              : t('待补：', 'Missing: ') +
                                c.missing.map((r) => t(r)).join(' / ')}
                          </p>
                        ))}
                    </div>
                  ))}
                </aside>
              </div>
            </TabsContent>
            <TabsContent value="songs">
              <section className="panel">
                <h2>{t('添加预备歌曲', 'Add a starter song')}</h2>
                <SongFields
                  value={newSong}
                  onChange={setNewSong}
                  existing={data.songs}
                />
                <button
                  style={{ marginTop: 16 }}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await post({ action: 'add-song', song: newSong });
                      setNewSong(emptyDraft);
                    })
                  }
                >
                  {t('加入公共歌曲池', 'Add to the shared song pool')}
                </button>
                <p className="muted">
                  {t(
                    '只添加歌曲，不会产生虚构报名或投票。',
                    'Adds a song without creating registrations or votes.',
                  )}
                </p>
              </section>
              <section className="panel">
                <h2>{t('选择最终歌单', 'Choose the final setlist')}</h2>
                <div
                  className="setlist-savebar"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: 'var(--background)',
                    padding: '12px 0',
                  }}
                >
                  <div
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                    }}
                  >
                    <p>
                      {t('正式', 'Main')}:{' '}
                      {data.songs.filter((s) => s.final === 1).length}/6 ·{' '}
                      {t('备用', 'Reserve')}:{' '}
                      {data.songs.filter((s) => s.final === 2).length}/2
                    </p>
                    <button
                      disabled={
                        busy || !songsDirty || !!data.config.matchingPublishedAt
                      }
                      onClick={() =>
                        run(() => post({ action: 'songs', songs: data.songs }))
                      }
                    >
                      {busy
                        ? t('保存中…')
                        : t('保存全部歌单', 'Save entire setlist')}
                    </button>
                  </div>
                  <p className="muted">
                    {songsDirty
                      ? t(
                          '有未保存的修改；选好后一次保存全部。',
                          'Unsaved changes. Save everything when you finish selecting.',
                        )
                      : t('歌单已保存', 'Setlist saved')}
                  </p>
                </div>
                <p className="muted">
                  {t(
                    '逐首勾选正式或备用；不勾选即不入选。角色与版本备注可展开修改，最后一起保存。',
                    'Check Main or Reserve for each song; leave unchecked to exclude it. Expand roles and version notes to edit, then save everything together.',
                  )}
                </p>
                {data.songs.map((song) => (
                  <div className="song" key={song.id}>
                    <div
                      className="row"
                      style={{
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                      }}
                    >
                      <h3>
                        {song.title}{' '}
                        <span className="muted">{song.artist}</span>
                      </h3>
                      <div className="pillgroup">
                        <label className="check">
                          <Checkbox
                            disabled={busy || !!data.config.matchingPublishedAt}
                            checked={song.final === 1}
                            onCheckedChange={(v) =>
                              updateSong(song.id, { final: v ? 1 : 0 })
                            }
                          />
                          {t('正式', 'Main set')}
                        </label>
                        <label className="check">
                          <Checkbox
                            disabled={busy || !!data.config.matchingPublishedAt}
                            checked={song.final === 2}
                            onCheckedChange={(v) =>
                              updateSong(song.id, { final: v ? 2 : 0 })
                            }
                          />
                          {t('备用', 'Reserve')}
                        </label>
                      </div>
                    </div>
                    <details>
                      <summary>
                        {t(
                          '角色、Key 与版本备注',
                          'Roles, key & version notes',
                        )}
                      </summary>
                      <fieldset
                        disabled={busy || !!data.config.matchingPublishedAt}
                        style={{ border: 0, padding: 0, margin: 0 }}
                      >
                        <RehearsalFields
                          value={song}
                          onChange={(meta) => updateSong(song.id, meta)}
                        />
                        <div className="pillgroup" style={{ margin: '16px 0' }}>
                          {ROLES.map((role) => (
                            <label className="check" key={role}>
                              <Checkbox
                                disabled={
                                  busy || !!data.config.matchingPublishedAt
                                }
                                checked={song.roles.includes(role)}
                                onCheckedChange={(v) =>
                                  updateSong(song.id, {
                                    roles: v
                                      ? [...song.roles, role]
                                      : song.roles.filter((r) => r !== role),
                                  })
                                }
                              />
                              {t(role)}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </details>
                  </div>
                ))}
              </section>
            </TabsContent>
            <TabsContent value="people">
              <Lineup
                songs={data.lineup || []}
                preview={!data.config.matchingPublishedAt}
              />
              <section className="panel">
                <h2>{t('确认阵容与名额', 'Confirm lineup & places')}</h2>
                <p className="muted">
                  {t(
                    '名单由意向自动匹配，无需逐个分配。发布后，正式成员登录即可付款；备用成员不收定金。',
                    'The lineup is matched automatically from wishes. Once published, main-set musicians can pay; reserve-only musicians pay no deposit.',
                  )}
                </p>
                {!data.people.length && (
                  <p>
                    {t(
                      '还没有报名，分享报名链接即可开始。',
                      'No registrations yet. Share the registration link to begin.',
                    )}
                  </p>
                )}
                <label htmlFor="people-search">
                  {t(
                    '查找报名人：名字 / 联系方式',
                    'Find attendee: name / contact',
                  )}
                </label>
                <input
                  id="people-search"
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  placeholder={t('仅主理人可见', 'Host only')}
                />
                {data.people
                  .filter((p) =>
                    (p.name + ' ' + p.contact)
                      .toLowerCase()
                      .includes(personQuery.toLowerCase()),
                  )
                  .map((p) => (
                    <article className="song" key={p.id}>
                      <div
                        className="row"
                        style={{ justifyContent: 'space-between' }}
                      >
                        <h3>{p.name}</h3>
                        <span className="badge">
                          {p.participation !== 'performer'
                            ? t('登记完成', 'Registration complete')
                            : t(
                                (
                                  {
                                    intent: '意向已记录',
                                    invited: '待付定金',
                                    standby: '备用阵容 · 无需定金',
                                    unmatched: '本次暂未匹配 · 无需定金',
                                    pending: '付款待核对',
                                    confirmed: '名额已锁定',
                                    rejected: '需补充截图',
                                  } as Record<string, string>
                                )[p.status],
                              )}
                        </span>
                      </div>
                      <p className="eyebrow">
                        {p.participation === 'performer'
                          ? t('排练演出', 'Rehearsed performance')
                          : p.participation === 'openjam'
                            ? 'Open Jam'
                            : t('观众', 'Audience')}
                      </p>
                      <p>{p.contact}</p>
                      <details>
                        <summary>
                          {t(
                            '设置 / 重设报名密码',
                            'Set / reset registration password',
                          )}
                        </summary>
                        <p className="muted">
                          {t(
                            '请先通过原联系方式核实本人。重设后请私下告知对方新密码；旧登录会失效。',
                            'Verify the attendee using their original contact first. Share the new password privately; previous logins will be invalidated.',
                          )}
                        </p>
                        <label htmlFor={'reset-' + p.id}>
                          {t(
                            '新报名密码（至少 8 字符）',
                            'New registration password (at least 8 characters)',
                          )}
                        </label>
                        <input
                          id={'reset-' + p.id}
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          value={resetPasswords[p.id] || ''}
                          onChange={(e) =>
                            setResetPasswords({
                              ...resetPasswords,
                              [p.id]: e.target.value,
                            })
                          }
                        />
                        <button
                          className="subtle"
                          style={{ marginTop: 12 }}
                          disabled={
                            busy || !(resetPasswords[p.id]?.length >= 8)
                          }
                          onClick={() =>
                            run(async () => {
                              await post({
                                action: 'reset-member-password',
                                id: p.id,
                                password: resetPasswords[p.id],
                              });
                              setResetPasswords({
                                ...resetPasswords,
                                [p.id]: '',
                              });
                            })
                          }
                        >
                          {t(
                            '已核实本人，重设密码',
                            'Identity verified — reset password',
                          )}
                        </button>
                      </details>
                      <p className="muted">
                        {p.availability
                          .map((v) =>
                            t(
                              data.config.dates.find((d) => d.id === v)
                                ?.label || v,
                            ),
                          )
                          .join(' / ')}
                      </p>
                      {p.selections.map((s, index) => (
                        <div key={s.songId}>
                          <p>
                            {
                              data.songs.find((song) => song.id === s.songId)
                                ?.title
                            }{' '}
                            ·{' '}
                            {priorityOf(s, index) === 1
                              ? t('第一优先', 'First preference')
                              : priorityOf(s, index) === 2
                                ? t('第二优先', 'Second preference')
                                : t('其他意向', 'Other wish')}{' '}
                            ·{' '}
                            {p.participation === 'performer'
                              ? s.roles.map((r) => t(r)).join(' / ')
                              : t('想听', 'Listener vote')}
                          </p>
                          <SongReference song={s} />
                        </div>
                      ))}
                      {p.note && <p className="notice">{p.note}</p>}
                      {p.assignment && <p className="notice">{p.assignment}</p>}
                      {p.receipt && (
                        <details>
                          <summary>
                            {t('查看付款截图', 'View payment receipt')} ·{' '}
                            {p.payment_method}
                          </summary>
                          <img
                            className="payment-image"
                            src={
                              '/api/file?session=' +
                              encodeURIComponent(sessionId) +
                              '&key=' +
                              encodeURIComponent(p.receipt)
                            }
                            alt={t('付款截图', 'Payment receipt')}
                          />
                        </details>
                      )}
                      {p.status === 'pending' && (
                        <>
                          <label>
                            {t(
                              '审核备注 / 补充原因',
                              'Review note / reason for resubmission',
                            )}
                          </label>
                          <input
                            value={notes[p.id] || ''}
                            onChange={(e) =>
                              setNotes({ ...notes, [p.id]: e.target.value })
                            }
                          />
                          <div className="row" style={{ marginTop: 12 }}>
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  post({
                                    action: 'review',
                                    id: p.id,
                                    status: 'confirmed',
                                    reviewNote: notes[p.id] || '',
                                  }),
                                )
                              }
                            >
                              {t(
                                '已核对到账，锁定名额',
                                'Payment verified — confirm place',
                              )}
                            </button>
                            <button
                              disabled={busy}
                              className="subtle"
                              onClick={() =>
                                run(() =>
                                  post({
                                    action: 'review',
                                    id: p.id,
                                    status: 'rejected',
                                    reviewNote: notes[p.id] || '',
                                  }),
                                )
                              }
                            >
                              {t('请对方补充', 'Request resubmission')}
                            </button>
                          </div>
                        </>
                      )}
                      {p.review_note && (
                        <p className="muted">{p.review_note}</p>
                      )}
                    </article>
                  ))}
              </section>
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
