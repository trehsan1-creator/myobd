import { z } from 'zod';
import { decodePid, decodeVin, pids, supportedPids, troubleCodes, type Pid } from './parser';
import { ElmError } from '../obd/elm327';
export interface CommandDevice { command(command: string, timeoutMs?: number): Promise<string> }
export type Source = 'vehicle' | 'simulated';
export type Reading<T> = { state: 'available'; value: T; raw: string; timestamp: string; source: Source } | { state: 'unavailable'; error: string; raw?: string; timestamp: string; source: Source };
export const pidSchema = z.enum(['04', '05', '0C', '0D', '11']);
export class DiagnosticSession {
  readonly id = globalThis.crypto.randomUUID();
  private userVehicle: { make: string; model: string; year: string } | null = null;
  confirmVehicle(value: unknown) { this.userVehicle = z.object({ make: z.string().trim().max(80), model: z.string().trim().max(80), year: z.string().trim().regex(/^(?:[0-9]{4})?$/) }).strict().parse(value); }
  vehicleSelection() { return this.userVehicle; }
  constructor(private device: CommandDevice, readonly source: Source, readonly adapter: string) {}
  private async read<T>(command: string, parse: (raw: string) => T): Promise<Reading<T>> {
    let raw: string | undefined;
    try { raw = await this.device.command(command, 20000); return { state: 'available', value: parse(raw), raw, timestamp: new Date().toISOString(), source: this.source }; }
    catch (e) {
      if (e instanceof ElmError && e.kind !== 'response') throw e;
      return { state: 'unavailable', error: e instanceof Error ? e.message : 'Unknown error', raw, timestamp: new Date().toISOString(), source: this.source };
    }
  }
  protocol(): Promise<Reading<string>> { return this.read('ATDP', raw => {
    const lines = raw.split(/[\r\n]+/).map(s => s.trim()).filter(s => s && s.toUpperCase() !== 'ATDP');
    if (lines.length !== 1 || /^(\?|OK|ERROR|NO DATA)$/i.test(lines[0]) || /NOT YET|AUTO,?\s*$/i.test(lines[0])) throw new Error('Protocol not determined');
    return lines[0];
  }); }
  async supported(): Promise<Reading<number[]>> {
    const all: number[] = [], rawParts: string[] = [];
    for (let base = 0; base <= 0xE0; base += 0x20) {
      const result = await this.read('01' + base.toString(16).padStart(2, '0').toUpperCase(), raw => supportedPids(raw, base));
      if (result.state === 'unavailable') return { ...result, raw: [...rawParts, result.raw].filter(Boolean).join('\n') };
      rawParts.push(result.raw); all.push(...result.value); if (!result.value.includes(base + 32)) break;
    }
    return { state: 'available', value: all, raw: rawParts.join('\n'), timestamp: new Date().toISOString(), source: this.source };
  }
  dtcs() { return this.read('03', troubleCodes); }
  vin() { return this.read('0902', decodeVin); }
  live(input: unknown) { const pid = pidSchema.parse(input); return this.read('01' + pid, raw => decodePid(raw, pid)); }
  freezeFrame(input: unknown) { const pid = pidSchema.parse(input); return this.read('02' + pid + '00', raw => decodePid(raw, pid, true)); }
}
export { pids, type Pid };
