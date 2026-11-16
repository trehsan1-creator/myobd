import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/nvidia/route';
import { analyze } from '../src/lib/ai/openai';
import { createDiagnosticClient } from '../src/lib/mcp/client';
import { DiagnosticSession } from '../src/lib/diagnostics/session';
import { DemoDevice } from '../src/lib/diagnostics/demo';
const model='nvidia/nemotron-3-ultra-550b-a55b';
const body={model,messages:[{role:'user',content:'test'}],tools:[],tool_choice:'required'};
const request=(origin:string,payload:unknown=body)=>new Request('https://app.example/api/nvidia',{method:'POST',headers:{host:'app.example',origin,authorization:'Bearer nvapi-dummy','content-type':'application/json'},body:JSON.stringify(payload)});

test('NVIDIA proxy uses fixed host, user key in header, validates origin and model',async()=>{
  const original=globalThis.fetch; let called=0;
  globalThis.fetch=async(url,opts)=>{called++;assert.equal(String(url),'https://integrate.api.nvidia.com/v1/chat/completions');assert.equal((opts?.headers as Record<string,string>).authorization,'Bearer nvapi-dummy');assert.doesNotMatch(String(opts?.body),/nvapi-dummy/);assert.equal(JSON.parse(String(opts?.body)).stream,false);return Response.json({choices:[]});};
  try { assert.equal((await POST(request('https://evil.example'))).status,403);assert.equal((await POST(request('https://app.example',{...body,model:'../../secret'}))).status,400);assert.equal(called,0);assert.equal((await POST(request('https://app.example'))).status,200);assert.equal(called,1); } finally {globalThis.fetch=original;}
});
test('NVIDIA returns safe useful status error without echoing credentials or upstream text',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('nvapi-dummy', {status:401});
  try { const response=await POST(request('https://app.example'));assert.equal(response.status,401);assert.doesNotMatch(JSON.stringify(await response.json()),/nvapi-dummy/); }finally{globalThis.fetch=original;}
});
test('NVIDIA adapter calls MCP simulated DTC tool before answering',async()=>{
  const embedded=await createDiagnosticClient(new DiagnosticSession(new DemoDevice(),'simulated','DEMO'));const original=globalThis.fetch;let count=0;
  globalThis.fetch=async(url,opts)=>{count++;assert.equal(url,'/api/nvidia');const payload=JSON.parse(String(opts?.body));assert.equal(payload.model,model);
    if(count===1){assert.equal(payload.tool_choice,'required');return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'get_trouble_codes',arguments:'{}'}}]}}]});}
    assert.match(JSON.stringify(payload.messages),/simulated/);assert.match(JSON.stringify(payload.messages),/P0133/);return Response.json({choices:[{message:{role:'assistant',content:'این داده نمایشی است.'}}]});};
  try{assert.equal(await analyze(embedded.client,'nvapi-dummy',model,'تحلیل کن','nvidia'),'این داده نمایشی است.');assert.equal(count,2);}finally{globalThis.fetch=original;await embedded.close();}
});
test('NVIDIA cannot provide a non-tool-grounded answer',async()=>{
  const embedded=await createDiagnosticClient(new DiagnosticSession(new DemoDevice(),'simulated','DEMO'));const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{message:{role:'assistant',content:'fabricated'}}]});
  try{await assert.rejects(analyze(embedded.client,'nvapi-dummy',model,'تحلیل کن','nvidia'),/tool-grounded/);}finally{globalThis.fetch=original;await embedded.close();}
});
