import { z } from 'zod';
import { DiagnosticSession, pidSchema } from './session';
export const toolNames = ['get_connection_status','get_vehicle_info','get_supported_protocol','get_supported_pids','get_trouble_codes','get_live_data','get_freeze_frame','explain_dtc','generate_diagnostic_report'] as const;
export type ToolName = typeof toolNames[number];
export const emptyArgs = z.object({}).strict();
export const toolArgs = z.object({ pid: pidSchema }).strict();
export const dtcArgs = z.object({ code: z.string().regex(/^[PCBU][0-3][0-9A-F]{3}$/) }).strict();
export function schemaFor(name: ToolName) { return name === 'get_live_data' || name === 'get_freeze_frame' ? toolArgs : name === 'explain_dtc' ? dtcArgs : emptyArgs; }
export async function runTool(session: DiagnosticSession, name: ToolName, input: unknown) {
  const args = schemaFor(name).parse(input) as { pid?: z.infer<typeof pidSchema>; code?: string };
  let data: unknown;
  switch (name) {
    case 'get_connection_status': data = { status: 'connected', adapter: session.adapter }; break;
    case 'get_vehicle_info': { const vin = await session.vin(); const selected = session.vehicleSelection(); data = { vin, fields: selected ? { make: selected.make || null, model: selected.model || null, year: selected.year || null, source: 'user_entered' } : null, confidence: vin.state === 'available' ? 'partial' : 'unknown', evidence: 'VIN response only; user-entered fields are unverified; no manufacturer decoding performed' }; } break;
    case 'get_supported_protocol': data = await session.protocol(); break;
    case 'get_supported_pids': data = await session.supported(); break;
    case 'get_trouble_codes': data = await session.dtcs(); break;
    case 'get_live_data': data = await session.live(args.pid); break;
    case 'get_freeze_frame': data = await session.freezeFrame(args.pid); break;
    case 'explain_dtc': data = { code: args.code, explanation: null, state: 'unavailable', reason: 'No verified DTC description database is included.' }; break;
    case 'generate_diagnostic_report': data = { vin: await session.vin(), protocol: await session.protocol(), codes: await session.dtcs() }; break;
  }
  return { sessionId: session.id, timestamp: new Date().toISOString(), source: session.source, data };
}
