# Reverse Escape developer guide

Reverse Escape combines a browser editor and 3D renderer with a shared grid simulation and an authoritative Express/Socket.IO server. Start with the root README for gameplay and [architecture](../ARCHITECTURE.md) for the engine, race, co-op, daily challenge, and rewind designs.

## Reproducible setup

Use Node.js satisfying `>=22 <25` and the committed npm lockfile:

```sh
npm ci
npm run dev
```

Vite uses 5173; the API/socket server uses 3001 by default. Production builds both surfaces:

```sh
npm run build
npm start
```

Start from the repository root so the server finds `dist/`. Production startup explicitly rejects missing `dist/index.html`. TypeScript checking is part of `build`; `build:server` bundles the Node entry using esbuild.

## System boundaries and state

`src/shared/` owns grid types, movement, validation, scoring, and deterministic planning. `src/server/` owns request validation, match lifecycle, private reconnect identity, race progression, daily runs, and persistence. The client renders server/engine state; rendering does not establish a competitive result. Consult shared types and server handlers together when changing Socket.IO events.

Multiplayer rooms and active daily runs live in process memory. Daily ranking results use the `DailyScoreStore` file under `DATA_DIR`, with atomic writes and startup loading. Persist that directory across deployments, keep backups, and use one replica. A restart loses live rooms even if rankings survive. Browser drafts and solo completion belong to the browser/device rather than an account.

## Interfaces and configuration

| Interface | Behavior |
| --- | --- |
| `GET /api/health` | 200 `status: ok`; 503 `status: draining` during shutdown |
| `POST /api/validate` | JSON `grid`; returns shared board validation; per-IP validation rate limit |
| `POST /api/scout` | Server-side solo scout simulation; optional Luna decisions with fallback |
| `GET /api/daily` | Current daily room and ranking view |
| `POST /api/daily/start` | Start/recover a daily run through its handler's identity protocol |
| `POST /api/daily/move` | Submit server-validated daily movement |
| `/socket.io/` | Multiplayer connection and event transport |

Exact event/request types live in [shared source](REFERENCE.md); daily and scout requests have additional validation in their respective routers. Do not send a completed client score as evidence of extraction. Reconnect credentials belong to their holder and must not be exposed in public room views.

`PORT` defaults to 3001. `PUBLIC_ORIGIN` is the allowed browser origin for HTTP/socket boundaries. `DATA_DIR` defaults to the root `data` directory. `LUNA_ENABLED=true` and server-only `OPENAI_API_KEY` enable optional model decisions for supported solo simulation. Competitive simulation retains its deterministic engine. Missing/failed provider calls fall back according to scout logic; an available game does not prove an external model was used.

The server accepts JSON bodies up to 16 KiB and caps Socket.IO messages at 16 KiB. Repeated validation can return 429. Unknown API paths return JSON 404 rather than the SPA page. During shutdown clients receive `server:restarting`, the match manager closes, and a ten-second timeout bounds process drain.

## Checks and release

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests cover shared rules and socket lifecycle; Playwright checks the built browser flow. `npm run smoke -- https://your-game-domain.example` exercises a deployed multiplayer service. Use a disposable local instance for stateful checks.

Follow [deployment instructions](../DEPLOYMENT.md) for the root Dockerfile or Compose. Route HTTPS, static assets, API, and WebSocket upgrades to the same service on container port 3001. Mount `DATA_DIR` and keep one replica. Verify health, two-player joining/reconnect, and a complete round after release. If the page loads but players cannot join, inspect socket upgrade routing and `PUBLIC_ORIGIN`; if rankings disappear, inspect the data mount and write permissions; if assets are missing, rebuild before starting.

## Reference

- [Source and configuration reference](REFERENCE.md)
- [Contributing](../CONTRIBUTING.md)
