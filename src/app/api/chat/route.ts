import { z } from 'zod';
export const runtime = 'edge';
const input = z.object({ model: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/), messages: z.array(z.unknown()).min(1).max(50), tools: z.array(z.unknown()).max(12), tool_choice: z.enum(['auto','required']) }).strict();
export async function POST(req: Request) {
  // Browser-only same-origin endpoint. No provider URL supplied by the caller.
  const origin = req.headers.get('origin');
  try {
    const parsed = new URL(origin || '');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto');
    if (!host || parsed.host !== host || !['http:', 'https:'].includes(parsed.protocol) || (proto && parsed.protocol !== `${proto}:`)) throw new Error('origin');
  } catch { return Response.json({ error: 'Invalid origin' }, { status: 403 }); }
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]{1,500}$/.test(auth)) return Response.json({ error: 'Provider key required' }, { status: 400 });
  const text = await req.text();
  if (text.length > 100000) return Response.json({ error: 'Request too large' }, { status: 413 });
  let body: z.infer<typeof input>;
  try { body = input.parse(JSON.parse(text)); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (!upstream.ok) return Response.json({ error: `OpenAI request failed (${upstream.status}). Check your key, model and quota.` }, { status: upstream.status });
    return new Response(upstream.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch { return Response.json({ error: 'Provider is unreachable' }, { status: 502 }); }
}
