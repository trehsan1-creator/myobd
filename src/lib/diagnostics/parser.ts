/** Only unambiguous headerless, single ECU responses are interpreted. */
export function payload(raw: string, prefix: string): number[] {
  const lines = raw.toUpperCase().split(/[\r\n]+/).map(s => s.trim().replace(/\s+/g, '')).filter(Boolean);
  const matches = lines.filter(s => s.startsWith(prefix) && /^[0-9A-F]+$/.test(s) && s.length % 2 === 0);
  if (matches.length !== 1) throw new Error(matches.length ? 'Multiple ECU responses cannot be attributed.' : `No valid ${prefix} response`);
  return (matches[0].slice(prefix.length).match(/../g) ?? []).map(v => parseInt(v, 16));
}
export function supportedPids(raw: string, base: number): number[] {
  const bytes = payload(raw, `41${base.toString(16).padStart(2, '0').toUpperCase()}`);
  if (bytes.length !== 4) throw new Error('Invalid supported PID bitmap');
  return Array.from({ length: 32 }, (_, i) => i).filter(i => (bytes[Math.floor(i / 8)] & (0x80 >> (i % 8))) !== 0).map(i => base + i + 1);
}
export function decodeDtc(a: number, b: number): string {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 255 || b > 255) throw new Error('Invalid DTC bytes');
  return 'PCBU'[a >> 6] + ((a >> 4) & 3).toString() + (a & 15).toString(16).toUpperCase() + b.toString(16).padStart(2, '0').toUpperCase();
}
export function troubleCodes(raw: string): string[] {
  let bytes = payload(raw, '43');
  if (!bytes.length) throw new Error('Empty DTC response');
  // Odd number of bytes indicates CAN count byte; legacy uses pairs.
  if (bytes.length % 2 === 1) {
    const count = bytes[0]; bytes = bytes.slice(1);
    if (count * 2 > bytes.length || bytes.slice(count * 2).some(b => b !== 0)) throw new Error('Invalid DTC count or padding');
    bytes = bytes.slice(0, count * 2);
  }
  const codes: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) if (bytes[i] !== 0 || bytes[i + 1] !== 0) codes.push(decodeDtc(bytes[i], bytes[i + 1]));
  return codes;
}
export const pids = {
  '04': { name: 'بار موتور', unit: '%', bytes: 1, decode: (a: number, _b: number) => a * 100 / 255 },
  '05': { name: 'دمای مایع خنک‌کننده', unit: '°C', bytes: 1, decode: (a: number, _b: number) => a - 40 },
  '0C': { name: 'دور موتور', unit: 'rpm', bytes: 2, decode: (a: number, b: number) => (a * 256 + b) / 4 },
  '0D': { name: 'سرعت خودرو', unit: 'km/h', bytes: 1, decode: (a: number, _b: number) => a },
  '11': { name: 'موقعیت دریچه گاز', unit: '%', bytes: 1, decode: (a: number, _b: number) => a * 100 / 255 },
} as const;
export type Pid = keyof typeof pids;
export function decodePid(raw: string, pid: Pid, freeze = false): number {
  const data = payload(raw, `${freeze ? '42' : '41'}${pid}${freeze ? '00' : ''}`);
  if (data.length !== pids[pid].bytes) throw new Error('Incomplete or ambiguous PID response');
  return pids[pid].decode(data[0], data[1]);
}
export function decodeVin(raw: string): string {
  const bytes = payload(raw, '4902');
  if (bytes.length !== 18 || bytes[0] !== 1) throw new Error('VIN response incomplete or unsupported framing');
  const vin = String.fromCharCode(...bytes.slice(1));
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error('Invalid VIN');
  return vin;
}
