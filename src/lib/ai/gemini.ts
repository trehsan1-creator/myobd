import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { toolNames } from '../diagnostics/tools';
import { reportInstruction, type OnAnalysisStage } from './presentation';

type Part = { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { id?: string; name: string; args?: Record<string, unknown> } };
type Content = { role: 'user' | 'model'; parts: unknown[] };

/** Gemini GenerateContent REST function-calling, with a browser-local MCP client. */
export async function analyzeGemini(client: Client, key: string, model: string, question: string, onStage?: OnAnalysisStage): Promise<string> {
  onStage?.('preparing');
  const available = await client.listTools();
  const declarations = available.tools.map(t => {
    // The diagnostic surface has only these small, fixed input shapes. Validation
    // remains authoritative in MCP, not in the model's schema.
    const parameters = t.name === 'get_live_data' || t.name === 'get_freeze_frame'
      ? { type: 'OBJECT', properties: { pid: { type: 'STRING', enum: ['04','05','0C','0D','11'], description: 'Standard PID as two hexadecimal characters.' } }, required: ['pid'] }
      : t.name === 'explain_dtc'
        ? { type: 'OBJECT', properties: { code: { type: 'STRING', description: 'Standard DTC such as P0133.' } }, required: ['code'] }
        : undefined;
    return { name: t.name, description: t.description || `Read-only tool ${t.name}`, ...(parameters ? { parameters } : {}) };
  });
  const contents: Content[] = [{ role: 'user', parts: [{ text: question }] }];
  let usedTool = false;
  for (let turn = 0; turn < 5; turn++) {
    onStage?.(usedTool ? 'summarizing' : 'requesting');
    const response = await fetch('/api/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, contents, tools: [{ functionDeclarations: declarations }],
        systemInstruction: { parts: [{ text: 'You are a careful Persian automotive diagnostic assistant. Call diagnostic tools before answering. Never invent data or tool success. Clearly label simulated data. Describe possible causes as hypotheses, not definitive diagnoses. Never request unsafe or write operations. If tools fail, state that data is unavailable. ' + reportInstruction }] },
        toolConfig: { functionCallingConfig: { mode: usedTool ? 'AUTO' : 'ANY' } },
      }),
    });
    let json: any;
    try { json = await response.json(); } catch { throw new Error(`سرور پاسخ قابل خواندن نداد (HTTP ${response.status}). صفحه را تازه‌سازی و دوباره تلاش کنید؛ اگر ادامه داشت، کد خطا را ارسال کنید.`); }
    if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'درخواست Gemini ناموفق بود.');
    const content = json?.candidates?.[0]?.content;
    if (!content || content.role !== 'model' || !Array.isArray(content.parts)) throw new Error('Gemini پاسخی قابل استفاده برنگرداند؛ تنظیمات ایمنی و مدل را بررسی کنید.');
    const parts = content.parts as Part[];
    const calls = parts.filter(p => p.functionCall);
    if (!calls.length) {
      const text = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n').trim();
      if (!usedTool || !text) throw new Error('پاسخ بر اساس ابزار عیب‌یابی دریافت نشد.');
      return text;
    }
    if (calls.length > 8) throw new Error('تعداد درخواست ابزار بیش از حد مجاز است.');
    // Preserve all model parts and thought signatures exactly; Gemini requires
    // these on subsequent turns, particularly with thinking models.
    onStage?.('reading');
    contents.push(content);
    const results: unknown[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      let result: unknown;
      try {
        if (typeof call.name !== 'string' || !toolNames.includes(call.name as typeof toolNames[number])) throw new Error('ابزار مجاز نیست.');
        if (call.args !== undefined && (typeof call.args !== 'object' || Array.isArray(call.args) || call.args === null)) throw new Error('ورودی ابزار نامعتبر است.');
        result = await client.callTool({ name: call.name, arguments: call.args || {} });
      } catch (e) { result = { isError: true, error: e instanceof Error ? e.message : 'خطای ابزار' }; }
      results.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { result } } });
      usedTool = true;
    }
    contents.push({ role: 'user', parts: results });
  }
  throw new Error('تعداد مراحل فراخوانی ابزار بیش از حد مجاز است.');
}
