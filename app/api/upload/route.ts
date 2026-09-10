import {
  db,
  runtime,
  settings,
  me,
  isAdmin,
  checkOrigin,
  json,
  cleanSessionId,
  saveSettings,
} from '@/lib/server';
import { expired, needsDeposit } from '@/lib/shared';
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (Number(req.headers.get('content-length')) > 6 * 1024 * 1024)
      throw new Error('文件不能超过 5 MB');
    const data = await req.formData();
    const sessionId = cleanSessionId(data.get('sessionId'));
    const file = data.get('file');
    const kind = data.get('kind');
    if (
      !(file instanceof File) ||
      file.size > 5 * 1024 * 1024 ||
      file.size < 12
    )
      throw new Error('请选择 5 MB 以内的 PNG、JPG 或 WebP 图片');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let type = '';
    if (
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71
    )
      type = 'image/png';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      type = 'image/jpeg';
    else if (
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    )
      type = 'image/webp';
    if (!type) throw new Error('仅支持 PNG、JPG、WebP 图片');
    const cfg = await settings(sessionId);
    if (kind === 'paynowQR' || kind === 'wechatQR' || kind === 'poster') {
      if (!(await isAdmin())) return json({ error: '需要主理人登录' }, 403);
      const key =
        (kind === 'poster' ? 'posters/' : 'qr/') + crypto.randomUUID();
      await runtime.FILES.put(key, bytes, {
        httpMetadata: { contentType: type },
      });
      await saveSettings(sessionId, { ...cfg, [kind]: key });
      return json({ ok: true });
    }
    const p = await me(sessionId);
    if (!p) return json({ error: '请先恢复你的报名' }, 401);
    if (p.participation !== 'performer')
      throw new Error('观众与 Open Jam 登记已完成，无需排练定金');
    if (
      !['payment', 'locking'].includes(cfg.phase) ||
      expired(cfg.paymentDeadline)
    )
      throw new Error('当前未开放定金提交或已截止');
    if (cfg.matchingPublishedAt && !needsDeposit(p))
      throw new Error('只有正式曲目成员需要定金，备用成员无需付款');
    if (!['invited', 'rejected'].includes(p.status))
      throw new Error('请等待主理人确认阵容，或查看已提交的付款状态');
    const method = data.get('method');
    if (!['paynow', 'wechat'].includes(String(method)))
      throw new Error('请选择付款方式');
    if (
      (method === 'paynow' && !cfg.paynowQR) ||
      (method === 'wechat' && !cfg.wechatQR)
    )
      throw new Error('该付款方式暂未开放');
    const key = 'receipts/' + p.id + '/' + crypto.randomUUID();
    await runtime.FILES.put(key, bytes, {
      httpMetadata: { contentType: type },
    });
    const r = await db()
      .prepare(
        "UPDATE people SET receipt=?,payment_method=?,status='pending',review_note='' WHERE id=? AND status IN ('invited','rejected')",
      )
      .bind(key, method, p.id)
      .run();
    if (!r.meta.changes) {
      await runtime.FILES.delete(key);
      throw new Error('记录已更新，请刷新');
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '上传失败' }, 400);
  }
}
