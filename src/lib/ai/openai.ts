import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { toolNames } from '../diagnostics/tools';

type Message = { role: string; content: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]; tool_call_id?: string };
export async function analyze(client: Client, key: string, model: string, question: string, provider: 'openai' | 'nvidia' = 'openai'): Promise<string> {
  const available = await client.listTools();
  const tools = available.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  const messages: Message[] = [
    { role: 'system', content: 'You are a cautious Persian automotive assistant. You MUST call diagnostic tools before answering. Never invent readings or successful calls. Identify simulated data clearly, explain possible causes as hypotheses, never offer a definitive component diagnosis, and recommend safe checks. No dangerous or write commands.' },
    { role: 'user', content: question },
  ];
  let usedTool = false;
  for (let turn = 0; turn < 5; turn++) {
    const response = await fetch(provider === 'nvidia' ? '/api/nvidia' : '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages, tools, tool_choice: usedTool ? 'auto' : 'required' }) });
    let json: any;
    try { json = await response.json(); } catch { throw new Error(`پاسخ سرور قابل خواندن نیست (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Provider request failed');
    const message = json?.choices?.[0]?.message as Message | undefined;
    if (!message || message.role !== 'assistant') throw new Error('Invalid provider response');
    if (!message.tool_calls?.length) {
      if (!usedTool || !message.content) throw new Error('Provider did not return a tool-grounded answer');
      return message.content;
    }
    if (message.tool_calls.length > 8) throw new Error('Too many tool calls');
    messages.push(message);
    for (const call of message.tool_calls) {
      let result: unknown;
      try {
        if (!toolNames.includes(call.function.name as typeof toolNames[number])) throw new Error('Tool not allowed');
        const args = JSON.parse(call.function.arguments);
        result = await client.callTool({ name: call.function.name, arguments: args });
      } catch (e) { result = { isError: true, error: e instanceof Error ? e.message : 'Tool failed' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      usedTool = true;
    }
  }
  throw new Error('Provider exceeded the tool-call limit');
}
