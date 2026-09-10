'use client';
import { Lineup, type VisibleLineup } from '@/components/lineup';
import { priorityOf } from '@/lib/shared';
import { SessionProgress } from '@/components/session-progress';
import {
  SongFields,
  RehearsalFields,
  SongReference,
} from '@/components/song-fields';
import { emptyDraft, type SongDraft } from '@/lib/catalog';
import { LanguageSwitch, useLocale } from '@/lib/locale';
import { useEffect, useState, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ROLES,
  defaults,
  expired,
  type Settings,
  type Song,
  type Person,
} from '@/lib/shared';
type Choice = {
  priority?: 1 | 2 | 3;
  preferred_key?: string;
  version_url?: string;
  nomination_note?: string;
  songId: string;
  roles: string[];
  newSong?: SongDraft;
};
const statusText: Record<string, string> = {
  intent: '意向已记录',
  invited: '阵容已确认 · 待付定金',
  standby: '备用阵容 · 无需定金',
  unmatched: '本次暂未匹配 · 无需定金',
  pending: '付款待核对',
  confirmed: '名额已锁定',
  rejected: '需要补充付款截图',
};
const phaseText = {
  intent: '收集意向',
  curating: '正在确定歌单',
  payment: '定金确认中',
  locking: '待锁定',
  closed: '排练名额已锁定',
};
function Checks({
  values,
  options,
  onChange,
}: {
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="pillgroup">
      {options.map((r) => (
        <label className="check" key={r}>
          <Checkbox
            checked={values.includes(r)}
            onCheckedChange={(v) =>
              onChange(v ? [...values, r] : values.filter((x) => x !== r))
            }
          />
          {t(r)}
        </label>
      ))}
    </div>
  );
}
export default function Home() {
  const { t } = useLocale();
  const sessionId =
    typeof window === 'undefined'
      ? 'session-001'
      : window.location.pathname.match(
          /\/sessions\/(session-[a-z0-9-]+)/,
        )?.[1] || 'session-001';
  const [lineup, setLineup] = useState<VisibleLineup[]>([]);
  const [newMeta, setNewMeta] = useState({
    preferred_key: '',
    version_url: '',
    nomination_note: '',
  });
  const [participation, setParticipation] = useState<
    'performer' | 'audience' | 'openjam'
  >('performer');
  const [lookupPassword, setLookupPassword] = useState('');
  const [accessTab, setAccessTab] = useState('mine');
  const [editing, setEditing] = useState(false);
  const performing = participation === 'performer';
  const [config, setConfig] = useState<Settings>(defaults),
    [songs, setSongs] = useState<Song[]>([]),
    [mine, setMine] = useState<Person | null>(null),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(''),
    [name, setName] = useState(''),
    [contact, setContact] = useState(''),
    [availability, setAvailability] = useState<string[]>([]),
    [choices, setChoices] = useState<Choice[]>([]),
    [note, setNote] = useState(''),
    [password, setPassword] = useState(''),
    [lookupContact, setLookupContact] = useState(''),
    [newTitle, setNewTitle] = useState(''),
    [newArtist, setNewArtist] = useState(''),
    [method, setMethod] = useState('paynow'),
    [file, setFile] = useState<File | null>(null),
    [consent, setConsent] = useState(false);
  const refresh = useCallback(
    async (fill = false) => {
      const r = await fetch(
        '/api/session?session=' + encodeURIComponent(sessionId),
      );
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.error);
      setConfig(d.config);
      setLineup(d.lineup || []);
      setSongs(d.songs);
      setMine(d.mine);
      setTotal(d.total);
      if (fill && d.mine) {
        setParticipation(d.mine.participation);
        setName(d.mine.name);
        setContact(d.mine.contact);
        setAvailability(d.mine.availability);
        setChoices(
          d.mine.selections.map((c: Choice, i: number) => ({
            ...c,
            priority: priorityOf(c, i),
          })),
        );
        setNote(d.mine.note);
      }
      setLoading(false);
    },
    [sessionId],
  );
  useEffect(() => {
    refresh(true).catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [refresh]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'read_song_pool',
          title: t('查看公共歌曲池'),
          description: t('读取歌曲、意向人数及活动阶段，不会提交报名。'),
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== 'object' ||
              Object.keys(input).length
            )
              throw new Error('Expected empty object');
            const r = await fetch(
              '/api/session?session=' + encodeURIComponent(sessionId),
            );
            if (!r.ok) throw new Error(t('加载失败'));
            const d: any = await r.json();
            setSongs(d.songs);
            setConfig(d.config);
            return { phase: d.config.phase, songs: d.songs };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [sessionId]);
  useEffect(() => {
    const reload = () => refresh(false).catch((e) => setError(e.message));
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [refresh]);
  const open = config.phase === 'intent' && !expired(config.intentDeadline);
  const closed = config.phase === 'closed';
  const canRegister = open || (closed && !performing);
  const finalized = ['payment', 'locking', 'closed'].includes(config.phase);
  useEffect(() => {
    if (closed && !mine && participation === 'performer')
      setParticipation('openjam');
  }, [closed, mine, participation]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('操作失败'));
    } finally {
      setBusy(false);
    }
  }
  async function post(url: string, data: unknown) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(data as object), sessionId }),
    });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  function fileUrl(key: string) {
    return (
      '/api/file?session=' +
      encodeURIComponent(sessionId) +
      '&key=' +
      encodeURIComponent(key)
    );
  }
  function nextPriority(): 1 | 2 | 3 {
    return !choices.some((c) => c.priority === 1)
      ? 1
      : !choices.some((c) => c.priority === 2)
        ? 2
        : 3;
  }
  function setPriority(id: string, priority: 1 | 2 | 3) {
    setChoices(
      choices.map((c) =>
        c.songId === id
          ? { ...c, priority }
          : c.priority === priority && priority !== 3
            ? { ...c, priority: 3 }
            : c,
      ),
    );
  }
  function choose(song: Song) {
    if (choices.some((c) => c.songId === song.id)) return;

    setChoices([
      ...choices,
      {
        songId: song.id,
        priority: nextPriority(),
        roles: [],
        preferred_key: song.preferred_key,
        version_url: song.version_url,
        nomination_note: '',
      },
    ]);
    setError('');
  }
  function addNew() {
    if (!newTitle.trim() || !newArtist.trim()) {
      setError(t('请填写歌名和原唱。'));
      return;
    }

    const match = songs.find(
      (s) =>
        s.title.toLowerCase() === newTitle.trim().toLowerCase() &&
        s.artist.toLowerCase() === newArtist.trim().toLowerCase(),
    );
    if (match) {
      if (!choices.some((c) => c.songId === match.id))
        setChoices([
          ...choices,
          { songId: match.id, roles: [], priority: nextPriority(), ...newMeta },
        ]);
      return;
    }
    setChoices([
      ...choices,
      {
        songId: 'new-' + crypto.randomUUID(),
        priority: nextPriority(),
        roles: [],
        ...newMeta,
        newSong: {
          title: newTitle.trim(),
          artist: newArtist.trim(),
          ...newMeta,
        },
      },
    ]);
    setNewTitle('');
    setNewArtist('');
    setNewMeta({ preferred_key: '', version_url: '', nomination_note: '' });
  }
  return (
    <main className="workspace">
      <header>
        <div className="brand-nav">
          <a href="/" aria-label={t('After Hours 首页')}>
            <img src="/logo.svg" alt="After Hours" />
          </a>
          <a href="/" className="back-link">
            {t('← 所有 Sessions', '← All sessions')}
          </a>
        </div>
        <div className="row">
          <LanguageSwitch />
          <a href={'/admin/' + sessionId}>{t('主理人管理 ↗')}</a>
        </div>
      </header>
      <section className="intro">
        <div className="row">
          <p className="eyebrow">{config.title.toUpperCase()} · SINGAPORE</p>
          <span className="badge">{t(phaseText[config.phase])}</span>
        </div>
        <h1>
          {t('下一场，', 'Join the')}
          <span>{t('一起加入。', ' next session.')}</span>
        </h1>
        <p>
          {config.selectedDate
            ? t(
                config.dates.find((d) => d.id === config.selectedDate)?.label ||
                  '',
              )
            : t('9 月 19 / 20 日 · 14:30')}{' '}
          · {t(config.location)}
        </p>
        <p className="muted">
          {t('所有时间为新加坡时间 ·')}
          {total}
          {t('人已提交意向')}
        </p>
      </section>
      <SessionProgress phase={config.phase} />
      {(open || (closed && !mine)) && (
        <section className="participation-picker">
          <h2>
            {closed
              ? t(
                  '排练名额已锁定，仍可加入 Open Jam 或来当观众',
                  'Rehearsal places are locked. You can still join the Open Jam or audience.',
                )
              : t('这次，你想怎么参与？', 'How would you like to join?')}
          </h2>
          <Tabs
            value={participation}
            onValueChange={(v) => {
              setParticipation(v as typeof participation);
              setChoices([]);
              setEditing(true);
              setConsent(false);
            }}
          >
            <TabsList style={{ height: 'auto', flexWrap: 'wrap' }}>
              {!closed && (
                <TabsTrigger value="performer">
                  {t('参加排练演出', 'Rehearsed performance')}
                </TabsTrigger>
              )}
              <TabsTrigger value="openjam">
                {t('只参加 Open Jam', 'Open Jam only')}
              </TabsTrigger>
              <TabsTrigger value="audience">
                {t(
                  `来当观众 · ${config.audienceMinimum || 3}+ 名额`,
                  `Come to listen · ${config.audienceMinimum || 3}+ places`,
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="muted">
            {performing
              ? t(
                  '填写歌曲与位置，标明第一、第二优先，其余意向用于补位。',
                  'Choose songs and roles, mark first and second preferences, and add other wishes to help fill gaps.',
                )
              : t(
                  '不用选排练歌曲。可以投票想听的歌，填完时间与联系方式就完成登记。',
                  'No rehearsal songs required. Vote for songs you would like to hear, then submit your availability and contact details to finish.',
                )}
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {t(error)}{' '}
          <button
            className="subtle"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            {t('刷新')}
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {t(message)}
        </p>
      )}
      {loading ? (
        <section className="panel">{t('正在加载活动…')}</section>
      ) : (
        <div className={closed ? 'columns closed-session-layout' : 'columns'}>
          <div className="session-main">
            {!closed && (
              <section className="panel">
                <div
                  className="row"
                  style={{ justifyContent: 'space-between' }}
                >
                  <h2>
                    {['payment', 'locking', 'closed'].includes(config.phase)
                      ? t('最终歌单')
                      : t('公共歌曲池')}
                  </h2>
                  <span className="badge">
                    {songs.length}
                    {t('首提议')}
                  </span>
                </div>
                {open && (
                  <>
                    <p className="muted">
                      {t(
                        '先看看有没有你想玩的歌。新提议随报名提交进入歌曲池，所有人都可以选。',
                      )}
                    </p>
                    <div className="song-tools">
                      <button
                        type="button"
                        className="subtle"
                        onClick={() => {
                          const el = document.getElementById(
                            'new-song',
                          ) as HTMLDetailsElement | null;
                          if (el) {
                            el.open = true;
                            el.scrollIntoView({
                              behavior: 'smooth',
                              block: 'center',
                            });
                            el.querySelector('input')?.focus();
                          }
                        }}
                      >
                        {t('+ 添加新歌', '+ Suggest a song')}
                      </button>
                      <label htmlFor="search">{t('搜索歌名 / 原唱')}</label>
                      <input
                        id="search"
                        placeholder={t('一起选同一首，更容易凑齐阵容')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div
                  className="song-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={t('可滚动歌曲列表', 'Scrollable song list')}
                >
                  {songs
                    .filter(
                      (s) =>
                        (!['payment', 'locking', 'closed'].includes(
                          config.phase,
                        ) ||
                          s.final) &&
                        `${s.title} ${s.artist}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .map((song) => (
                      <div
                        className={finalized ? 'song final-song' : 'song'}
                        key={song.id}
                      >
                        <div
                          className="row"
                          style={{ justifyContent: 'space-between' }}
                        >
                          <div>
                            <h3>
                              {song.title}{' '}
                              {finalized && (
                                <span className="badge">
                                  {song.final === 2
                                    ? t('备用', 'Reserve')
                                    : t('正式', 'Main set')}
                                </span>
                              )}
                            </h3>
                            <p className="muted">
                              {song.artist}
                              {!finalized && (
                                <>
                                  {' '}
                                  · {song.count || 0}
                                  {t('人有意向')} · {song.votes || 0}{' '}
                                  {t('票想听', 'listener votes')}
                                </>
                              )}
                            </p>
                          </div>
                          {open && (
                            <button
                              className={
                                choices.some((c) => c.songId === song.id)
                                  ? 'subtle'
                                  : ''
                              }
                              disabled={choices.some(
                                (c) => c.songId === song.id,
                              )}
                              onClick={() => choose(song)}
                            >
                              {choices.some((c) => c.songId === song.id)
                                ? t('已选择')
                                : performing
                                  ? t('加入意向 +')
                                  : t('想听 +', 'Vote to hear +')}
                            </button>
                          )}
                        </div>
                        {!finalized && (
                          <>
                            <div className="row">
                              {song.roles.map((role) => (
                                <span className="badge" key={role}>
                                  {t(role)} {song.counts?.[role] || 0}
                                </span>
                              ))}
                            </div>
                            <SongReference song={song} />
                          </>
                        )}
                      </div>
                    ))}
                  {query &&
                    !songs.some((song) =>
                      `${song.title} ${song.artist}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    ) && (
                      <p className="muted">
                        {t(
                          '没有匹配的歌曲，可以添加新歌。',
                          'No matching songs. You can suggest a new one.',
                        )}
                      </p>
                    )}
                </div>
                {!songs.length && (
                  <div className="notice">
                    {t('还没有歌曲。提议第一首，再邀请大家加入。')}
                  </div>
                )}
                {open && (
                  <details id="new-song" style={{ marginTop: 20 }}>
                    <summary>{t('没有找到？提议一首新歌')}</summary>
                    <SongFields
                      value={{ title: newTitle, artist: newArtist, ...newMeta }}
                      existing={songs}
                      onChange={(v) => {
                        setNewTitle(v.title);
                        setNewArtist(v.artist);
                        setNewMeta({
                          preferred_key: v.preferred_key,
                          version_url: v.version_url,
                          nomination_note: v.nomination_note,
                        });
                      }}
                    />
                    <p className="muted">
                      {t(
                        '新提名的 Key、版本链接和备注会随歌曲公开展示。',
                        'The key, version link and note for a new nomination are visible in the shared song pool.',
                      )}
                    </p>
                    <button
                      style={{ marginTop: 14 }}
                      className="subtle"
                      onClick={addNew}
                    >
                      {t('加入我的意向')}
                    </button>
                  </details>
                )}
              </section>
            )}
            {closed && (
              <Lineup songs={lineup} className="confirmation-lineup" />
            )}
            <section className="panel registration-panel">
              <Tabs value={accessTab} onValueChange={setAccessTab}>
                <TabsList>
                  <TabsTrigger value="mine">{t('我的报名')}</TabsTrigger>
                  <TabsTrigger value="recover">
                    {t('查找我的报名', 'Find my registration')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="recover">
                  <p className="muted">
                    {t(
                      '用报名时的联系方式和报名密码进入。联系方式不是公开搜索，其他人看不到你的记录。',
                      'Use your registration contact and password. Contact lookup is private, not a public directory.',
                    )}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await post('/api/access', {
                          type: 'member',
                          contact: lookupContact,
                          password: lookupPassword,
                        });
                        await refresh(true);
                        setLookupPassword('');
                        setEditing(false);
                        setAccessTab('mine');
                        setMessage(
                          t('已打开你的报名', 'Your registration is open'),
                        );
                      });
                    }}
                  >
                    <label htmlFor="lookup-contact">
                      {t('报名联系方式', 'Registration contact')}
                    </label>
                    <input
                      id="lookup-contact"
                      required
                      autoComplete="username"
                      value={lookupContact}
                      maxLength={150}
                      onChange={(e) => setLookupContact(e.target.value)}
                    />
                    <label htmlFor="lookup-password">
                      {t('报名密码', 'Registration password')}
                    </label>
                    <input
                      id="lookup-password"
                      required
                      type="password"
                      autoComplete="current-password"
                      minLength={8}
                      maxLength={128}
                      value={lookupPassword}
                      onChange={(e) => setLookupPassword(e.target.value)}
                    />
                    <button style={{ marginTop: 16 }} disabled={busy}>
                      {t('进入我的报名', 'Open my registration')}
                    </button>
                  </form>
                  <p className="muted">
                    {t(
                      '微信号请填写 ID；手机号请带国家代码（例如 +65）。请与报名时保持一致。忘记密码或旧报名没有密码？请联系主理人核实后重设。',
                      'Use your WeChat ID or phone with country code (e.g. +65), as entered when registering. Forgot your password, or have an older registration? Ask the host to verify your identity and reset it.',
                    )}
                  </p>
                </TabsContent>
                <TabsContent value="mine">
                  {mine && (
                    <div
                      className="row"
                      style={{ justifyContent: 'space-between', marginTop: 16 }}
                    >
                      <span>
                        {mine.name} · {mine.contact}
                      </span>
                      <button
                        className="subtle"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await post('/api/access', {
                              type: 'member-logout',
                            });
                            setName('');
                            setContact('');
                            setPassword('');
                            setChoices([]);
                            setAvailability([]);
                            setNote('');
                            setConsent(false);
                            setParticipation('performer');
                            setEditing(false);
                            await refresh();
                            setAccessTab('recover');
                          })
                        }
                      >
                        {t('切换报名人', 'Switch attendee')}
                      </button>
                    </div>
                  )}
                  {mine && !mine.hasPassword && !open && (
                    <div className="notice">
                      <p>
                        {t(
                          '为旧报名设置密码，以后用联系方式进入。',
                          'Set a password for this existing registration to access it by contact.',
                        )}
                      </p>
                      <label htmlFor="legacy-password">
                        {t('设置报名密码', 'Set registration password')}
                      </label>
                      <input
                        id="legacy-password"
                        type="password"
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await post('/api/access', {
                              type: 'set-password',
                              password,
                            });
                            setPassword('');
                            await refresh();
                            setMessage(
                              t('报名密码已设置', 'Registration password set'),
                            );
                          })
                        }
                      >
                        {t('保存密码', 'Save password')}
                      </button>
                    </div>
                  )}

                  {mine && (
                    <div className="row">
                      <p className="success">{t(statusText[mine.status])}</p>
                      <button
                        className="subtle"
                        disabled={busy}
                        onClick={() => run(() => refresh(false))}
                      >
                        {t('刷新状态', 'Refresh status')}
                      </button>
                    </div>
                  )}
                  {!!mine?.slots?.length && (
                    <div className="notice">
                      <h3>{t('我的演出位置', 'My slots')}</h3>
                      {mine.slots.map((slot) => (
                        <p key={slot.songId}>
                          {songs.find((s) => s.id === slot.songId)?.title} ·{' '}
                          {t(slot.role)} ·{' '}
                          {slot.kind === 'reserve'
                            ? t('备用 · 不收定金', 'Reserve · No deposit')
                            : t('正式', 'Main set')}
                        </p>
                      ))}
                    </div>
                  )}
                  {mine?.status === 'unmatched' && (
                    <p className="notice">
                      {t(
                        '本次没有匹配到可成团的位置，不需要付款；你的意向已保留。',
                        'No complete band matched your wishes this time. No payment is needed; your wishes are saved.',
                      )}
                    </p>
                  )}
                  {mine && mine.participation !== 'performer' && !editing ? (
                    <section className="notice">
                      <h3>
                        {t(
                          '登记完成，现场见。',
                          'You’re registered. See you there.',
                        )}
                      </h3>
                      <p>
                        {mine.name} ·{' '}
                        {mine.participation === 'audience'
                          ? t('观众', 'Audience')
                          : t('Open Jam 参与者', 'Open Jam participant')}
                      </p>
                      <p>
                        {t(
                          '你不需要确认排练曲目或提交排练定金。之后用联系方式和报名密码回来查看最终时间与地点。',
                          'No rehearsal songs or deposit required. Return using your contact and registration password for the confirmed date and venue.',
                        )}
                      </p>
                      {canRegister && (
                        <button
                          className="subtle"
                          onClick={() => setEditing(true)}
                        >
                          {t('修改我的登记', 'Edit my registration')}
                        </button>
                      )}
                    </section>
                  ) : canRegister ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          if (!consent) throw new Error(t('请确认报名说明'));
                          await post('/api/intent', {
                            name,
                            contact,
                            password,
                            availability,
                            selections: choices,
                            note,
                            participation,
                          });
                          setPassword('');
                          await refresh(true);
                          setEditing(false);
                          setMessage(
                            performing
                              ? t(
                                  '意向已保存。请在截止后回到这里查看最终安排。',
                                )
                              : t(
                                  '登记已完成，感谢参与。',
                                  'Registration complete. Thanks for joining.',
                                ),
                          );
                        });
                      }}
                    >
                      <div className="grid2">
                        <div>
                          <label htmlFor="name">{t('怎么称呼你 *')}</label>
                          <input
                            id="name"
                            required
                            maxLength={50}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="contact">
                            {t('微信 / WhatsApp / 联系方式 *')}
                          </label>
                          <input
                            id="contact"
                            required
                            maxLength={150}
                            value={contact}
                            onChange={(e) => setContact(e.target.value)}
                          />
                        </div>
                      </div>
                      <p className="muted">
                        {t(
                          '请填写固定的微信 ID 或带国家代码的手机号，之后用同一联系方式查找报名。',
                          'Enter a consistent WeChat ID or phone including country code. Use the same contact to find your registration later.',
                        )}
                      </p>
                      {(!mine || !mine.hasPassword) && (
                        <>
                          <label htmlFor="registration-password">
                            {t('设置报名密码 *', 'Set registration password *')}
                          </label>
                          <input
                            id="registration-password"
                            required
                            type="password"
                            autoComplete="new-password"
                            minLength={8}
                            maxLength={128}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                          <p className="muted">
                            {t(
                              '至少 8 个字符。请为本次报名单独设置密码，不要使用微信或银行密码。',
                              'At least 8 characters. Use a separate registration password, not your WeChat or banking password.',
                            )}
                          </p>
                        </>
                      )}
                      <label>
                        {t(
                          '哪些时间你能来？请勾选所有可参加的时段 *',
                          'When can you join? Select all available dates *',
                        )}
                      </label>
                      {config.dates.map((d) => (
                        <label className="check option" key={d.id}>
                          <Checkbox
                            checked={availability.includes(d.id)}
                            onCheckedChange={(v) =>
                              setAvailability(
                                v
                                  ? [...availability, d.id]
                                  : availability.filter((x) => x !== d.id),
                              )
                            }
                          />
                          {t(d.label)}
                        </label>
                      ))}
                      {!closed && (
                        <>
                          <div className="divider" />
                          <h3>
                            {performing
                              ? t('我的歌曲意向 ·')
                              : t('我想听的歌 ·', 'Songs I’d like to hear · ')}
                            {choices.length}
                          </h3>
                          <p className="muted">
                            {performing
                              ? t(
                                  '可以填写多首歌曲。第一、第二优先各选一首，其余用于补位；所有意向均不保证成团。',
                                  'Add multiple songs. Mark one first and one second preference; other wishes help fill gaps. No song placement is guaranteed.',
                                )
                              : t(
                                  '投票可选，不投票也能提交登记；想听票不占乐手席位。',
                                  'Voting is optional. You can register without voting; listener votes do not reserve musician places.',
                                )}
                          </p>
                          {choices.length === 0 && (
                            <p className="notice">
                              {performing
                                ? t('从上方歌曲池选择，或提议一首新歌。')
                                : t(
                                    '没有投票也没关系，直接完成下方登记。',
                                    'No votes? No problem. Complete your registration below.',
                                  )}
                            </p>
                          )}
                          {choices.map((c, i) => (
                            <div className="option" key={c.songId}>
                              <div
                                className="row"
                                style={{ justifyContent: 'space-between' }}
                              >
                                <strong>
                                  {i + 1}.{' '}
                                  {c.newSong?.title ||
                                    songs.find((s) => s.id === c.songId)?.title}
                                </strong>
                                <button
                                  type="button"
                                  className="subtle"
                                  onClick={() =>
                                    setChoices(
                                      choices.filter(
                                        (x) => x.songId !== c.songId,
                                      ),
                                    )
                                  }
                                >
                                  {t('移除')}
                                </button>
                              </div>
                              {performing && (
                                <>
                                  <Tabs
                                    value={String(c.priority || 3)}
                                    onValueChange={(v) =>
                                      setPriority(
                                        c.songId,
                                        Number(v) as 1 | 2 | 3,
                                      )
                                    }
                                  >
                                    <TabsList
                                      style={{
                                        height: 'auto',
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <TabsTrigger value="1">
                                        {t('第一优先', 'First preference')}
                                      </TabsTrigger>
                                      <TabsTrigger value="2">
                                        {t('第二优先', 'Second preference')}
                                      </TabsTrigger>
                                      <TabsTrigger value="3">
                                        {t('其他意向', 'Other wish')}
                                      </TabsTrigger>
                                    </TabsList>
                                  </Tabs>
                                  <p className="muted">
                                    {t('这首歌你能承担哪些角色？可多选。')}
                                  </p>
                                  <Checks
                                    options={ROLES}
                                    values={c.roles}
                                    onChange={(roles) =>
                                      setChoices(
                                        choices.map((x) =>
                                          x.songId === c.songId
                                            ? { ...x, roles }
                                            : x,
                                        ),
                                      )
                                    }
                                  />
                                </>
                              )}
                            </div>
                          ))}
                          {performing &&
                            choices.map((c) => (
                              <details
                                key={'details-' + c.songId}
                                className="option"
                              >
                                <summary>
                                  {c.newSong?.title ||
                                    songs.find((song) => song.id === c.songId)
                                      ?.title}{' '}
                                  ·{' '}
                                  {t(
                                    '我的调性与版本备注',
                                    'My key & version notes',
                                  )}
                                </summary>
                                <RehearsalFields
                                  value={{
                                    preferred_key: c.preferred_key || '',
                                    version_url: c.version_url || '',
                                    nomination_note: c.nomination_note || '',
                                  }}
                                  onChange={(meta) =>
                                    setChoices(
                                      choices.map((x) =>
                                        x.songId === c.songId
                                          ? {
                                              ...x,
                                              ...meta,
                                              ...(x.newSong
                                                ? {
                                                    newSong: {
                                                      ...x.newSong,
                                                      ...meta,
                                                    },
                                                  }
                                                : {}),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                                <p className="muted">
                                  {c.newSong
                                    ? t(
                                        '新提名备注会公开。',
                                        'New nomination notes are public.',
                                      )
                                    : t(
                                        '已有歌曲的个人备注只提供给主理人。',
                                        'Personal notes on existing songs are only shared with the host.',
                                      )}
                                </p>
                              </details>
                            ))}
                        </>
                      )}
                      <label htmlFor="note">
                        {performing
                          ? t('补充说明（音域、调性、设备等）')
                          : t(
                              '补充说明（Open Jam 乐器等，可不填）',
                              'Notes (Open Jam instruments, etc.; optional)',
                            )}
                      </label>
                      <textarea
                        id="note"
                        maxLength={500}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <label className="check" style={{ margin: '20px 0' }}>
                        <Checkbox
                          checked={consent}
                          onCheckedChange={(v) => setConsent(!!v)}
                        />
                        <span>
                          {performing
                            ? t(
                                '我理解优先歌曲不保证入选。系统根据意向匹配位置；成团后的名字与角色公开展示，联系方式、个人备注及付款截图仅本人和主理人可见。',
                                'I understand song preferences are not guaranteed. Matching uses my submitted wishes. Lineup names and roles are visible; contact details, personal notes and receipts stay private.',
                              )
                            : t(
                                '我同意将联系方式提供给主理人用于本次活动联络，想听票数可公开展示。',
                                'I agree to share my contact details with the host for this session. Listener vote counts may be displayed publicly.',
                              )}
                        </span>
                      </label>
                      <button className="full" disabled={busy}>
                        {busy
                          ? t('保存中…')
                          : mine
                            ? t('更新我的意向')
                            : t('提交意向 ↗')}
                      </button>
                    </form>
                  ) : !mine ? (
                    <p>
                      {t(
                        '意向收集已结束。请用联系方式和报名密码进入已有报名。',
                        'Interest collection has closed. Use your contact and registration password to access an existing registration.',
                      )}
                    </p>
                  ) : null}
                </TabsContent>
              </Tabs>
            </section>
            {!closed &&
              mine &&
              ['invited', 'pending', 'confirmed', 'rejected'].includes(
                mine.status,
              ) && (
                <section className="panel">
                  <h2>
                    {t('定金 · S$')}
                    {config.deposit}
                    {t('/ 人')}
                  </h2>
                  <p className="muted">
                    {t('每场收取一次，不按歌曲数重复收取。')}
                  </p>
                  {mine.review_note && (
                    <p className="error">{mine.review_note}</p>
                  )}
                  {['payment', 'locking'].includes(config.phase) &&
                  !expired(config.paymentDeadline) &&
                  ['invited', 'rejected'].includes(mine.status) ? (
                    <>
                      <p style={{ whiteSpace: 'pre-wrap' }}>
                        {config.paymentInfo}
                      </p>
                      <p className="notice" style={{ whiteSpace: 'pre-wrap' }}>
                        {t('取消与退款说明：')}
                        {config.refundInfo}
                      </p>
                      <div className="row">
                        {config.paynowQR && (
                          <div>
                            <p>PayNow</p>
                            <img
                              className="qr"
                              src={fileUrl(config.paynowQR)}
                              alt={t('PayNow 收款二维码')}
                            />
                          </div>
                        )}
                        {config.wechatQR && (
                          <div>
                            <p>{t('微信支付')}</p>
                            <img
                              className="qr"
                              src={fileUrl(config.wechatQR)}
                              alt={t('微信支付收款二维码')}
                            />
                          </div>
                        )}
                      </div>
                      <label>{t('你使用的付款方式')}</label>
                      <Tabs
                        value={method}
                        onValueChange={(v) => setMethod(String(v))}
                      >
                        <TabsList>
                          <TabsTrigger
                            value="paynow"
                            disabled={!config.paynowQR}
                          >
                            PayNow
                          </TabsTrigger>
                          <TabsTrigger
                            value="wechat"
                            disabled={!config.wechatQR}
                          >
                            {t('微信支付')}
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <label htmlFor="receipt">
                        {t('付款截图（PNG / JPG / WebP，最多 5 MB）')}
                      </label>
                      <input
                        id="receipt"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                      <p className="muted">
                        {t(
                          '可遮盖余额及无关交易，保留金额、收款方和转账时间。主理人核对到账后才会锁定名额。',
                        )}
                      </p>
                      <button
                        disabled={busy || !file}
                        onClick={() =>
                          run(async () => {
                            const form = new FormData();
                            form.append('sessionId', sessionId);
                            form.set('file', file!);
                            form.set('kind', 'receipt');
                            form.set('method', method);
                            const r = await fetch('/api/upload', {
                              method: 'POST',
                              body: form,
                            });
                            const d: any = await r.json();
                            if (!r.ok) throw new Error(d.error);
                            await refresh();
                            setMessage(t('截图已提交，等待主理人核对到账。'));
                          })
                        }
                      >
                        {t('提交截图，等待确认')}
                      </button>
                    </>
                  ) : (
                    <p>
                      {mine.status === 'confirmed'
                        ? t('已确认到账，你的活动名额已锁定。')
                        : mine.status === 'pending'
                          ? t('截图已收到，主理人正在核对。')
                          : t('付款尚未开放或已截止，请联系主理人。')}
                    </p>
                  )}
                  {mine.receipt && (
                    <details>
                      <summary>{t('查看我提交的截图')}</summary>
                      <img
                        className="payment-image"
                        src={fileUrl(mine.receipt)}
                        alt={t('我的付款截图')}
                      />
                    </details>
                  )}
                </section>
              )}
          </div>
          <aside>
            <img
              className="session-poster"
              src={
                config.poster ? fileUrl(config.poster) : '/session-poster.svg'
              }
              alt={t('Session 活动海报', 'Session poster')}
            />
            {closed ? (
              <section className="panel">
                <p className="eyebrow">OPEN JAM / AUDIENCE</p>
                <h2>
                  {t(
                    '排练名额已锁定，现场仍然欢迎你。',
                    'Rehearsal places are locked. You are still welcome.',
                  )}
                </h2>
                <p>
                  {t(
                    '可以继续登记 Open Jam 或观众，不需要选择排练歌曲，也不用支付定金。',
                    'You can still register for the Open Jam or audience. No rehearsal songs or deposit are required.',
                  )}
                </p>
              </section>
            ) : performing ? (
              <section className="panel">
                <p className="eyebrow">{t('怎么参加', 'HOW TO JOIN')}</p>
                <h2>{t('从报名到上场', 'From signup to the stage')}</h2>
                <div className="song">
                  <strong>{t('01　收集意向')}</strong>
                  <p className="muted">{t('时间、歌曲、歌手与乐手角色。')}</p>
                  <p>
                    {config.intentDeadline
                      ? config.intentDeadline.replace('T', ' ') + t(' 截止')
                      : t('意向截止时间待公布')}
                  </p>
                </div>
                <div className="song">
                  <strong>
                    {t(
                      '02　确认歌单与自动匹配',
                      '02 Setlist & automatic matching',
                    )}
                  </strong>
                  <p className="muted">
                    {t(
                      '主理人确认时间与歌单，系统根据意向分配位置。',
                      'The host confirms the date and setlist; matching assigns roles from your wishes.',
                    )}
                  </p>
                </div>
                <div className="song">
                  <strong>{t('03　提交定金')}</strong>
                  <p className="muted">
                    S${config.deposit}
                    {t('/ 人 · PayNow / 微信支付')}
                  </p>
                  <p>
                    {config.paymentDeadline
                      ? config.paymentDeadline.replace('T', ' ') + t(' 截止')
                      : t('最终方案公布后开放')}
                  </p>
                </div>
                <div className="song">
                  <strong>{t('04　锁定名额')}</strong>
                  <p className="muted">
                    {t('付款截图经核对后，报名状态变为已确认。')}
                  </p>
                </div>
              </section>
            ) : (
              <section className="panel">
                <p className="eyebrow">JUST SHOW UP</p>
                <h2>
                  {t('把一个下午，留给音乐。', 'Keep an afternoon for music.')}
                </h2>
                <p>
                  {t(
                    '选择能来的时间，留个联系方式就好。投票想听的歌是可选项。',
                    'Choose when you can join and leave your contact details. Voting for songs is optional.',
                  )}
                </p>
                <p className="notice">
                  {t(
                    '提交即完成登记，不用确认排练曲目，也不用上传排练定金截图。',
                    'Submitting completes your registration. No rehearsal song confirmation or rehearsal deposit receipt is required.',
                  )}
                </p>
                <p className="muted">
                  {config.intentDeadline
                    ? config.intentDeadline.replace('T', ' ') + t(' 截止')
                    : t('意向截止时间待公布')}
                </p>
              </section>
            )}
            <p className="muted">
              {t(
                '报名后可用联系方式和报名密码回到本页查看最终安排。暂不发送自动通知。',
                'Return with your contact and registration password for the final arrangement. Automatic notifications are not enabled.',
              )}
            </p>
            <footer>
              Music lives later.
              <br />
              After Hours.
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}
