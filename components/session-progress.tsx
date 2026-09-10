'use client';
import { Progress } from '@/components/ui/progress';
import { useLocale } from '@/lib/locale';
import { type Settings } from '@/lib/shared';
export function SessionProgress({ phase }: { phase: Settings['phase'] }) {
  const { t } = useLocale();
  const current =
    phase === 'closed'
      ? 3
      : phase === 'locking'
        ? 2
        : phase === 'payment' || phase === 'curating'
          ? 1
          : 0;
  const steps = [
    t('开放收集意向', 'Open for song ideas'),
    t('报名中', 'Registration open'),
    t('待锁定', 'Awaiting confirmation'),
    t('排练名额已锁定', 'Rehearsal places locked'),
  ];
  return (
    <div className="session-progress">
      <Progress
        value={(current + 1) * 25}
        aria-label={t('活动进度', 'Session progress')}
      />
      <ol>
        {steps.map((s, i) => (
          <li
            key={i}
            className={i <= current ? 'active' : ''}
            aria-current={i === current ? 'step' : undefined}
          >
            <span>0{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {phase === 'curating' && (
        <p className="muted">
          {t(
            '意向收集已截止，主理人正在确认最终歌单。',
            'Song ideas are closed. The host is confirming the final setlist.',
          )}
        </p>
      )}
    </div>
  );
}
