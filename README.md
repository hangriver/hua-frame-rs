# HuaFrame Web Studio

Independent PWA for remotely managing HuaFrame frame devices.

This repository is linked into the HuaFrame frame-device repository as a Git submodule at `external/web-studio/`.

## Role

Web Studio is developed in parallel with the HuaFrame frame-device app. It owns the browser-based remote management experience and talks to frame devices through WebSocket + JSON-RPC 2.0.

This repository is intentionally separate from the main HuaFrame repository. The main repo pins a compatible commit through the submodule pointer.

## Baseline

- SvelteKit.
- Static output with `@sveltejs/adapter-static`.
- Manual URL/IP connection for MVP before discovery and pairing are implemented.
- Shared contracts should come from the HuaFrame contract package or mirrored generated artifacts once the integration flow is defined.

## Current State

Step 4 creates the Web Studio skeleton only. Step 5 should add the first minimal connection screen that calls `system.getInfo`.
