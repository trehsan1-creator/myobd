# Phase 0 — plan and hardware gate

## Architecture
The report selects a TypeScript Next.js App Router web app on Vercel; a browser-local, transport-independent ELM327 engine using Web Serial (paired Classic SPP) or Web Bluetooth (BLE); a Persian RTL interface; Serwist for an offline shell; and a Capacitor/Capgo BLE wrapper for iOS. AI is optional: a user-initiated provider request passes through a Vercel Edge proxy, with client-side diagnostic tools. The report proposes MCP SDK and Zod, but browser-bound tools are not automatically an externally accessible MCP server. No hardware process belongs on Vercel. No local bridge is selected in the report.

## Versions
The report does not specify exact versions. Phase 1 pins Next.js 16.4.6, React/React DOM 19.3.1, TypeScript 5.9.3, @types/node 22.19.15, @types/react 19.3.0, @types/react-dom 19.3.0, @types/w3c-web-serial 1.0.8, and tsx 4.23.15. See package-lock.json for transitive versions. Future components are deliberately not installed before the hardware gate; current registry versions checked: @modelcontextprotocol/server 2.4.0, zod 4.6.7, ai 7.0.173, @serwist/next 9.5.14, @capacitor/core 8.6.2, @capgo/capacitor-bluetooth-low-energy 8.2.9, tailwindcss 4.3.5. These are candidates, not compatibility-tested commitments.

## Hardware assumptions and unresolved issues
- Chrome's official documentation says Classic RFCOMM support began on desktop in Chrome 117 and on Android in Chrome 138, not that all versions/platforms work. Pair in the OS first. Availability is feature-detected; device/browser combinations are not verified here. https://developer.chrome.com/blog/serial-over-bluetooth and https://developer.chrome.com/release-notes/138
- BLE FFF0/FFF1/FFF2 is not universal. Service and characteristic UUIDs and write/notification behavior must be confirmed for the actual adapter. iOS native wrapping is not implemented or validated. iOS Safari does not expose these browser APIs.
- The report calls `@modelcontextprotocol/sdk` v2, but official v2 uses separate `@modelcontextprotocol/server` and `@modelcontextprotocol/client` packages. Browser execution and transport must be verified before deciding interoperability. https://ts.sdk.modelcontextprotocol.io/v2/
- The report's manual ISO-TP flow-control injection would require adapter-specific addressing and CAN configuration and conflicts with the read-only/no arbitrary-command safety policy. Do not implement it without verified hardware/protocol specifics; let the adapter manage flow control and report incomplete VIN data.
- AT @1 / version strings cannot prove authenticity or protocol support; clones can spoof them. Protocol support must be observed, not inferred.
- The report's claim that local-storage encryption protects against XSS or total compromise is overstated: active page compromise can access a password or decrypted key. The proxy necessarily receives the credential; it cannot eliminate that exposure.
- Its blanket MIT claims for third-party parsing code require source/license verification before copying. Phase 1 uses independently implemented standard formulas, not copied code.
- A real device, vehicle, ignition state and browser are unavailable in this environment. Real success is a blocker, not a test result. This prototype only targets standard serial ELM command mode; actual adapter support remains unverified.

## Sequence
1. Implement the serial hardware proof of concept and tests. Run build and tests.
2. With the user's actual device, capture AT initialization and a real 010C response. Stop here until verified, as requested.
3. Then add evidence-based identification, supported PIDs/DTCs, demo separation, MCP/provider integration, offline shell and broader validation in small steps. No DTC clearing in the MVP unless separately approved.

## Inputs needed to unblock real connection
Adapter make/model and whether it is Bluetooth Classic SPP or BLE (for BLE, advertised service and RX/TX UUIDs if known); OS and browser/version; vehicle make/model/year and ignition state. For serial, adapter baud rate if known. Do not infer support from the product's ELM327 version label.

## Implementation update
The user subsequently requested proceeding without waiting for the hardware gate. The current version includes Web Serial and an unverified FFF0 BLE path, a simulator, read-only engine and an in-memory MCP connection. It pins the stable v1 maintenance package `@modelcontextprotocol/sdk` 1.32.2 instead of the report's nonexistent v2 under that package name; browser-compatible v2 was not validated. The OpenAI adapter uses direct tool calling instead of AI SDK useChat, and credentials are kept only in volatile memory instead of encrypted persistent storage. Vazirmatn is self-hosted from the npm package rather than Google font fetching. Serwist, Capacitor and Tailwind are not yet integrated. See package.json and lockfile for exact implemented versions. These are incomplete deviations, not claims that the whole report is implemented.
