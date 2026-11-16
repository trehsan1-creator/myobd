export interface Transport {
  write(data: string): Promise<void>;
  read(): Promise<string | null>;
  close(): Promise<void>;
}

/** Browser serial transport. Selection must be called directly from a user gesture. */
export class SerialTransport implements Transport {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private decoder = new TextDecoder();
  private closed = false;
  private constructor(private port: SerialPort) {
    if (!port.readable || !port.writable) throw new Error('Serial streams are unavailable.');
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
  }
  static async request(baudRate: number): Promise<SerialTransport> {
    if (!('serial' in navigator)) throw new Error('Web Serial is not supported in this browser.');
    // Standard SPP and mapped serial devices are included without custom UUIDs.
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    try { return new SerialTransport(port); } catch (error) { await port.close(); throw error; }
  }
  async write(data: string) { if (this.closed) throw new Error('Port is closed.'); await this.writer.write(new TextEncoder().encode(data)); }
  async read() {
    const { value, done } = await this.reader.read();
    return done ? null : this.decoder.decode(value, { stream: true });
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    try { await this.reader.cancel(); } catch { /* disconnected */ }
    try { this.reader.releaseLock(); } catch { /* disconnected */ }
    try { this.writer.releaseLock(); } catch { /* disconnected */ }
    try { await this.port.close(); } catch { /* disconnected */ }
  }
}
