import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Elm327, ElmError, parseRpm } from '../src/lib/obd/elm327';
import type { Transport } from '../src/lib/transport/serial';
class Fake implements Transport {
  writes: string[] = []; closed = false; chunks: string[];
  constructor(chunks: string[]) { this.chunks = chunks; }
  async write(data: string) { this.writes.push(data); }
  async read() { return this.chunks.shift() ?? null; }
  async close() { this.closed = true; }
}
test('initialization respects prompt framing and command order', async () => {
  const fake = new Fake(['ELM327 v1.5\r', '>', 'OK\r>', 'OK\r>', 'OK\r>', 'OK\r>', 'OK\r>']);
  const elm = new Elm327(fake); assert.equal(await elm.initialize(), 'ELM327 v1.5');
  assert.deepEqual(fake.writes, ['ATZ\r','ATE0\r','ATL0\r','ATS0\r','ATH0\r','ATSP0\r']);
});
test('commands are serialized even when requested concurrently', async () => {
  const fake = new Fake(['first>', 'second>']); const elm = new Elm327(fake);
  assert.deepEqual(await Promise.all([elm.command('A'), elm.command('B')]), ['first','second']);
  assert.deepEqual(fake.writes, ['A\r','B\r']);
});
test('decodes RPM including zero and refuses malformed or unrelated data', () => {
  assert.equal(parseRpm('SEARCHING...\r41 0C 1A F8\r'), 1726);
  assert.equal(parseRpm('410C0000'), 0);
  for (const s of ['NO DATA', '410C1A', '7E804410C1AF8', '410C1AF8FFFF', '410D1AF8']) assert.throws(() => parseRpm(s));
});
test('rejects unsupported initialization', async () => {
  const elm = new Elm327(new Fake(['ELM327>', '?>']));
  await assert.rejects(elm.initialize(), (e: unknown) => e instanceof ElmError && e.kind === 'unsupported');
});
test('timeout closes transport and prevents a subsequent command', async () => {
  const fake: Transport & {closed: boolean} = { closed: false, async write() {}, async read() { return new Promise(() => {}); }, async close() { this.closed = true; } };
  const elm = new Elm327(fake); await assert.rejects(elm.command('ATZ', 10), /Timed out/); assert.equal(fake.closed, true); await assert.rejects(elm.command('ATE0'), /closed/);
});
test('disconnection is an error', async () => { const fake = new Fake([]); await assert.rejects(new Elm327(fake).command('010C'), /ended/); assert.equal(fake.closed, true); });
