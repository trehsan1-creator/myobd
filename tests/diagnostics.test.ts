import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDtc, decodePid, decodeVin, supportedPids, troubleCodes } from '../src/lib/diagnostics/parser';
import { DemoDevice } from '../src/lib/diagnostics/demo';
import { DiagnosticSession } from '../src/lib/diagnostics/session';
import { createDiagnosticClient } from '../src/lib/mcp/client';
import { analyze } from '../src/lib/ai/openai';

test('PID bitmap and formula decoding are strict', () => {
  assert.deepEqual(supportedPids('410018188000',0),[4,5,12,13,17]);
  assert.equal(decodePid('410C1AF8','0C'),1726); assert.equal(decodePid('410C0000','0C'),0);
  assert.equal(decodePid('410500','05'),-40); assert.throws(()=>decodePid('410C1A','0C'));
  assert.throws(()=>decodePid('410C1AF8\r410C1AF8','0C'));
});
test('DTC decoding supports CAN count and pair responses without inventing codes',()=>{
  assert.equal(decodeDtc(1,0x33),'P0133'); assert.equal(decodeDtc(0xc1,0x23),'U0123');
  assert.deepEqual(troubleCodes('43010133'),['P0133']); assert.deepEqual(troubleCodes('430133'),['P0133']);
  assert.deepEqual(troubleCodes('4300'),[]); assert.throws(()=>troubleCodes('43')); assert.throws(()=>troubleCodes('NO DATA'));
});
test('VIN demands a complete unambiguous response',()=>{
  assert.equal(decodeVin('490201314847434D383236333341303034333532'),'1HGCM82633A004352');
  assert.throws(()=>decodeVin('4902013148'));
});
test('simulator data is labelled, and missing readings stay unavailable',async()=>{
  const session=new DiagnosticSession(new DemoDevice(),'simulated','DEMO');
  const rpm=await session.live('0C'); assert.equal(rpm.state,'available'); assert.equal(rpm.source,'simulated');
  const freeze=await session.freezeFrame('05'); assert.equal(freeze.state,'unavailable');
  assert.throws(()=>session.live('FF'));
});
test('embedded MCP validates schemas and returns source and session',async()=>{
  const session=new DiagnosticSession(new DemoDevice(),'simulated','DEMO'); const embedded=await createDiagnosticClient(session);
  try {
    const tools=await embedded.client.listTools(); assert.equal(tools.tools.length,9);
    const result=await embedded.client.callTool({name:'get_live_data',arguments:{pid:'0C'}});
    assert.equal((result.structuredContent as {source:string}).source,'simulated');
    assert.equal((result.structuredContent as {sessionId:string}).sessionId,session.id);
    const invalid=await embedded.client.callTool({name:'get_live_data',arguments:{pid:'FF'}}); assert.equal(invalid.isError,true);
  } finally { await embedded.close(); }
});
test('OpenAI adapter calls a local MCP tool before providing an answer',async()=>{
  const embedded=await createDiagnosticClient(new DiagnosticSession(new DemoDevice(),'simulated','DEMO'));
  const original=globalThis.fetch; let n=0;
  globalThis.fetch=async (_input,init)=>{
    n++; const body=JSON.parse(String(init?.body)); assert.equal(body.tool_choice,n===1?'required':'auto');
    if(n===1)return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'c1',type:'function',function:{name:'get_live_data',arguments:'{"pid":"0C"}'}}]}}]});
    assert.match(JSON.stringify(body.messages),/simulated/); return Response.json({choices:[{message:{role:'assistant',content:'داده نمایشی است.'}}]});
  };
  try { assert.equal(await analyze(embedded.client,'test','gpt-4o-mini','وضعیت؟'),'داده نمایشی است.'); assert.equal(n,2); } finally { globalThis.fetch=original; await embedded.close(); }
});
test('provider failure does not synthesize a diagnosis',async()=>{
  const embedded=await createDiagnosticClient(new DiagnosticSession(new DemoDevice(),'simulated','DEMO')); const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({error:'quota'}, {status:429});
  try { await assert.rejects(analyze(embedded.client,'test','model','diagnose'),/quota/); } finally { globalThis.fetch=original; await embedded.close(); }
});
test('manual identification is sourced as user input',async()=>{
  const session=new DiagnosticSession(new DemoDevice(),'simulated','DEMO'); session.confirmVehicle({make:'Example',model:'',year:'2020'});
  const embedded=await createDiagnosticClient(session);
  try { const result=await embedded.client.callTool({name:'get_vehicle_info',arguments:{}}); const data=(result.structuredContent as { data: { fields: {source: string}, confidence: string } }).data; assert.equal(data.fields.source,'user_entered'); assert.equal(data.confidence,'partial'); }
  finally { await embedded.close(); }
});
