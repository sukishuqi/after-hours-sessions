import { allSessions, json } from '@/lib/server';

export async function GET() {
  try {
    return json({ sessions: await allSessions() });
  } catch {
    return json({ error: '暂时无法加载活动，请稍后重试。' }, 503);
  }
}
