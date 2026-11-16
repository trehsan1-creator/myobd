import { z } from 'zod';
export const runtime = 'nodejs';
const requestSchema = z.object({
  model: z.string().regex(/^gemini-[a-zA-Z0-9._-]{1,72}$/),
  contents: z.array(z.unknown()).min(1).max(50),
  tools: z.array(z.unknown()).max(1),
  systemInstruction: z.object({ parts: z.array(z.object({ text: z.string().max(4000) }).strict()).min(1).max(1) }).strict(),
  toolConfig: z.object({ functionCallingConfig: z.object({ mode: z.enum(['ANY', 'AUTO']) }).strict() }).strict(),
}).strict();
export async function POST(req: Request) {
  try {
    const origin = new URL(req.headers.get('origin') || '');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto');
    if (!host || origin.host !== host || !['http:', 'https:'].includes(origin.protocol) || (proto && origin.protocol !== `${proto}:`)) throw new Error();
  } catch { return Response.json({ error: 'درخواست از مبدأ مجاز نیست.' }, { status: 403 }); }
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]{1,500}$/.test(auth)) return Response.json({ error: 'کلید Gemini لازم است.' }, { status: 400 });
  // Bound the body before parsing; do not log request contents or credentials.
  if (Number(req.headers.get('content-length') || 0) > 100000) return Response.json({ error: 'درخواست بیش از حد بزرگ است.' }, { status: 413 });
  let input: z.infer<typeof requestSchema>;
  try {
    const text = await req.text();
    if (text.length > 100000) return Response.json({ error: 'درخواست بیش از حد بزرگ است.' }, { status: 413 });
    input = requestSchema.parse(JSON.parse(text));
  } catch { return Response.json({ error: 'درخواست نامعتبر است.' }, { status: 400 }); }
  const { model, ...body } = input;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const requestGoogle = () => fetch(url, {
      method: 'POST', headers: { 'x-goog-api-key': auth.slice(7), 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(45000),
    });
    let upstream = await requestGoogle();
    // Only retry an explicit 503 once. No diagnostic tool is re-executed, and
    // quota/auth errors and ambiguous network failures are never retried.
    if (upstream.status === 503) {
      await upstream.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 1200));
      upstream = await requestGoogle();
    }
    if (!upstream.ok) {
      const message = upstream.status === 404
        ? `مدل ${model} پیدا نشد یا برای این کلید در دسترس نیست (404). مدل دیگری را در تنظیمات انتخاب کنید.`
        : upstream.status === 503
        ? 'سرویس Gemini فعلاً در دسترس نیست یا شلوغ است (503). یک بار تلاش مجدد انجام شد؛ چند دقیقه دیگر دوباره امتحان کنید یا مدل دیگری را در تنظیمات انتخاب کنید.'
        : upstream.status === 429
        ? 'محدودیت درخواست یا سهمیه Gemini فعال شده است (429). سهمیه حساب را بررسی کنید و بعداً دوباره امتحان کنید.'
        : `درخواست Gemini ناموفق بود (${upstream.status}). کلید، مدل و دسترسی حساب را بررسی کنید.`;
      return Response.json({ error: message }, { status: upstream.status });
    }
    // Materialize and validate before responding: forwarding an upstream stream can
    // fail after headers have been sent, leaving the browser with invalid JSON.
    const responseText = await upstream.text();
    let result: unknown;
    try { result = JSON.parse(responseText); }
    catch { return Response.json({ error: 'Gemini پاسخ معتبر JSON نداد. لطفاً دوباره تلاش کنید.' }, { status: 502 }); }
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch { return Response.json({ error: 'ارتباط با Gemini برقرار نشد.' }, { status: 502 }); }
}
