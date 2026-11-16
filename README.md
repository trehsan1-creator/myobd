# MyOBD — Persian-first diagnostic MVP in progress

A read-only, browser-local ELM327 diagnostic engine with a separate labelled simulator, an embedded in-memory MCP client/server, and an opt-in Gemini/OpenAI assistant. **No real hardware, deployed Vercel project, live provider key, or mobile browser has been tested. This is not yet a hardware-verified production MVP.** The adapter connection status does not prove vehicle communication. See [Phase 0](docs/PHASE-0.md) for the research review and assumptions.

## Setup and deployment

Node.js 20.9+ (22 recommended). Run `npm ci`, `npm test`, `npm run build`, then `npm run dev`. Open `http://localhost:3000` on the same machine. For hardware on another device use HTTPS; browser hardware APIs need a secure context and a user gesture. Deploy to Vercel with its Next.js defaults; no environment variables, database, or local bridge are required. The Vercel API routes only proxy user-initiated Gemini/OpenAI calls; the adapter is accessed exclusively in the browser. `npm run start` runs the production build. Deploy has not been verified in this environment.

## Usage

Choose **امتحان حالت نمایشی** for deterministic simulated data, then **شروع بررسی خودرو**. Every simulated tool result is marked `simulated`. For hardware, select Web Serial or BLE before connecting. On the dashboard press **شروع بررسی خودرو** to query supported PIDs, protocol, DTCs and VIN. Live readings are manual and enabled only for PIDs advertised by the vehicle. Freeze frame attempts RPM at frame 00. VIN decoding is deliberately limited to already-reassembled, single-line responses; incomplete or ambiguous responses are unavailable, not guessed. The raw connection log is in memory and may contain VIN: redact before sharing. Manually entered make/model/year are labelled user-provided, not automatically verified.

In assistant settings, select Google Gemini (the default) and enter a Google AI Studio API key; alternatively select OpenAI. Activate demo mode and initiate a request on the assistant screen. The default Gemini model is `gemini-3.8-flash`; use a model available to your key and region. A browser-local MCP client invokes read-only tools and sends their results to the model through the Vercel proxy. The key remains in page memory, never localStorage, and disappears on reload; the proxy and the selected provider receive it. Same-page script compromise can expose it. No data is sent to a model until initiated. This is an embedded MCP connection, not an externally reachable MCP server. It uses the maintenance-line `@modelcontextprotocol/sdk` 1.32.2 in-memory transport, not the report's incorrectly named SDK v2 package; see Phase 0. The provider adapter uses direct OpenAI tool calling rather than the report's AI SDK useChat integration. Both are explicit implementation deviations pending integration validation.

## Unverified hardware checklist

- Record adapter make/model, firmware, transport, baud rate, vehicle and browser/OS/version. Do not assume compatibility from the ELM version string.
- In a ventilated safe location with the vehicle stationary, plug in the adapter and turn the ignition on. Pair Classic SPP in OS settings before selecting a serial port. The app's BLE path is limited to FFF0 service / FFF1 notify / FFF2 write, and only adapters advertising that service appear. Other BLE UUIDs are not supported.
- On HTTPS, choose the method and grant permission. On serial try the specified baud, commonly 38400 or 9600. Verify ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0 and a real `0100` response in the log. Read RPM (010C) with engine running; `41 0C A B` is `(256*A+B)/4` rpm, and zero is valid.
- Test DTCs, protocol, VIN, freeze frame, disconnect/reconnect, denied permissions, timeout and unplugging. Record actual raw responses. Test both Classic and BLE separately with each target OS/browser. Test K-Line and CAN separately; no compatibility is verified yet.
- Chrome documented desktop Bluetooth RFCOMM in 117 and Android in 138; Web Bluetooth support varies by OS/browser. iOS Safari has neither path; the proposed Capacitor iOS wrapper has not been implemented. Do not claim mobile compatibility until tested.

## Safety and known limitations

- No clear-DTC, ECU programming, actuator tests, arbitrary raw LLM commands, proprietary module scans, or write operations. Do not use while driving.
- PID/DTC parsing is deliberately conservative: ambiguous multi-ECU responses, many multiline/ISO-TP VIN formats, and some legacy adapter formats may be unavailable. ISO-TP flow-control injection is not implemented. No manufacturer identification database or DTC explanation database is included. Empty/unavailable readings are not treated as zero.
- Automatic continuous polling, offline PWA/Serwist, native iOS wrapper, encrypted persistent credentials, streaming assistant output, external MCP interoperability and provider options beyond Gemini and OpenAI remain unimplemented. No claim of offline-first operation or production readiness is made. The OpenAI Edge runtime is deprecated by the installed Next.js version and emits a build warning; the Gemini proxy uses Node.js.
- Hardware and AI results can be incorrect or stale. AI-generated possible causes are hypotheses, not definitive diagnoses.

## Progress

- [x] Research review, initial hardware proof-of-concept code, serial and FFF0 BLE paths (unverified).
- [x] Read-only engine, demo, dashboard, embedded MCP, user-initiated Gemini/OpenAI adapters, local tests.
- [ ] Real-hardware response and browser/device matrix verified.
- [ ] Real provider call and deployed Vercel endpoint tested.
- [ ] Offline shell, native iOS and external MCP support.

Gemini uses the GenerateContent API with read-only tool calling; the server proxy forwards the key in the `x-goog-api-key` header. Provider availability and quota depend on the account and region. The Gemini integration is covered by mocked automated tests only; no live Google API request has been verified here. The sandbox has restricted external network access, so a real provider call may require deployment to an environment that can reach Google. Never paste your API key into chat.
