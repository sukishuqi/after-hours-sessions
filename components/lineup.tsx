'use client';
import { useLocale } from '@/lib/locale';
import type { MatchedSong } from '@/lib/matching';
export type VisibleLineup = Omit<MatchedSong, 'members'> & {
  members: Omit<MatchedSong['members'][number], 'personId'>[];
};
export function Lineup({
  songs,
  preview = false,
  className = '',
}: {
  songs: VisibleLineup[];
  preview?: boolean;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <section className={'panel ' + className}>
      <h2>
        {preview
          ? t('匹配预览', 'Matching preview')
          : t('排练确认名单', 'Confirmed rehearsal lineup')}
      </h2>
      <p className="muted">
        {preview
          ? t(
              '依据已保存的歌单、最终时间和意向自动匹配，优先第一、第二意向。主理人确认即可发布和收定金，缺位交由 House musician 补位，不必等阵容齐全。',
              'Matching uses the saved setlist, date and preferences. The host can publish and open deposits even with missing roles; house musicians can fill the gaps.',
            )
          : t(
              '正式成员每人支付一次定金；只参加备用歌曲无需付款，是否演出视现场情况。',
              'Main-set musicians pay one deposit per person. Reserve-only musicians pay no deposit; reserve songs depend on the situation on the day.',
            )}
      </p>
      {!songs.length && (
        <p className="muted">
          {t(
            '保存最终时间并选择歌曲后，这里会显示匹配。',
            'Save the final date and select songs to see the matching preview.',
          )}
        </p>
      )}
      {songs.map((s) => (
        <div className="song" key={s.songId}>
          <h3>
            {s.title}{' '}
            <span className="badge">
              {s.kind === 'reserve'
                ? t('备用 · 不收定金', 'Reserve · No deposit')
                : t('正式', 'Main set')}
            </span>
          </h3>
          {s.members.map((m, i) => (
            <p key={i}>
              {t(m.role)} · {m.name}
              {preview && (
                <span className="muted">
                  {' '}
                  ·{' '}
                  {m.priority === 1
                    ? t('第一优先', 'First preference')
                    : m.priority === 2
                      ? t('第二优先', 'Second preference')
                      : t('其他意向', 'Other wish')}
                </span>
              )}
            </p>
          ))}
          {!s.ready && (
            <p className="muted">
              {t(
                'House musician 补位（待安排）：',
                'House musician coverage (to arrange): ',
              )}
              {s.missing.map((r) => t(r)).join(' / ')}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
