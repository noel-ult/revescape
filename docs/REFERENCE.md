# revescape source reference

Source reviewed: [`a94000a47334`](https://github.com/noel-ult/revescape/commit/a94000a4733466fc3eacc2e173ba8cf251de549d).

This reference records the checked-in source, scripts, configuration names, and route declarations. It is a navigation aid; service availability and successful test execution require separate verification.

## Package commands

Run each command in the directory containing its package manifest. A declared script is not necessarily a passing check; guides call out placeholders and known mismatches.

### package.json

| Script | Shell command |
| --- | --- |
| `dev` | `concurrently -k "npm:dev:server" "npm:dev:client"` |
| `dev:server` | `tsx watch src/server/index.ts` |
| `dev:client` | `vite --port 5173` |
| `build` | `tsc --noEmit && vite build && npm run build:server` |
| `start` | `node dist-server/index.js` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `playwright test` |
| `build:server` | `esbuild src/server/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/index.js` |
| `smoke` | `node scripts/smoke-multiplayer.mjs` |

Manifest: [package.json](../package.json).

## Configuration names

Names below are declared by source or example files. Example-only entries may be stale; consult the linked reader and project guide before relying on them. Secret values are intentionally omitted.

| Name | Declared/read in |
| --- | --- |
| `CI` | [playwright.config.ts](../playwright.config.ts) |
| `DATA_DIR` | [.env.example](../.env.example), [src/server/index.ts](../src/server/index.ts) |
| `E2E_PORT` | [playwright.config.ts](../playwright.config.ts) |
| `LUNA_ENABLED` | [.env.example](../.env.example), [src/server/index.ts](../src/server/index.ts) |
| `NODE_ENV` | [.env.example](../.env.example), [src/server/index.ts](../src/server/index.ts) |
| `OPENAI_API_KEY` | [.env.example](../.env.example), [src/server/index.ts](../src/server/index.ts) |
| `PORT` | [.env.example](../.env.example), [Dockerfile](../Dockerfile), [src/server/index.ts](../src/server/index.ts) |
| `PUBLIC_ORIGIN` | [.env.example](../.env.example), [src/server/index.ts](../src/server/index.ts) |

## HTTP route declarations

Paths are **as declared in each source file**. Router/blueprint mount prefixes from the entry point must be prepended; the project guide describes the active entry point and common prefixes. Alternate entry points (such as SQLite) are listed separately by file. Authentication, request bodies, and response schemas live in the linked handlers/models.

| Source | Method | Declared path | Handler |
| --- | --- | --- | --- |
| [src/server/daily.ts](../src/server/daily.ts) | GET | `/daily` | `` |
| [src/server/daily.ts](../src/server/daily.ts) | POST | `/daily/start` | `` |
| [src/server/daily.ts](../src/server/daily.ts) | POST | `/daily/move` | `` |
| [src/server/index.ts](../src/server/index.ts) | GET | `/api/health` | `` |
| [src/server/index.ts](../src/server/index.ts) | POST | `/api/validate` | `` |
| [src/server/index.ts](../src/server/index.ts) | GET | `*` | `` |
| [src/server/scout.ts](../src/server/scout.ts) | POST | `/scout` | `` |

## Existing documentation

Historical plans/reports describe their own revision; use current source when they disagree.

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [DEMO_SCRIPT.md](../DEMO_SCRIPT.md)
- [DEPLOYMENT.md](../DEPLOYMENT.md)
- [DESIGN.md](../DESIGN.md)
- [README.md](../README.md)
- [UX-CONTRACT.md](../UX-CONTRACT.md)

## Source and configuration map

Generated lockfiles, binary assets, compiled output, vendored dependencies, and cached bytecode are omitted. Test files remain listed so coverage can be located.

- [.env.example](../.env.example)
- [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [Dockerfile](../Dockerfile)
- [compose.yaml](../compose.yaml)
- [index.html](../index.html)
- [package.json](../package.json)
- [playwright.config.ts](../playwright.config.ts)
- [postcss.config.js](../postcss.config.js)
- [premium-ui.json](../premium-ui.json)
- [scripts/smoke-multiplayer.mjs](../scripts/smoke-multiplayer.mjs)
- [src/client/App.tsx](../src/client/App.tsx)
- [src/client/components/AIExplainer.tsx](../src/client/components/AIExplainer.tsx)
- [src/client/components/AccessInventory.tsx](../src/client/components/AccessInventory.tsx)
- [src/client/components/ArenaScreen.tsx](../src/client/components/ArenaScreen.tsx)
- [src/client/components/BlueprintGrid.tsx](../src/client/components/BlueprintGrid.tsx)
- [src/client/components/BuilderScreen.tsx](../src/client/components/BuilderScreen.tsx)
- [src/client/components/DailyScreen.tsx](../src/client/components/DailyScreen.tsx)
- [src/client/components/DecisionRewind.tsx](../src/client/components/DecisionRewind.tsx)
- [src/client/components/FacilityShare.tsx](../src/client/components/FacilityShare.tsx)
- [src/client/components/FacilityView.tsx](../src/client/components/FacilityView.tsx)
- [src/client/components/HowToPlayModal.tsx](../src/client/components/HowToPlayModal.tsx)
- [src/client/components/HumanPlayModal.tsx](../src/client/components/HumanPlayModal.tsx)
- [src/client/components/LandingPage.tsx](../src/client/components/LandingPage.tsx)
- [src/client/components/LobbyScreen.tsx](../src/client/components/LobbyScreen.tsx)
- [src/client/components/Navbar.tsx](../src/client/components/Navbar.tsx)
- [src/client/components/PuzzleGrid.tsx](../src/client/components/PuzzleGrid.tsx)
- [src/client/components/RaceScreen.tsx](../src/client/components/RaceScreen.tsx)
- [src/client/components/ResultsScreen.tsx](../src/client/components/ResultsScreen.tsx)
- [src/client/components/SectorMap.tsx](../src/client/components/SectorMap.tsx)
- [src/client/components/SharedFacilityScreen.tsx](../src/client/components/SharedFacilityScreen.tsx)
- [src/client/index.css](../src/client/index.css)
- [src/client/lib/facilityScene.ts](../src/client/lib/facilityScene.ts)
- [src/client/lib/socket.ts](../src/client/lib/socket.ts)
- [src/client/lib/sound.ts](../src/client/lib/sound.ts)
- [src/client/lib/useGameDialog.ts](../src/client/lib/useGameDialog.ts)
- [src/client/main.tsx](../src/client/main.tsx)
- [src/server/daily.ts](../src/server/daily.ts)
- [src/server/index.ts](../src/server/index.ts)
- [src/server/luna.ts](../src/server/luna.ts)
- [src/server/matchManager.ts](../src/server/matchManager.ts)
- [src/server/scout.ts](../src/server/scout.ts)
- [src/shared/agent.ts](../src/shared/agent.ts)
- [src/shared/board.ts](../src/shared/board.ts)
- [src/shared/challenges.ts](../src/shared/challenges.ts)
- [src/shared/constants.ts](../src/shared/constants.ts)
- [src/shared/coop.ts](../src/shared/coop.ts)
- [src/shared/expedition.ts](../src/shared/expedition.ts)
- [src/shared/facility.ts](../src/shared/facility.ts)
- [src/shared/levels.ts](../src/shared/levels.ts)
- [src/shared/movement.ts](../src/shared/movement.ts)
- [src/shared/scoring.ts](../src/shared/scoring.ts)
- [src/shared/sectors.ts](../src/shared/sectors.ts)
- [src/shared/solver.ts](../src/shared/solver.ts)
- [src/shared/types.ts](../src/shared/types.ts)
- [src/shared/validator.ts](../src/shared/validator.ts)
- [tailwind.config.js](../tailwind.config.js)
- [tests/e2e/features.spec.ts](../tests/e2e/features.spec.ts)
- [tests/e2e/game.spec.ts](../tests/e2e/game.spec.ts)
- [tests/unit/agent.test.ts](../tests/unit/agent.test.ts)
- [tests/unit/challenges.test.ts](../tests/unit/challenges.test.ts)
- [tests/unit/coop.test.ts](../tests/unit/coop.test.ts)
- [tests/unit/daily.test.ts](../tests/unit/daily.test.ts)
- [tests/unit/expedition.test.ts](../tests/unit/expedition.test.ts)
- [tests/unit/levels.test.ts](../tests/unit/levels.test.ts)
- [tests/unit/luna.test.ts](../tests/unit/luna.test.ts)
- [tests/unit/multiplayer.test.ts](../tests/unit/multiplayer.test.ts)
- [tests/unit/race.test.ts](../tests/unit/race.test.ts)
- [tests/unit/scoring.test.ts](../tests/unit/scoring.test.ts)
- [tests/unit/scout.test.ts](../tests/unit/scout.test.ts)
- [tests/unit/sectors.test.ts](../tests/unit/sectors.test.ts)
- [tests/unit/solver.test.ts](../tests/unit/solver.test.ts)
- [tests/unit/validator.test.ts](../tests/unit/validator.test.ts)
- [tsconfig.json](../tsconfig.json)
- [vite.config.ts](../vite.config.ts)
- [vitest.config.ts](../vitest.config.ts)
