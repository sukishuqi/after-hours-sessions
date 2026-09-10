'use client';

import { useEffect, useState } from 'react';
import { LanguageSwitch, useLocale } from '@/lib/locale';
import { SessionProgress } from '@/components/session-progress';
import { Checkbox } from '@/components/ui/checkbox';
import type { SessionSummary } from '@/lib/shared';

export default function AdminHome() {
  const { t } = useLocale();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('地点待定');
  const [deposit, setDeposit] = useState('10');
  const [dates, setDates] = useState(['']);
  const [usePublicLibrary, setUsePublicLibrary] = useState(true);
  const [audienceVoteSeed, setAudienceVoteSeed] = useState('3');
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/admin?view=sessions');
    if (!response.ok) {
      setSignedIn(false);
      return;
    }
    const data: any = await response.json();
    setSessions(data.sessions || []);
    setSignedIn(true);
  }
  useEffect(() => {
    load().catch(() => setSignedIn(false));
  }, []);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('操作失败'));
    } finally {
      setBusy(false);
    }
  }
  async function post(body: object) {
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  return (
    <main className="workspace">
      <header>
        <div className="brand-nav">
          <a href="/" aria-label="After Hours">
            <img src="/logo.svg" alt="After Hours" />
          </a>
          <a href="/" className="back-link">
            {t('← 报名网站', '← Public sessions')}
          </a>
        </div>
        <LanguageSwitch />
      </header>
      <section className="intro">
        <p className="eyebrow">AFTER HOURS / BACKSTAGE</p>
        <h1>
          {t('主理人', 'Host')} <span>{t('Sessions.', 'sessions.')}</span>
        </h1>
      </section>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {signedIn === null ? (
        <p>{t('加载中…', 'Loading…')}</p>
      ) : !signedIn ? (
        <section className="panel" style={{ maxWidth: 520 }}>
          <h2>{t('主理人登录', 'Host sign-in')}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const response = await fetch('/api/access', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'admin', token: key }),
                });
                const data: any = await response.json();
                if (!response.ok) throw new Error(data.error);
                setKey('');
                await load();
              });
            }}
          >
            <label htmlFor="admin-key">
              {t('管理口令', 'Host passphrase')}
            </label>
            <input
              id="admin-key"
              type="password"
              required
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
            <button disabled={busy} style={{ marginTop: 16 }}>
              {t('进入管理', 'Sign in')}
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 24 }}>
            <button onClick={() => setShowNew((value) => !value)}>
              {showNew
                ? t('收起', 'Close')
                : t('+ 新建 Session', '+ New session')}
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
                  setSignedIn(false);
                })
              }
            >
              {t('退出', 'Sign out')}
            </button>
          </div>
          {showNew && (
            <section className="panel host-create-panel">
              <h2>{t('新建活动', 'New session')}</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    const data = await post({
                      action: 'create-session',
                      title,
                      location,
                      deposit,
                      dates: dates.filter(Boolean),
                      usePublicLibrary,
                      audienceVoteSeed,
                    });
                    window.location.href = '/admin/' + data.sessionId;
                  });
                }}
              >
                <div className="grid2">
                  <div>
                    <label htmlFor="new-title">
                      {t('活动名称 *', 'Session name *')}
                    </label>
                    <input
                      id="new-title"
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Session 002"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-location">
                      {t('地点', 'Location')}
                    </label>
                    <input
                      id="new-location"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                    />
                  </div>
                </div>
                <label>{t('候选时间 *', 'Candidate dates *')}</label>
                {dates.map((date, index) => (
                  <div className="row" key={index}>
                    <input
                      type="datetime-local"
                      required={index === 0}
                      value={date}
                      onChange={(event) =>
                        setDates((current) =>
                          current.map((value, item) =>
                            item === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                    {dates.length > 1 && (
                      <button
                        type="button"
                        className="subtle"
                        onClick={() =>
                          setDates((current) =>
                            current.filter((_, item) => item !== index),
                          )
                        }
                      >
                        {t('移除', 'Remove')}
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="subtle"
                  onClick={() => setDates((current) => [...current, ''])}
                >
                  {t('+ 增加候选时间', '+ Add candidate date')}
                </button>
                <label htmlFor="new-deposit">
                  {t('乐手／歌手定金（S$）', 'Musician deposit (S$)')}
                </label>
                <input
                  id="new-deposit"
                  inputMode="decimal"
                  value={deposit}
                  onChange={(event) => setDeposit(event.target.value)}
                />
                <label className="check option">
                  <Checkbox
                    checked={usePublicLibrary}
                    onCheckedChange={(checked) =>
                      setUsePublicLibrary(!!checked)
                    }
                  />
                  {t(
                    '沿用公共歌曲库，把之前积累的歌曲加入本场候选池',
                    'Use the shared library and add previously collected songs',
                  )}
                </label>
                {usePublicLibrary && (
                  <>
                    <label htmlFor="new-audience-vote-seed">
                      {t(
                        '公共歌曲初始想听数（至少 3）',
                        'Starting listener votes per song (minimum 3)',
                      )}
                    </label>
                    <input
                      id="new-audience-vote-seed"
                      type="number"
                      min="3"
                      step="1"
                      value={audienceVoteSeed}
                      onChange={(event) =>
                        setAudienceVoteSeed(event.target.value)
                      }
                    />
                  </>
                )}
                <button disabled={busy} style={{ marginTop: 18 }}>
                  {t('创建并进入管理', 'Create and manage')}
                </button>
              </form>
            </section>
          )}
          <section className="host-session-grid">
            {sessions.map((session) => (
              <article className="panel host-session-card" key={session.id}>
                <p className="eyebrow">{session.slug.toUpperCase()}</p>
                <h2>{session.config.title}</h2>
                <p>{t(session.config.location)}</p>
                <p className="muted">
                  {session.total} {t('人已提交意向', 'registrations')}
                </p>
                <SessionProgress phase={session.config.phase} />
                <div className="row">
                  <a className="session-cta" href={'/admin/' + session.slug}>
                    {t('管理活动', 'Manage')} <span>↗</span>
                  </a>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
