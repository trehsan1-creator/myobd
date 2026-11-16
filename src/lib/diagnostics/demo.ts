import type { CommandDevice } from './session';
// An intentionally separate, deterministic simulator. Never wraps a real transport.
export class DemoDevice implements CommandDevice {
  async command(cmd: string): Promise<string> {
    const replies: Record<string, string> = {
      ATDP: 'AUTO, ISO 15765-4 (CAN 11/500)', '0100': '410018188000',
      '0104': '41044D', '0105': '41055A', '010C': '410C1AF8', '010D': '410D28', '0111': '41112D',
      '03': '43010133', '0902': '490201314847434D383236333341303034333532',
      '020C00': '420C001770',
    };
    return replies[cmd] ?? 'NO DATA';
  }
}
