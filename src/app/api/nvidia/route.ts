import { z } from 'zod';
export const runtime = 'nodejs';
const input = z.object({
  model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
  messages: z.array(z.unknown()).min(1).max(50),
  tools: z.array(z.unknown()).max(12),
  tool_choice: z.enum(['auto', 'required']),
}).strict();

/** Fixed NVIDIA Build endpoint, no user-supplied host. No secrets are logged. */
export async function POST(req: Request) {
  try {
    const origin = new URL(req.headers.get('origin') || '');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto');
    if (!host || origin.host !== host || !['http:', 'https:'].includes(origin.protocol) || (proto && origin.protocol !== `${proto}:`)) throw new Error();
  } catch { return Response.json({ error: 'درخواست از مبدأ مجاز نیست.' }, { status: 403 }); }
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]{1,500}$/.test(auth)) return Response.json({ error: 'کلید NVIDIA لازم است.' }, { status: 400 });
  if (Number(req.headers.get('content-length') || 0) > 100000) return Response.json({ error: 'درخواست بیش از حد بزرگ است.' }, { status: 413 });
  let body: z.infer<typeof input>;
  try { const text = await req.text(); if (text.length > 100000) return Response.json({ error: 'درخواست بیش از حد بزرگ است.' }, { status: 413 }); body = input.parse(JSON.parse(text)); }
  catch { return Response.json({ error: 'درخواست نامعتبر است؛ نام مدل را به شکل provider/model وارد کنید.' }, { status: 400 }); }
  try {
    const upstream = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, stream: false, max_tokens: 2048 }), cache: 'no-store', signal: AbortSignal.timeout(90000),
    });
    if (!upstream.ok) {
      const hint = upstream.status === 401 || upstream.status === 403 ? 'کلید و دسترسی مدل را بررسی کنید.' : upstream.status === 429 ? 'سهمیه یا محدودیت درخواست را بررسی کنید.' : upstream.status === 404 ? 'نام مدل یا در دسترس بودن endpoint را بررسی کنید.' : upstream.status === 503 ? 'سرویس موقتاً در دسترس نیست؛ بعداً دوباره امتحان کنید.' : 'نام مدل، دسترسی و تنظیمات آن را بررسی کنید.';
      return Response.json({ error: `درخواست NVIDIA ناموفق بود (${upstream.status}). ${hint}` }, { status: upstream.status });
    }
    let value: unknown;
    try { value = JSON.parse(await upstream.text()); }
    catch { return Response.json({ error: 'پاسخ NVIDIA معتبر نیست.' }, { status: 502 }); }
    return Response.json(value, { headers: { 'cache-control': 'no-store' } });
  } catch { return Response.json({ error: 'ارتباط با NVIDIA برقرار نشد یا زمان درخواست تمام شد.' }, { status: 502 }); }
}
