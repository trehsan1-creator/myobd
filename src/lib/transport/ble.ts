import type { Transport } from './serial';
const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const RX = '0000fff1-0000-1000-8000-00805f9b34fb';
const TX = '0000fff2-0000-1000-8000-00805f9b34fb';
/** Only the FFF0/FFF1/FFF2 convention; adapters with other UUIDs are not supported. */
export class BleTransport implements Transport {
  private queue: string[] = []; private waiting: ((value: string | null) => void) | null = null;
  private closed = false; private decoder = new TextDecoder();
  private constructor(private device: BluetoothDevice, private rx: BluetoothRemoteGATTCharacteristic, private tx: BluetoothRemoteGATTCharacteristic) {
    rx.addEventListener('characteristicvaluechanged', this.onData);
    device.addEventListener('gattserverdisconnected', this.onDisconnect);
  }
  static async request(): Promise<BleTransport> {
    if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth is not available.');
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
    try {
      const server = await device.gatt?.connect(); if (!server) throw new Error('GATT is unavailable.');
      const service = await server.getPrimaryService(SERVICE);
      const rx = await service.getCharacteristic(RX), tx = await service.getCharacteristic(TX);
      if (!rx.properties.notify || (!tx.properties.write && !tx.properties.writeWithoutResponse)) throw new Error('Required notify/write characteristics are unavailable.');
      const transport = new BleTransport(device, rx, tx);
      try { await rx.startNotifications(); } catch (error) { await transport.close(); throw error; }
      return transport;
    } catch (error) { device.gatt?.disconnect(); throw error; }
  }
  private onData = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value; if (!value || this.closed) return;
    const text = this.decoder.decode(value, { stream: true });
    if (this.waiting) { const resolve = this.waiting; this.waiting = null; resolve(text); } else this.queue.push(text);
  };
  private onDisconnect = () => { this.closed = true; if (this.waiting) { this.waiting(null); this.waiting = null; } };
  async write(data: string) {
    if (this.closed) throw new Error('Bluetooth disconnected.');
    const bytes = new TextEncoder().encode(data);
    for (let offset = 0; offset < bytes.length; offset += 20) {
      const chunk = bytes.slice(offset, offset + 20);
      if (this.tx.properties.write) await this.tx.writeValueWithResponse(chunk); else await this.tx.writeValueWithoutResponse(chunk);
    }
  }
  async read(): Promise<string | null> {
    if (this.queue.length) return this.queue.shift()!;
    if (this.closed) return null;
    return new Promise(resolve => { this.waiting = resolve; });
  }
  async close() {
    this.onDisconnect();
    this.rx.removeEventListener('characteristicvaluechanged', this.onData);
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnect);
    if (this.device.gatt?.connected) { try { await this.rx.stopNotifications(); } catch {} this.device.gatt.disconnect(); }
  }
}
