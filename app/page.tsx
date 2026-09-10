'use client';
import { useEffect, useState } from 'react';
import { LanguageSwitch, useLocale } from '@/lib/locale';
import type { SessionSummary } from '@/lib/shared';
import { SessionProgress } from '@/components/session-progress';
export default function SessionList() {
  const { t } = useLocale();
  const [sessions, setSessions] = useState<SessionSummary[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/sessions')
      .then(async (r) => {
        const d: any = await r.json();
        if (!r.ok) throw new Error(d.error);
        setSessions(d.sessions || []);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="workspace">
      <header>
        <a href="/" aria-label="After Hours">
          <img src="/logo.svg" alt="After Hours" />
        </a>
        <div className="row">
          <LanguageSwitch />
          <a href="/admin">{t('主理人管理 ↗')}</a>
        </div>
      </header>
      <section className="intro list-intro">
        <p className="eyebrow">AFTER HOURS / SINGAPORE</p>
        <h1>
          Open <span>sessions.</span>
        </h1>
        <p>{t('查看最近 Session 列表', 'View recent sessions.')}</p>
      </section>
      {error && (
        <p role="alert" className="error">
          {t(error)}
        </p>
      )}
      {sessions.map((session, index) => (
        <article className="session-list-card" key={session.id}>
          <a href={'/sessions/' + session.slug} className="poster-link">
            <img
              src={
                session.config.poster
                  ? '/api/file?session=' +
                    encodeURIComponent(session.slug) +
                    '&key=' +
                    encodeURIComponent(session.config.poster)
                  : '/session-poster.svg'
              }
              alt={t(
                session.config.title + ' 活动海报',
                session.config.title + ' poster',
              )}
            />
          </a>
          <div className="session-list-copy">
            <p className="eyebrow">
              {String(index + 1).padStart(2, '0')} / LIVE SESSION
            </p>
            <h2>{session.config.title}</h2>
            <p className="session-date">
              {session.config.selectedDate
                ? t(
                    session.config.dates.find(
                      (d) => d.id === session.config.selectedDate,
                    )?.label || '',
                  )
                : session.config.dates.map((date) => t(date.label)).join(' / ')}
            </p>
            <p>{t(session.config.location)}</p>
            <p className="muted">
              {t(
                'Guided Band Session · 乐手／歌手定金 S$',
                'Guided Band Session · Musician/vocalist deposit S$',
              )}
              {session.config.deposit}
              {t(' / 人', ' / person')}
              <br />
              {t(
                'Open Jam 参与者／观众无需定金',
                'No deposit for Open Jam participants or audience',
              )}
            </p>
            <p className="muted session-recording-note">
              {t(
                'Guided Band Session 全程提供影音记录',
                'Guided Band Sessions include full photo and video coverage',
              )}
            </p>
            <SessionProgress phase={session.config.phase} />
            <p className="muted">
              {session.total} {t('人已提交意向')}
            </p>
            <a className="session-cta" href={'/sessions/' + session.slug}>
              {t('查看详情与报名', 'View session & join')} <span>↗</span>
            </a>
          </div>
        </article>
      ))}
      <footer className="site-footer">
        <div className="footer-brand">
          <span>Music lives later.</span>
          <span>After Hours · Music Collective</span>
        </div>
        <nav
          className="social-links"
          aria-label={t('关注 After Hours', 'Follow After Hours')}
        >
          <a
            href="https://www.instagram.com/afterhoursmusiccollective?stkn=MTZyeDZvaXpoOHdiaQ=="
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t(
              '打开 After Hours Instagram 主页',
              'Open After Hours on Instagram',
            )}
            title="Instagram"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle
                cx="17.4"
                cy="6.7"
                r="1"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </a>
          <a
            href="https://xhslink.cn/o/4babZL5Oy5u"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t(
              '打开 After Hours 小红书主页',
              'Open After Hours on Xiaohongshu',
            )}
            title={t('小红书', 'Xiaohongshu')}
          >
            <span className="xhs-mark" aria-hidden="true">
              小红书
            </span>
          </a>
        </nav>
      </footer>
    </main>
  );
}
