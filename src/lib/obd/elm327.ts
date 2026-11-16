import type { Transport } from '../transport/serial';

export type Trace = { direction: 'request' | 'response'; text: string; at: string };
export class ElmError extends Error { constructor(message: string, public kind: 'unsupported' | 'timeout' | 'disconnected' | 'response') { super(message); } }

/** One outstanding command at a time. A timeout invalidates the connection: a late prompt
 * must never be attributed to the next command. */
export class Elm327 {
  private queue: Promise<unknown> = Promise.resolve();
  private buffer = '';
  private closed = false;
  constructor(private transport: Transport, private trace: (entry: Trace) => void = () => {}, private onFailure: () => void = () => {}) {}
  async close() { this.closed = true; await this.transport.close(); }
  command(command: string, timeoutMs = 6000): Promise<string> {
    const task = this.queue.then(() => this.exchange(command, timeoutMs));
    this.queue = task.catch(() => {});
    return task;
  }
  private async exchange(command: string, timeoutMs: number): Promise<string> {
    if (this.closed) throw new ElmError('Connection is closed.', 'disconnected');
    this.trace({ direction: 'request', text: command, at: new Date().toISOString() });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const exchange = async () => {
        await this.transport.write(command + '\r');
        while (!this.buffer.includes('>')) {
          const chunk = await this.transport.read();
          if (chunk === null) throw new ElmError('Serial connection ended.', 'disconnected');
          this.buffer += chunk;
          if (this.buffer.length > 16384) throw new ElmError('Response exceeds size limit.', 'response');
        }
        const pos = this.buffer.indexOf('>');
        const response = this.buffer.slice(0, pos);
        this.buffer = this.buffer.slice(pos + 1);
        this.trace({ direction: 'response', text: response + '>', at: new Date().toISOString() });
        return response;
      };
      return await Promise.race([exchange(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ElmError(`Timed out waiting for ${command}.`, 'timeout')), timeoutMs); })]);
    } catch (error) {
      await this.close();
      this.onFailure();
      throw error instanceof ElmError ? error : new ElmError(error instanceof Error ? error.message : 'Transport failed.', 'disconnected');
    } finally { if (timer) clearTimeout(timer); }
  }
  async initialize() {
    const reset = await this.command('ATZ', 12000);
    if (!reset.trim() || /^\s*\?/m.test(reset)) throw new ElmError('Adapter did not identify itself after reset.', 'unsupported');
    for (const command of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']) {
      const response = await this.command(command);
      // Ignore echoed command, require an explicit OK, not just a prompt.
      if (!response.split(/[\r\n]+/).some(line => line.trim().toUpperCase() === 'OK')) {
        throw new ElmError(`${command} was not accepted: ${response.trim() || '(empty)'}`, 'unsupported');
      }
    }
    return reset.trim();
  }
}

/** Parse a headerless Mode 01 PID 0C response only. Do not interpret error text as data. */
export function parseRpm(raw: string): number {
  const lines = raw.toUpperCase().split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const compact = line.replace(/\s+/g, '');
    if (/^410C[0-9A-F]{4}$/.test(compact)) {
      return (parseInt(compact.slice(4, 6), 16) * 256 + parseInt(compact.slice(6, 8), 16)) / 4;
    }
  }
  throw new ElmError(`No valid PID 0C response: ${raw.trim() || '(empty)'}`, 'response');
}
