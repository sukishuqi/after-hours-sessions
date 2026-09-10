'use client';
import { useId } from 'react';
import { useLocale } from '@/lib/locale';
import { matchSong, type SongDraft } from '@/lib/catalog';
export function SongFields({
  value,
  onChange,
  existing = [],
}: {
  value: SongDraft;
  onChange: (v: SongDraft) => void;
  existing?: Partial<SongDraft>[];
}) {
  const { t } = useLocale(),
    id = useId();
  const field = (k: keyof SongDraft, v: string) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="song-fields">
      <div className="grid2">
        <div>
          <label htmlFor={id + 'title'}>{t('歌名')}</label>
          <input
            id={id + 'title'}
            value={value.title}
            maxLength={100}
            onChange={(e) => {
              const title = e.target.value;
              const found = matchSong(title, existing);
              onChange({
                ...value,
                title,
                artist: found?.artist || value.artist,
                version_url: found?.version_url || value.version_url,
              });
            }}
          />
        </div>
        <div>
          <label htmlFor={id + 'artist'}>
            {t('乐队 / 艺人', 'Band / artist')}
          </label>
          <input
            id={id + 'artist'}
            value={value.artist}
            maxLength={100}
            onChange={(e) => field('artist', e.target.value)}
          />
        </div>
      </div>
      <p className="muted">
        {t(
          '已知歌名会自动带出艺人和参考版本，可自行修改。未匹配的歌曲请手动填写艺人。',
          'Known titles fill in the artist and reference version automatically. You can edit them; enter the artist manually for other songs.',
        )}
      </p>
      <RehearsalFields
        value={value}
        onChange={(v) => onChange({ ...value, ...v })}
      />
    </div>
  );
}
export function RehearsalFields({
  value,
  onChange,
}: {
  value: Pick<SongDraft, 'preferred_key' | 'version_url' | 'nomination_note'>;
  onChange: (
    v: Pick<SongDraft, 'preferred_key' | 'version_url' | 'nomination_note'>,
  ) => void;
}) {
  const { t } = useLocale(),
    id = useId();
  return (
    <>
      <div className="grid2">
        <div>
          <label htmlFor={id + 'key'}>
            {t('想用的 Key（选填）', 'Preferred key (optional)')}
          </label>
          <input
            id={id + 'key'}
            value={value.preferred_key}
            maxLength={40}
            placeholder={t(
              '例如 Am、降半音；不确定可留空',
              'e.g. Am, down a semitone; leave blank if unsure',
            )}
            onChange={(e) =>
              onChange({ ...value, preferred_key: e.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor={id + 'url'}>
            {t('歌曲版本链接（选填）', 'Version link (optional)')}
          </label>
          <input
            id={id + 'url'}
            type="url"
            value={value.version_url}
            maxLength={2000}
            placeholder="https://…"
            onChange={(e) =>
              onChange({ ...value, version_url: e.target.value })
            }
          />
        </div>
      </div>
      <label htmlFor={id + 'note'}>
        {t('提名备注（选填）', 'Nomination note (optional)')}
      </label>
      <textarea
        id={id + 'note'}
        value={value.nomination_note}
        maxLength={500}
        placeholder={t(
          '想用哪个现场版本、前奏要不要保留、solo 怎么安排…',
          'Live version, intro, solo arrangement…',
        )}
        onChange={(e) =>
          onChange({ ...value, nomination_note: e.target.value })
        }
      />
    </>
  );
}
export function SongReference({ song }: { song: Partial<SongDraft> }) {
  const { t } = useLocale();
  return (
    <>
      <p className="muted">
        Key: {song.preferred_key || t('待确认', 'To be confirmed')}
        {song.version_url && (
          <>
            {' '}
            ·{' '}
            <a
              href={song.version_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('参考版本 ↗', 'Reference version ↗')}
            </a>
          </>
        )}
      </p>
      {song.nomination_note && (
        <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
          {t(song.nomination_note)}
        </p>
      )}
    </>
  );
}
