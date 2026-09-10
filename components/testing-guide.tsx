'use client';
import { useLocale } from '@/lib/locale';
export function TestingGuide() {
  const { t } = useLocale();
  return (
    <details className="panel">
      <summary>{t('三步测试', 'Three-step test')}</summary>
      <ol style={{ paddingLeft: 22 }}>
        <li>
          {t(
            '乐手：提交意向，标明第一、第二优先和每首的位置。一个人也能测试，其他位置可由 House musician 补位。',
            'Musician: submit song wishes, first/second preferences and roles. A one-person test works; house musicians can cover the other roles.',
          )}
        </li>
        <li>
          {t(
            '主理人：切换到整理歌单，保存最终时间与收款设置、上传收款码；勾选正式／备用歌曲，点保存全部歌单。确认后切换到待锁定并保存，不必等阵容齐全。',
            'Host: choose Curate setlist, save the date and payment settings, and upload a payment QR. Check main/reserve songs and click Save entire setlist. Then publish at Awaiting confirmation; a complete band is not required.',
          )}
        </li>
        <li>
          {t(
            '乐手：刷新或用联系方式和密码登录，查看位置。正式成员上传 TEST 截图；仅备用成员无需付款。主理人核对截图后锁定，最后结束报名。',
            'Musician: refresh or sign in with contact and password to view slots. Main-set musicians upload a TEST receipt; reserve-only musicians do not pay. The host verifies the receipt, confirms the place, then closes registration.',
          )}
        </li>
      </ol>
      <p className="muted">
        {t(
          '测试不用真实转账。这里不是沙盒，测试记录会保留；公布后不会自动重排，以保护现有席位与付款。真实报名请核实到账后再锁定。',
          'No real transfer is needed for testing. This is not a sandbox: test records remain. Published slots do not automatically reshuffle. Verify actual payments before confirming real places.',
        )}
      </p>
    </details>
  );
}
