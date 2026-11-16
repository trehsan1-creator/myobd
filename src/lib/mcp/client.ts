import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { DiagnosticSession } from '../diagnostics/session';
import { runTool, schemaFor, toolNames } from '../diagnostics/tools';

/** Embedded MCP connection: local in-memory only; it is not an external endpoint. */
export async function createDiagnosticClient(session: DiagnosticSession) {
  const server = new McpServer({ name: 'myobd', version: '0.1.0' });
  for (const name of toolNames) {
    server.registerTool(name, {
      description: `Read-only diagnostic operation ${name}. Results identify source and availability.`,
      inputSchema: schemaFor(name),
      outputSchema: z.object({ sessionId: z.string(), timestamp: z.string(), source: z.enum(['vehicle', 'simulated']), data: z.unknown() }),
      annotations: { readOnlyHint: true },
    }, async (args) => {
      try {
        const value = await runTool(session, name, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value };
      } catch (e) { const value = { sessionId: session.id, timestamp: new Date().toISOString(), source: session.source, data: { state: 'unavailable', error: e instanceof Error ? e.message : 'Diagnostic operation failed' } }; return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }; }
    });
  }
  const client = new Client({ name: 'myobd-browser', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
