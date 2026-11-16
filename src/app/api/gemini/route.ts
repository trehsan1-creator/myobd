import { z } from 'zod';
export const runtime = 'edge';
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
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': auth.slice(7), 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
    });
    if (!upstream.ok) return Response.json({ error: `درخواست Gemini ناموفق بود (${upstream.status}). کلید، مدل، سهمیه و دسترسی منطقه‌ای را بررسی کنید.` }, { status: upstream.status });
    return new Response(upstream.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch { return Response.json({ error: 'ارتباط با Gemini برقرار نشد.' }, { status: 502 }); }
}
