import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticClient } from '../src/lib/mcp/client';
import { DiagnosticSession } from '../src/lib/diagnostics/session';
import { DemoDevice } from '../src/lib/diagnostics/demo';
import { analyzeGemini } from '../src/lib/ai/gemini';
import { POST } from '../src/app/api/gemini/route';

test('Gemini calls simulated diagnostic MCP and preserves signed function calls and IDs', async () => {
  const embedded = await createDiagnosticClient(new DiagnosticSession(new DemoDevice(), 'simulated', 'DEMO'));
  const original = globalThis.fetch; let count = 0;
  globalThis.fetch = async (_url, options) => {
    count++; const body = JSON.parse(String(options?.body));
    assert.equal(body.toolConfig.functionCallingConfig.mode, count === 1 ? 'ANY' : 'AUTO');
    if (count === 1) {
      assert.equal(body.tools[0].functionDeclarations.length, 9);
      return Response.json({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'id1', name: 'get_trouble_codes', args: {} }, thoughtSignature: 'signature' }] } }] });
    }
    assert.equal(body.contents[1].parts[0].thoughtSignature, 'signature');
    assert.equal(body.contents[2].parts[0].functionResponse.id, 'id1');
    assert.match(JSON.stringify(body.contents[2]), /simulated/);
    assert.match(JSON.stringify(body.contents[2]), /P0133/);
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'این داده نمایشی است.' }] } }] });
  };
  try { assert.equal(await analyzeGemini(embedded.client, 'dummy', 'gemini-2.5-flash', 'تحلیل کن'), 'این داده نمایشی است.'); assert.equal(count, 2); }
  finally { globalThis.fetch = original; await embedded.close(); }
});

test('Gemini failure is surfaced without generating an answer', async () => {
  const embedded = await createDiagnosticClient(new DiagnosticSession(new DemoDevice(), 'simulated', 'DEMO'));
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'quota' }, { status: 429 });
  try { await assert.rejects(analyzeGemini(embedded.client, 'dummy', 'gemini-2.5-flash', 'تحلیل کن'), /quota/); }
  finally { globalThis.fetch = original; await embedded.close(); }
});

test('Gemini proxy restricts origin and model and sends the key only as a header', async () => {
  const original = globalThis.fetch; let called = false;
  globalThis.fetch = async (url, options) => {
    called = true; assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal((options?.headers as Record<string,string>)['x-goog-api-key'], 'dummy');
    assert.doesNotMatch(String(options?.body), /dummy/);
    return Response.json({ candidates: [] });
  };
  const body = { model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{text:'test'}] }], tools: [], systemInstruction: {parts:[{text:'test'}]}, toolConfig: {functionCallingConfig:{mode:'ANY'}} };
  const req = (origin: string, value: unknown) => new Request('https://app.example/api/gemini', {method:'POST', headers: {host:'app.example',origin,authorization:'Bearer dummy','content-type':'application/json'}, body: JSON.stringify(value)});
  try {
    assert.equal((await POST(req('https://evil.example', body))).status, 403); assert.equal(called, false);
    assert.equal((await POST(req('https://app.example', {...body,model:'../../evil'}))).status, 400); assert.equal(called, false);
    assert.equal((await POST(req('https://app.example', body))).status, 200); assert.equal(called, true);
  } finally { globalThis.fetch = original; }
});

test('proxy handles invalid upstream JSON without leaking response content', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('sensitive upstream body', { status: 200 });
  const body = { model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{text:'test'}] }], tools: [], systemInstruction: {parts:[{text:'test'}]}, toolConfig: {functionCallingConfig:{mode:'ANY'}} };
  try {
    const response = await POST(new Request('https://app.example/api/gemini', {method:'POST', headers: {host:'app.example',origin:'https://app.example',authorization:'Bearer dummy','content-type':'application/json'}, body:JSON.stringify(body)}));
    assert.equal(response.status, 502); assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive/);
  } finally { globalThis.fetch=original; }
});

test('client reports HTTP status when the deployment returns non-JSON', async () => {
  const embedded = await createDiagnosticClient(new DiagnosticSession(new DemoDevice(), 'simulated', 'DEMO'));
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('server failed', { status: 500 });
  try { await assert.rejects(analyzeGemini(embedded.client, 'dummy', 'gemini-2.5-flash', 'test'), /HTTP 500/); }
  finally { globalThis.fetch=original; await embedded.close(); }
});
