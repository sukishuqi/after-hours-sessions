import { settings, isAdmin, me, runtime, cleanSessionId } from '@/lib/server';
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const sessionId = cleanSessionId(url.searchParams.get('session'));
  if (!key) return new Response('Not found', { status: 404 });
  const cfg = await settings(sessionId);
  const publicQR = [cfg.paynowQR, cfg.wechatQR, cfg.poster].includes(key);
  if (!publicQR && !(await isAdmin())) {
    const p = await me(sessionId);
    if (!p || p.receipt !== key)
      return new Response('Forbidden', { status: 403 });
  }
  const file = await runtime.FILES.get(key);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(file.body, {
    headers: {
      'Content-Type':
        file.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
