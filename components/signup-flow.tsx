'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Headphones,
  Mic2,
  Music2,
  Plus,
  X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LanguageSwitch, useLocale } from '@/lib/locale';
import { SongFields, RehearsalFields } from '@/components/song-fields';
import { Lineup, type VisibleLineup } from '@/components/lineup';
import { emptyDraft, type SongDraft } from '@/lib/catalog';
import { sortSongsByVacancy } from '@/lib/song-availability';
import {
  defaults,
  expired,
  needsDeposit,
  priorityOf,
  ROLES,
  type Settings,
  type Person,
  type Song,
  type Selection,
} from '@/lib/shared';

type Step = 'account' | 'guide' | 'participation' | 'songs' | 'time' | 'result';
type Choice = Selection & { newSong?: SongDraft };
type Data = {
  config: Settings;
  songs: Song[];
  mine: Person | null;
  lineup: VisibleLineup[];
};
const steps: Step[] = [
  'account',
  'guide',
  'participation',
  'songs',
  'time',
  'result',
];
const statusText: Record<string, string> = {
  intent: '意向已记录',
  invited: '阵容已确认 · 待付定金',
  standby: '备用阵容 · 无需定金',
  unmatched: '本次暂未匹配 · 无需定金',
  pending: '付款待核对',
  confirmed: '名额已锁定',
  rejected: '需要补充付款截图',
};

export default function SignupFlow() {
  const { t } = useLocale();
  const [sessionId, setSessionId] = useState('');
  const [data, setData] = useState<Data>({
    config: defaults,
    songs: [],
    mine: null,
    lineup: [],
  });
  const [step, setStep] = useState<Step>('account');
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [mode, setMode] = useState('register'),
    [name, setName] = useState(''),
    [contact, setContact] = useState(''),
    [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false),
    [participation, setParticipation] =
      useState<Person['participation']>('performer');
  const [choices, setChoices] = useState<Choice[]>([]),
    [availability, setAvailability] = useState<string[]>([]),
    [note, setNote] = useState('');
  const [query, setQuery] = useState(''),
    [adding, setAdding] = useState(false),
    [newSong, setNewSong] = useState<SongDraft>(emptyDraft);
  const [receipt, setReceipt] = useState<File | null>(null),
    [method, setMethod] = useState('paynow');
  const heading = useRef<HTMLHeadingElement>(null);
  const { config, songs, mine } = data;
  useEffect(() => {
    if (!config.paynowQR && config.wechatQR) setMethod('wechat');
  }, [config.paynowQR, config.wechatQR]);
  const performing = participation === 'performer',
    open = config.phase === 'intent' && !expired(config.intentDeadline),
    closed = config.phase === 'closed';
  const submitted = !!mine && mine.status !== 'draft';
  const canEdit =
    mine?.hasPassword &&
    mine.status === 'intent' &&
    (open || (closed && mine.participation !== 'performer'));
  const fileUrl = (key: string) =>
    '/api/file?session=' +
    encodeURIComponent(sessionId) +
    '&key=' +
    encodeURIComponent(key);
  const choiceTitle = (c: Choice) =>
    c.newSong?.title ||
    songs.find((s) => s.id === c.songId)?.title ||
    t('歌曲', 'Song');
  const preference = (p: number) =>
    p === 1
      ? t('第一优先', 'First preference')
      : p === 2
        ? t('第二优先', 'Second preference')
        : t('其他意向', 'Other preference');
  function go(next: Step, replace = false) {
    setError('');
    setStep(next);
    window.history[replace ? 'replaceState' : 'pushState'](
      null,
      '',
      '#' + next,
    );
  }
  const refresh = useCallback(async () => {
    const response = await fetch(
      '/api/session?session=' + encodeURIComponent(sessionId),
    );
    const result = (await response.json()) as Data & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setData(result);
    return result;
  }, [sessionId]);
  function fill(p: Person) {
    setName(p.name);
    setContact(p.contact);
    setParticipation(p.participation);
    setChoices(
      p.selections.map((s, i) => ({ ...s, priority: priorityOf(s, i) })),
    );
    setAvailability(p.availability);
    setNote(p.note);
  }
  useEffect(() => {
    setSessionId(
      window.location.pathname.match(/\/sessions\/(session-[a-z0-9-]+)/)?.[1] ||
        'session-001',
    );
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    refresh()
      .then((result) => {
        if (result.mine) fill(result.mine);
        go(
          result.mine
            ? result.mine.status === 'draft'
              ? 'guide'
              : 'result'
            : 'account',
          true,
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId, refresh]);
  useEffect(() => {
    const onBack = () => {
      const target = window.location.hash.slice(1) as Step;
      if (steps.includes(target)) {
        setStep(
          !mine && target !== 'account'
            ? 'account'
            : target === 'result' && !submitted
              ? 'guide'
              : target,
        );
        setError('');
      }
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [mine, submitted]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('操作失败'));
    } finally {
      setBusy(false);
    }
  }
  async function post(url: string, body: object) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, sessionId }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  function choose(song: Song) {
    if (choices.some((c) => c.songId === song.id)) return;
    setChoices([
      ...choices,
      {
        songId: song.id,
        roles: [],
        substitute: performing && !!song.vacancy?.ready,
        priority: nextPriority(),
        preferred_key: song.preferred_key,
        version_url: song.version_url,
        nomination_note: '',
      },
    ]);
  }
  function nextPriority(): 1 | 2 | 3 {
    return !choices.some((c) => c.priority === 1)
      ? 1
      : !choices.some((c) => c.priority === 2)
        ? 2
        : 3;
  }
  function updateChoice(id: string, patch: Partial<Choice>) {
    setChoices((current) =>
      current.map((c) => (c.songId === id ? { ...c, ...patch } : c)),
    );
  }
  function changePriority(id: string, priority: 1 | 2 | 3) {
    const previous = choices.find((c) => c.songId === id)?.priority || 3;
    setChoices(
      choices.map((c) =>
        c.songId === id
          ? { ...c, priority }
          : priority !== 3 && c.priority === priority
            ? { ...c, priority: previous }
            : c,
      ),
    );
  }
  function removeChoice(id: string) {
    const rest = choices.filter((c) => c.songId !== id);
    if (rest.length && !rest.some((c) => c.priority === 1))
      rest[0] = { ...rest[0], priority: 1 };
    if (rest.length > 1 && !rest.some((c) => c.priority === 2)) {
      const i = rest.findIndex((c) => c.priority !== 1);
      rest[i] = { ...rest[i], priority: 2 };
    }
    setChoices(rest);
  }
  function validateSongs() {
    if (performing && (!choices.length || choices.some((c) => !c.roles.length)))
      throw new Error(
        t(
          '请选择至少一首歌，并为每首已选歌曲选择角色。',
          'Choose at least one song and a role for each selected song.',
        ),
      );
    if (
      performing &&
      (!choices.some((c) => c.priority === 1) ||
        (choices.length > 1 && !choices.some((c) => c.priority === 2)))
    )
      throw new Error(
        t(
          '请标明第一、第二优先歌曲。',
          'Mark your first and second preferences.',
        ),
      );
  }
  async function submit() {
    validateSongs();
    if (!availability.length)
      throw new Error(t('请选择可参加的时间', 'Choose your available times.'));
    await post('/api/intent', {
      name: mine?.name || name,
      contact: mine?.contact || contact,
      participation,
      selections: choices,
      availability,
      note,
    });
    const result = await refresh();
    if (result.mine) fill(result.mine);
    go('result', true);
  }
  async function logout() {
    await post('/api/access', { type: 'member-logout' });
    setData({ ...data, mine: null });
    setPassword('');
    setName('');
    setContact('');
    setChoices([]);
    setAvailability([]);
    setNote('');
    setConsent(false);
    go('account', true);
  }
  const titles: Record<Step, string> = {
    account: t('先认识一下。', 'Start here.'),
    guide: t('从报名到上场', 'From signup to the stage'),
    participation: t('你想怎么参与？', 'How will you join?'),
    songs: performing
      ? t('选你想玩的歌', 'Choose your songs')
      : t('你想听哪首？', 'What would you like to hear?'),
    time: t('哪些时间能来？', 'When can you join?'),
    result: t('我的报名', 'My registration'),
  };
  const back = () => {
    if (step === 'account' || step === 'result') {
      window.location.href = '/';
      return;
    }
    go(
      step === 'time' && !performing
        ? 'participation'
        : steps[Math.max(0, steps.indexOf(step) - 1)],
    );
  };
  const stepNumber = steps.indexOf(step) + 1;
  return (
    <main className="signup-app">
      <header className="signup-header">
        <button
          className="signup-back"
          onClick={back}
          disabled={busy}
          aria-label={t('返回', 'Back')}
        >
          <ArrowLeft size={22} />
        </button>
        <a href="/" className="signup-brand">
          <img src="/logo.svg" alt="After Hours" />
        </a>
        <LanguageSwitch />
      </header>
      {loading ? (
        <section className="signup-body">
          <p role="status">{t('正在加载活动…')}</p>
        </section>
      ) : (
        <>
          <div
            className="signup-progress"
            aria-label={t('报名进度', 'Registration progress')}
          >
            {steps.slice(0, 5).map((s, i) => (
              <span key={s} className={i < stepNumber ? 'is-done' : ''} />
            ))}
          </div>
          <section className="signup-body" key={step}>
            <p className="signup-kicker">
              {config.title}
              <span>
                {step === 'result'
                  ? t('已登记', 'REGISTERED')
                  : `${String(stepNumber).padStart(2, '0')} / 05`}
              </span>
            </p>
            <h1 tabIndex={-1} ref={heading}>
              {titles[step]}
            </h1>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {step === 'account' && (
              <>
                <p className="muted">
                  {t(
                    '留下联系方式，用密码随时查看这场报名。',
                    'Use your contact and a password to return to this session.',
                  )}
                </p>
                {mine ? (
                  <div className="signup-card">
                    <h2>{mine.name}</h2>
                    <p>{mine.contact}</p>
                    <button className="subtle" onClick={() => run(logout)}>
                      {t('切换账号', 'Switch account')}
                    </button>
                  </div>
                ) : (
                  <>
                    <Tabs
                      value={mode}
                      onValueChange={(v) => {
                        setMode(String(v));
                        setError('');
                      }}
                    >
                      <TabsList>
                        <TabsTrigger value="register">
                          {t('首次报名', 'New here')}
                        </TabsTrigger>
                        <TabsTrigger value="login">
                          {t('已有报名，登录', 'Sign in')}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <form
                      id="registration-account"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          await post('/api/access', {
                            type: mode === 'register' ? 'register' : 'member',
                            name,
                            contact,
                            password,
                          });
                          setPassword('');
                          const result = await refresh();
                          if (result.mine) fill(result.mine);
                          go(
                            result.mine?.status === 'draft'
                              ? 'guide'
                              : 'result',
                          );
                        });
                      }}
                    >
                      {mode === 'register' && (
                        <>
                          <label htmlFor="signup-name">
                            {t('怎么称呼你', 'Your name')}
                          </label>
                          <input
                            id="signup-name"
                            required
                            maxLength={50}
                            autoComplete="nickname"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </>
                      )}
                      <label htmlFor="signup-contact">
                        {t(
                          '微信 ID / WhatsApp 手机号',
                          'WeChat ID / WhatsApp number',
                        )}
                      </label>
                      <input
                        id="signup-contact"
                        required
                        maxLength={150}
                        autoComplete="username"
                        autoCapitalize="none"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder={t(
                          '微信 ID 或 +65 手机号',
                          'WeChat ID or phone with country code',
                        )}
                      />
                      <label htmlFor="signup-password">
                        {mode === 'register'
                          ? t('设置报名密码', 'Create a password')
                          : t('报名密码', 'Password')}
                      </label>
                      <input
                        id="signup-password"
                        type="password"
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete={
                          mode === 'register'
                            ? 'new-password'
                            : 'current-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <p className="muted">
                        {mode === 'register'
                          ? t(
                              '至少 8 个字符，请使用单独的报名密码。',
                              'At least 8 characters. Use a separate registration password.',
                            )
                          : t(
                              '忘记密码？请联系主理人核实后重设。',
                              'Forgot your password? Contact the host for a reset.',
                            )}
                      </p>
                      {mode === 'register' && (
                        <label className="signup-check">
                          <Checkbox
                            checked={consent}
                            onCheckedChange={(v) => setConsent(!!v)}
                            required
                          />
                          <span>
                            {t(
                              '同意主理人使用联系方式联络本场活动；提交后歌曲意向和角色可公开展示。',
                              'I agree to be contacted by the host for this session. Submitted song preferences and roles may be shown publicly.',
                            )}
                          </span>
                        </label>
                      )}
                    </form>
                  </>
                )}
              </>
            )}
            {step === 'guide' && (
              <>
                <p className="muted">
                  {t('先看看这场怎么参加。', 'Here is how this session works.')}
                </p>
                <div className="signup-guide">
                  {[
                    [
                      t('填写意向', 'Share your preferences'),
                      t(
                        '选歌、选角色，多选能来的时间。',
                        'Choose songs, roles and all available times.',
                      ),
                    ],
                    [
                      t('主理人安排', 'The host puts it together'),
                      t(
                        '按第一、第二优先调度，不保证两首都能安排；整场 6 首正式 + 2 首备用。',
                        'First and second preferences come first; neither is guaranteed. 6 main songs and 2 reserves.',
                      ),
                    ],
                    [
                      t('确认与定金', 'Confirm your place'),
                      t(
                        `正式曲目成员每人定金 S$${config.deposit}；名单公布后登录查看位置并上传付款截图。`,
                        `Main-set musicians pay S$${config.deposit} each. Sign in after publication to view slots and upload a receipt.`,
                      ),
                    ],
                    [
                      t('一起加入', 'Join the session'),
                      t(
                        'Open Jam、观众及仅备用曲目成员无需定金。排练全程影音记录。',
                        'No deposit for Open Jam, audience or reserve-only musicians. Rehearsals include photo and video coverage.',
                      ),
                    ],
                  ].map(([title, detail], i) => (
                    <div key={i}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <h2>{title}</h2>
                        <p>{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <details className="signup-details">
                  <summary>
                    {t('查看活动海报与地点', 'Poster and venue')}
                  </summary>
                  <p>{t(config.location)}</p>
                  <img
                    className="session-poster"
                    src={
                      config.poster
                        ? fileUrl(config.poster)
                        : '/session-poster.svg'
                    }
                    alt={t('活动海报', 'Session poster')}
                  />
                </details>
              </>
            )}
            {step === 'participation' && (
              <>
                <p className="muted">
                  {closed
                    ? t(
                        '排练名额已锁定，仍欢迎 Open Jam 和观众登记。',
                        'Rehearsal places are locked. Open Jam and audience registration remain open.',
                      )
                    : t(
                        '选一种参与方式，接下来只填相关信息。',
                        'Choose one way to join.',
                      )}
                </p>
                <div className="signup-participation">
                  {(['performer', 'openjam', 'audience'] as const).map(
                    (kind, i) => {
                      const Icon = [Mic2, Music2, Headphones][i];
                      return (
                        <button
                          key={kind}
                          aria-pressed={participation === kind}
                          disabled={
                            kind === 'performer' ? !open : !(open || closed)
                          }
                          onClick={() => {
                            if (kind !== participation) setChoices([]);
                            setParticipation(kind);
                          }}
                        >
                          <Icon size={26} />
                          <span>
                            <strong>
                              {
                                [
                                  t('加入排练', 'Guided band session'),
                                  'Open Jam',
                                  t('来当观众', 'Come to listen'),
                                ][i]
                              }
                            </strong>
                            <small>
                              {
                                [
                                  t(
                                    '选歌和角色，提前组队排练',
                                    'Pick songs and roles for a rehearsed set',
                                  ),
                                  t(
                                    '现场一起玩，可投票想听的歌',
                                    'Jam on the day; song votes are optional',
                                  ),
                                  t(
                                    '来听音乐，可投票想听的歌',
                                    'Enjoy the music; song votes are optional',
                                  ),
                                ][i]
                              }
                            </small>
                          </span>
                          {participation === kind && <Check size={20} />}
                        </button>
                      );
                    },
                  )}
                </div>
                {!(open || closed) && (
                  <p className="notice">
                    {t(
                      '主理人正在整理报名，请稍后再来。已有报名可登录查看。',
                      'The host is reviewing registrations. Return later or sign in to view an existing registration.',
                    )}
                  </p>
                )}
              </>
            )}
            {step === 'songs' && (
              <>
                <p className="muted">
                  {performing
                    ? t(
                        '优先显示缺位最少的歌曲，已凑齐的放在后面。选歌后填写角色和优先级，也可以加入补位。缺位按同一候选时间的意向估算，以主理人确认为准。',
                        'Songs closest to a full lineup come first; covered songs come last. Choose roles and preferences, or join standby. Coverage uses a common candidate date and awaits host confirmation.',
                      )
                    : t(
                        '投票可选，不投票也能继续登记。',
                        'Voting is optional. You can continue without it.',
                      )}
                </p>
                <div className="signup-song-tools">
                  <input
                    aria-label={t('搜索歌名或乐队', 'Search songs or artists')}
                    placeholder={t('搜索歌名 / 乐队', 'Search songs / artists')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button className="subtle" onClick={() => setAdding(!adding)}>
                    <Plus size={18} />
                    {t('提名新歌', 'Suggest')}
                  </button>
                </div>
                {adding && (
                  <div className="signup-card">
                    <SongFields
                      value={newSong}
                      onChange={setNewSong}
                      existing={songs}
                    />
                    <button
                      onClick={() => {
                        if (!newSong.title.trim() || !newSong.artist.trim()) {
                          setError(t('请填写歌名和原唱。'));
                          return;
                        }
                        const existing = songs.find(
                          (s) =>
                            s.title.trim().toLowerCase() ===
                              newSong.title.trim().toLowerCase() &&
                            s.artist.trim().toLowerCase() ===
                              newSong.artist.trim().toLowerCase(),
                        );
                        if (existing) choose(existing);
                        else
                          setChoices([
                            ...choices,
                            {
                              ...newSong,
                              newSong: { ...newSong },
                              songId: 'new-' + crypto.randomUUID(),
                              roles: [],
                              priority: nextPriority(),
                            },
                          ]);
                        setAdding(false);
                        setNewSong(emptyDraft);
                        setError('');
                      }}
                    >
                      {t('加入我的选择', 'Add to my choices')}
                    </button>
                  </div>
                )}
                <div className="signup-song-list">
                  {(performing ? sortSongsByVacancy(songs) : songs)
                    .filter(
                      (s) =>
                        !choices.some((c) => c.songId === s.id) &&
                        `${s.title} ${s.artist}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .map((song) => (
                      <button
                        className="signup-song-row"
                        key={song.id}
                        onClick={() => choose(song)}
                      >
                        <span>
                          <strong>{song.title}</strong>
                          <small>
                            {song.artist} · {song.votes || 0}{' '}
                            {t('票想听', 'listener votes')}
                          </small>
                          {performing && (
                            <small className="signup-vacancy">
                              {song.vacancy?.ready
                                ? t(
                                    '意向已凑齐 · 可加入补位',
                                    'Lineup covered · standby available',
                                  )
                                : t('还缺：', 'Needed: ') +
                                  (song.vacancy?.missing || song.roles)
                                    .map((role) => t(role))
                                    .join(' / ')}
                            </small>
                          )}
                        </span>
                        <span className="signup-song-action">
                          {performing && song.vacancy?.ready ? (
                            t('加入补位', 'Standby')
                          ) : (
                            <Plus size={20} />
                          )}
                        </span>
                      </button>
                    ))}
                  {!songs.some(
                    (s) =>
                      !choices.some((c) => c.songId === s.id) &&
                      `${s.title} ${s.artist}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  ) && (
                    <p className="muted">
                      {t(
                        '没有其他匹配歌曲，可以提名新歌。',
                        'No more matching songs. Suggest a new one.',
                      )}
                    </p>
                  )}
                </div>
                <h2 className="signup-selected-title">
                  {t('我的选择', 'My choices')} <span>{choices.length}</span>
                </h2>
                {choices.map((choice) => (
                  <article
                    key={choice.songId}
                    className="signup-card signup-choice"
                  >
                    <div className="signup-card-heading">
                      <h3>{choiceTitle(choice)}</h3>
                      <button
                        className="signup-icon"
                        aria-label={
                          t('移除', 'Remove') + ' ' + choiceTitle(choice)
                        }
                        onClick={() => removeChoice(choice.songId)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    {performing && (
                      <>
                        <label className="signup-check">
                          <Checkbox
                            checked={!!choice.substitute}
                            onCheckedChange={(checked) =>
                              updateChoice(choice.songId, {
                                substitute: !!checked,
                              })
                            }
                          />
                          <span>
                            {t(
                              '加入补位（有空缺时再安排）',
                              'Standby — assign only if a place opens',
                            )}
                          </span>
                        </label>
                        <label htmlFor={'priority-' + choice.songId}>
                          {t('优先级', 'Preference')}
                        </label>
                        <select
                          id={'priority-' + choice.songId}
                          value={choice.priority || 3}
                          onChange={(e) =>
                            changePriority(
                              choice.songId,
                              Number(e.target.value) as 1 | 2 | 3,
                            )
                          }
                        >
                          {([1, 2, 3] as const).map((p) => (
                            <option key={p} value={p}>
                              {preference(p)}
                            </option>
                          ))}
                        </select>
                        <fieldset className="signup-roles">
                          <legend>
                            {t('这首歌我想担任', 'My roles for this song')}
                          </legend>
                          {ROLES.map((role) => (
                            <label className="signup-role" key={role}>
                              <Checkbox
                                checked={choice.roles.includes(role)}
                                onCheckedChange={(checked) =>
                                  updateChoice(choice.songId, {
                                    roles: checked
                                      ? [...choice.roles, role]
                                      : choice.roles.filter((r) => r !== role),
                                  })
                                }
                              />
                              {t(role)}
                            </label>
                          ))}
                        </fieldset>
                        <details>
                          <summary>
                            {t(
                              'Key / 版本 / 备注（选填）',
                              'Key / version / notes (optional)',
                            )}
                          </summary>
                          <RehearsalFields
                            value={{
                              preferred_key: choice.preferred_key || '',
                              version_url: choice.version_url || '',
                              nomination_note: choice.nomination_note || '',
                            }}
                            onChange={(value) =>
                              updateChoice(choice.songId, {
                                ...value,
                                ...(choice.newSong
                                  ? { newSong: { ...choice.newSong, ...value } }
                                  : {}),
                              })
                            }
                          />
                        </details>
                      </>
                    )}
                  </article>
                ))}
              </>
            )}
            {step === 'time' && (
              <>
                <p className="muted">
                  {t(
                    '可以多选，所有时间均为新加坡时间。',
                    'Select every time that works. All times are Singapore time.',
                  )}
                </p>
                <div className="signup-dates">
                  {config.dates.map((date) => (
                    <label
                      key={date.id}
                      className={
                        'signup-date ' +
                        (availability.includes(date.id) ? 'is-selected' : '')
                      }
                    >
                      <Checkbox
                        checked={availability.includes(date.id)}
                        onCheckedChange={(checked) =>
                          setAvailability(
                            checked
                              ? [...availability, date.id]
                              : availability.filter((id) => id !== date.id),
                          )
                        }
                      />
                      <span>{t(date.label)}</span>
                    </label>
                  ))}
                </div>
                {!performing && (
                  <button className="subtle" onClick={() => go('songs')}>
                    {t('投票想听的歌（可选）', 'Vote for songs (optional)')}
                  </button>
                )}
                <label htmlFor="signup-note">
                  {t('补充说明（选填）', 'Anything else? (optional)')}
                </label>
                <textarea
                  id="signup-note"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t(
                    '例如：Open Jam 想玩的乐器',
                    'For example, your Open Jam instrument',
                  )}
                />
                <div className="signup-card">
                  <p>
                    {performing
                      ? t('排练意向', 'Rehearsal preferences')
                      : participation === 'openjam'
                        ? 'Open Jam'
                        : t('观众', 'Audience')}
                  </p>
                  <strong>
                    {choices.length}{' '}
                    {performing
                      ? t('首歌曲已选', 'songs selected')
                      : t('首想听歌曲', 'song votes')}
                  </strong>
                  <p className="muted">
                    {t(
                      '提交后可以登录查看本次登记和后续安排。',
                      'Sign in after submitting to view your registration and updates.',
                    )}
                  </p>
                </div>
              </>
            )}
            {step === 'result' && mine && (
              <>
                {!mine.hasPassword && (
                  <form
                    className="signup-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await post('/api/access', {
                          type: 'set-password',
                          password,
                        });
                        setPassword('');
                        await refresh();
                      });
                    }}
                  >
                    <h2>{t('设置报名密码', 'Create a password')}</h2>
                    <p className="muted">
                      {t(
                        '为已有报名设置密码，下次可用联系方式登录。',
                        'Set a password for your existing registration to sign in next time.',
                      )}
                    </p>
                    <input
                      type="password"
                      aria-label={t('报名密码', 'Registration password')}
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button disabled={busy} type="submit">
                      {t('保存密码', 'Save password')}
                    </button>
                  </form>
                )}
                <div className="signup-success">
                  <CheckCircle2 size={32} />
                  <div>
                    <h2>
                      {mine.participation === 'performer'
                        ? t(statusText[mine.status] || '意向已记录')
                        : t('登记完成', 'Registration complete')}
                    </h2>
                    <p>
                      {mine.name} · {mine.contact}
                    </p>
                  </div>
                </div>
                {mine.participation === 'performer' ? (
                  <>
                    <h2>
                      {t(
                        '最终提交的意向歌曲',
                        'Your submitted song preferences',
                      )}
                    </h2>
                    {[...mine.selections]
                      .sort((a, b) => (a.priority || 3) - (b.priority || 3))
                      .map((choice, i) => (
                        <div className="signup-card" key={choice.songId}>
                          <span className="signup-kicker">
                            {preference(priorityOf(choice, i))}
                          </span>
                          <h3>
                            {choiceTitle(choice)}
                            {choice.substitute && (
                              <span className="badge">
                                {t('补位候选', 'Standby')}
                              </span>
                            )}
                          </h3>
                          <p>{choice.roles.map((r) => t(r)).join(' / ')}</p>
                          {choice.preferred_key && (
                            <small>Key: {choice.preferred_key}</small>
                          )}
                        </div>
                      ))}
                    {config.matchingPublishedAt && (
                      <div className="signup-card">
                        <h2>{t('我的排练位置', 'My rehearsal slots')}</h2>
                        {mine.slots.length ? (
                          mine.slots.map((slot, i) => (
                            <p key={i}>
                              {songs.find((s) => s.id === slot.songId)?.title} ·{' '}
                              {t(slot.role)} ·{' '}
                              {slot.kind === 'main'
                                ? t('正式', 'Main')
                                : t('备用', 'Reserve')}
                            </p>
                          ))
                        ) : (
                          <p>{t('本次暂未匹配 · 无需定金')}</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="signup-card">
                    <h2>
                      {mine.participation === 'openjam'
                        ? 'Open Jam'
                        : t('来当观众', 'Come to listen')}
                    </h2>
                    <p>
                      {t(
                        '不用支付排练定金。',
                        'No rehearsal deposit is needed.',
                      )}
                    </p>
                    {mine.selections.length > 0 && (
                      <p>
                        {t('我想听：', 'My votes: ')}
                        {mine.selections.map(choiceTitle).join(' / ')}
                      </p>
                    )}
                  </div>
                )}
                <div className="signup-card">
                  <h2>
                    {config.selectedDate
                      ? t('活动时间', 'Session time')
                      : t('我能来的时间', 'My availability')}
                  </h2>
                  {(config.selectedDate
                    ? [config.selectedDate]
                    : mine.availability
                  ).map((id) => (
                    <p key={id}>
                      {t(config.dates.find((d) => d.id === id)?.label || id)}
                    </p>
                  ))}
                  <p className="muted">{t(config.location)}</p>
                </div>
                {mine.participation === 'performer' &&
                  needsDeposit(mine) &&
                  config.phase !== 'closed' &&
                  config.matchingPublishedAt && (
                    <details
                      className="signup-details"
                      open={['invited', 'rejected'].includes(mine.status)}
                    >
                      <summary>
                        {t('定金与付款状态', 'Deposit & payment status')} · S$
                        {config.deposit}
                      </summary>
                      <p>{t(statusText[mine.status] || '意向已记录')}</p>
                      {mine.review_note && (
                        <p className="notice">{mine.review_note}</p>
                      )}
                      {['locking', 'payment'].includes(config.phase) &&
                        !expired(config.paymentDeadline) &&
                        ['invited', 'rejected'].includes(mine.status) && (
                          <>
                            <p>{config.paymentInfo}</p>
                            <p className="muted">{config.refundInfo}</p>
                            <p>
                              {t('付款截止：', 'Pay by: ')}
                              {config.paymentDeadline.replace('T', ' ')} SGT
                            </p>
                            {config.paynowQR && (
                              <div>
                                <p>PayNow</p>
                                <img
                                  className="qr"
                                  src={fileUrl(config.paynowQR)}
                                  alt="PayNow QR"
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
                            <label htmlFor="payment-method">
                              {t('付款方式', 'Payment method')}
                            </label>
                            <select
                              id="payment-method"
                              value={method}
                              onChange={(e) => setMethod(e.target.value)}
                            >
                              <option
                                value="paynow"
                                disabled={!config.paynowQR}
                              >
                                PayNow
                              </option>
                              <option
                                value="wechat"
                                disabled={!config.wechatQR}
                              >
                                {t('微信支付')}
                              </option>
                            </select>
                            <label htmlFor="receipt">
                              {t('上传付款截图', 'Upload payment receipt')}
                            </label>
                            <input
                              id="receipt"
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) =>
                                setReceipt(e.target.files?.[0] || null)
                              }
                            />
                            <button
                              disabled={busy || !receipt}
                              onClick={() =>
                                run(async () => {
                                  if (!receipt) return;
                                  const body = new FormData();
                                  body.set('file', receipt);
                                  body.set('method', method);
                                  body.set('sessionId', sessionId);
                                  const response = await fetch('/api/upload', {
                                    method: 'POST',
                                    body,
                                  });
                                  const result = (await response.json()) as {
                                    error?: string;
                                  };
                                  if (!response.ok)
                                    throw new Error(result.error);
                                  setReceipt(null);
                                  await refresh();
                                })
                              }
                            >
                              {t('提交截图，等待确认')}
                            </button>
                          </>
                        )}
                      {mine.receipt && (
                        <a
                          href={fileUrl(mine.receipt)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('查看我提交的截图')}
                        </a>
                      )}
                    </details>
                  )}
                {closed && data.lineup.length > 0 && (
                  <details className="signup-details">
                    <summary>
                      {t('排练确认名单', 'Confirmed rehearsal lineup')}
                    </summary>
                    <Lineup songs={data.lineup} />
                  </details>
                )}
                <p className="muted">
                  {t(
                    '后续安排请登录查看，或留意主理人的联系。',
                    'Sign in for updates, or look out for a message from the host.',
                  )}
                </p>
                <div className="signup-result-actions">
                  <button
                    className="subtle"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await refresh();
                      })
                    }
                  >
                    {t('刷新状态', 'Refresh status')}
                  </button>
                  <button
                    className="subtle"
                    disabled={busy}
                    onClick={() => run(logout)}
                  >
                    {t('退出登录', 'Sign out')}
                  </button>
                </div>
              </>
            )}
          </section>
          <nav
            className="signup-bottom"
            aria-label={t('步骤操作', 'Step navigation')}
          >
            {step !== 'account' && (
              <button className="subtle" onClick={back} disabled={busy}>
                <ArrowLeft size={18} />
                {step === 'result'
                  ? t('所有活动', 'All sessions')
                  : t('上一步', 'Back')}
              </button>
            )}
            {step === 'account' ? (
              mine ? (
                <button onClick={() => go(submitted ? 'result' : 'guide')}>
                  {t('继续', 'Continue')}
                  <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  type="submit"
                  form="registration-account"
                  disabled={busy || (mode === 'register' && !consent)}
                >
                  {busy
                    ? t('请稍候…', 'Please wait…')
                    : mode === 'register'
                      ? t('注册并继续', 'Register & continue')
                      : t('登录', 'Sign in')}
                  <ArrowRight size={18} />
                </button>
              )
            ) : step === 'guide' ? (
              <button onClick={() => go('participation')}>
                {t('了解了，继续', 'Got it, continue')}
                <ArrowRight size={18} />
              </button>
            ) : step === 'participation' ? (
              <button
                disabled={performing ? !open : !(open || closed)}
                onClick={() => go(performing ? 'songs' : 'time')}
              >
                {t('继续', 'Continue')}
                <ArrowRight size={18} />
              </button>
            ) : step === 'songs' ? (
              <button
                onClick={() =>
                  run(async () => {
                    validateSongs();
                    go('time');
                  })
                }
              >
                {t('选好了，选时间', 'Next: availability')}
                <ArrowRight size={18} />
              </button>
            ) : step === 'time' ? (
              <button
                disabled={busy || !availability.length}
                onClick={() => run(submit)}
              >
                {busy
                  ? t('提交中…', 'Submitting…')
                  : t('提交意向', 'Submit registration')}
                <Check size={18} />
              </button>
            ) : canEdit ? (
              <button
                onClick={() => {
                  fill(mine!);
                  go('participation');
                }}
              >
                {t('修改意向', 'Edit preferences')}
              </button>
            ) : (
              <a href="/" className="signup-done">
                {t('完成', 'Done')}
                <Check size={18} />
              </a>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
