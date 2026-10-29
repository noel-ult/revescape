# Technical Architecture — Reverse Escape: Mind Wars

## 3D presentation and construction

`PuzzleGrid.tsx` is the shared, lazy-loaded entry point for the Three.js renderer used by the landing simulation, builder, arena, and human exploration modal. `FacilityView.tsx` owns the React camera controls and WebGL fallback. `facilityScene.ts` owns the scene, procedural geometry, materials, lighting, shadows, camera, pointer projection, and render loop.

The renderer consumes `SolverStep` / `AgentSimulationStep` data. It interpolates between adjacent navigation positions, articulates the robot's legs and heading, and uses a disappear/reappear animation for teleport events. Replay seeks snap directly to the selected state rather than drawing a path through walls. Scene animation never writes simulation state, scores, or multiplayer results. Fog visibility and hidden hardware derive from the current agent snapshot.

The canvas uses a bounded pixel ratio and shadow resolution; offscreen/hidden canvases skip rendering. ResizeObserver keeps cameras fitted to their containers. Unmounting disposes geometry, shared materials, controls, observers, animation frames, and WebGL contexts. A context failure selects the blueprint renderer, preserving editing and gameplay.

`src/shared/facility.ts` defines room modules and atomic, rotated placement. It produces the same `Grid` consumed by the existing validators and multiplayer protocol, so no new client-trusted game rules or network format is introduced. Module placement rejects overlap, out-of-bounds cells, anchor changes, excess budget, component-cap violations, and lifts outside the main-floor perimeter of their matching annex. `validateBoard` independently checks lift placement and caps on the server. Solvability remains checked by `validateBoard`; an unfinished invalid draft may be edited but not submitted.

Theme and one saved draft use local browser storage. Theme changes affect only rendering. Multiplayer attempts continue to come from the server. The old browser-only sabotage experiment is restricted to solo and explicitly restarts an unscored preview; it cannot modify a competitive attempt.

## Playable deck topology (`src/shared/levels.ts`)

The wire format remains an 8×8 `Grid` of tile names. `getDeckTopology` derives public access positions from `ELEVATOR_A` and `ELEVATOR_B`. With lift A present, logical rows 1–2 / columns 5–6 belong to deck 1; with lift B present, rows 5–6 / columns 1–2 belong to deck 2. Otherwise those cells belong to deck 0. Each annex relocates four cells; it does not overlay an additional floor at the same coordinate. `validDeckAccess` requires each lift to stand on the main floor directly beside its own annex, and catalog caps allow only one of each.

`canTraverseDeck` permits only cardinal neighbors, and a deck change must have its corresponding lift as an endpoint. BFS expansion, A* expansion, frontier adjacency, agent execution, and human movement all check this function. Portals and reset traps keep their explicit teleport semantics. A `level` on replay steps is derived from the final coordinate and topology, so no extra level dimension is required in BFS state keys or network grids.

`facilityScene.ts` maps these sectors onto raised surfaces at heights 1.45 and 2.65, constructs a sloping bridge from each access cell to its legal annex neighbor, and interpolates the scout in all three axes. Pointer picking handles hardware and each active deck plane; half-open cell bounds assign exact grid seams to one sector. The eight outer platforms are separate playable sector destinations, selected through the orbital map rather than adjacent cells within this room. The blueprint fallback uses the same logical rules.

## 1. Dual-Solver AI Architecture (`src/shared/agent.ts` & `src/shared/solver.ts`)

The default and competitive escape AI is a deterministic, hand-authored search agent: partial-observation frontier exploration + A*, with persistent memory and replanning. This baseline uses no trained model or external AI service. Solo play can optionally select the model-backed objective policy described below. Timing metrics may vary, but the same board and memory produce the same decisions and movement steps.

A core engineering requirement of **Reverse Escape: Mind Wars** is the strict separation between the **Complete-Information Validation Solver** and the **Partial-Observation Autonomous Planning Agent**:

| System | Module | World Access | Algorithm | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Validation Engine** | `src/shared/solver.ts` | **Complete True Grid** | Exhaustive State-Space BFS over `(row, col, keyMask, switchMask, resetMask)` | Rejects impossible puzzles and computes the omniscient shortest path baseline |
| **Autonomous Escape Agent** | `src/shared/agent.ts` | **Partial observation** (`knownMap` from local sensors) plus public lift topology | Frontier Exploration + Inventory-Aware A* Search + Persistent Memory + Dynamic Replanning | Explores the room under fog of war, reacts to Decoy Beacons & Reset Traps, and adapts across attempts |

### How the Autonomous Agent Works (`runAutonomousAgent`)
1. **Observation Phase (`observeEnvironment`)**:
   - At each step, reveals tiles within Manhattan distance `R = 2` on the current deck into `knownMap`. Standing on a lift permits observation across decks within that radius; an active EMP reduces the radius to 1. Public lift locations do not reveal hidden room contents. Exit/decoy beacons can be sensed within radius 5 while EMP is inactive.
   - **Deception Modeling**: Untriggered `TRAP_RESET` plates appear as ordinary `EMPTY` floor tiles until stepped on (or unless already stored in `knownHazards` from a prior attempt). `DECOY_EXIT` tiles emit a long-range beacon signal identical to the true `EXIT` until the agent approaches within distance `1` and exposes the hologram.
2. **Objective & Frontier Selection (`selectNextObjectiveAndPlan`)**:
   - Evaluates candidate goals: known unverified Exit beacons, known uncollected keys, known switches (when a gate is blocked), and **Exploration Frontiers** (known walkable tiles adjacent to at least one unknown tile, scored by unseen neighbor count and beacon signal proximity).
3. **A* Route Planning (`planRouteAStar`)**:
   - Computes minimum-cost paths strictly through `knownMap` with current keys and switch polarity; inventory-changing interactions trigger replanning. This A* is not a full inventory-state search like BFS. Deck transitions cost 3 (ordinary step 1 + elevation 2), cryo cells cost 3, active remembered hazards add 45, and heavily revisited cells have a small penalty. Manhattan distance is an admissible heuristic for these costs.
   - Applies a `+45` step-cost penalty to remembered active reset/EMP coordinates (`knownHazards`), causing A* to automatically route around known traps on subsequent steps or attempts whenever a safer path exists.
4. **Cross-Attempt Memory Adaptation (`AgentMemory`)**:
   - After Attempt #1 finishes, `updatedMemory` retains `knownHazards` and `verifiedDecoys` (without revealing the rest of the hidden map).
   - Attempt #2 with `priorMemory` ignores verified decoys and penalizes remembered hazards. It need not improve every room; the starter currently takes the same number of moves on both attempts. This is memory-based adaptation, not model training.


## Server authority and verification

`MatchManager` validates submitted grids, computes BFS and both agent attempts, and publishes authoritative scores/results. Client builder validation is feedback only. Rendering, local saves, and solo remodel previews cannot alter competitive attempts. No protocol replacement or client-supplied path/score is introduced by the deck upgrade.

`tests/unit/levels.test.ts` checks legal/illegal lift placement, legal entry/return, blocked BFS and A* shortcuts, A* elevation cost, partial initial knowledge, deterministic starter paths, and visits to both annexes. `tests/e2e/game.spec.ts` exercises actual pointer editing of both raised decks at desktop/mobile sizes, manual blocked edges and both lifts, vertical scout interpolation, solo results, and two independent browser contexts completing PvP/rematch. Run `npm test`, `npm run build`, and `npm run test:e2e` for the current checkout; test coverage descriptions are not a claim of public deployment.


## Orbital sectors and authoritative human races

`src/shared/sectors.ts` defines the eight multiplayer race rooms and their orbital positions. `src/shared/expedition.ts` independently defines eight dedicated solo rooms, ordered challenges, hints and progress normalization. Both keep the existing 8×8 Grid. `PuzzleGrid.sectors` supplies the active destinations to `FacilityScene`, so the solo orbital map renders instanced miniatures of the actual solo layouts rather than the race rooms. Other scenes retain the race destinations by default.

`SectorMap` selects solo destinations in 3D or with normal buttons and launches `HumanPlayModal`. Successful human extraction alone unlocks the successor and records the lowest move count. A versioned device-local record stores the contiguous completed route, best scores and selected sector; malformed or locked selections normalize to an unlocked sector. Older shared-room progress is left in its former storage key, never assigned to unplayed new rooms. The next-sector action remounts the modal for a fresh inventory, switch polarity, mine state, move count and scene. Returning to the map or reloading preserves progress; unavailable storage falls back to session state with a visible message. Selecting another platform loads a separate room; this does not expand the wire grid or imply continuous walking through space between sectors.

`src/shared/movement.ts` is the pure human movement engine used by both solo exploration and server racing. It validates cardinal moves, walls, current inventory/polarity and lift topology, then applies pickup, portal, switch, reset and extraction effects. `MatchManager` owns race states. Clients send only `(dr, dc)`; the server checks the bound socket, shared start countdown and movement rate, applies the rules, advances extraction checkpoints and selects the first finisher. State broadcasts include rival position/progression, enabling the amber scout in `FacilityScene`. `RACING` and optional race fields extend match state; architect messages and the existing `Grid` stay compatible.

Reconnect credentials are serialized only to their owner. Lobby configuration is host-only; ready/build/submit/results/rematch/race actions require an active bound player socket. Spectators receive public positions but no movement authority. Progress messages are throttled before expensive validation. Malformed packets, oversized payloads and abandoned rooms are bounded. Race inventories, trap state and switches belong to each player independently.

The production build emits `dist/` and an external-dependency ESM server bundle in `dist-server/`. The multi-stage Dockerfile removes development tools and runs Node as an unprivileged user. Dokploy routes one HTTPS origin to port 3001 for assets, HTTP and WebSocket upgrades. `PUBLIC_ORIGIN` restricts browser handshake origins. Health, shutdown, payload limits, stale invites and browser reconnect behavior are covered by the deployment guide and smoke script. Matches remain in-process and are lost on redeployment; this release requires one replica.

## Optional Luna objective policy

`simulateAgent` is one generator-based engine. `runAutonomousAgent` completes it synchronously using the original deterministic objective scoring. `runAutonomousAgentAsync` pauses at objective decisions and asks a policy to select from already reachable candidates. It accepts only a matching candidate ID; it cannot accept a model-authored path, new coordinate, or altered world state. A* route generation, observations, inventory effects, legal deck edges, memory, and movement execution are shared between both runners. Single-candidate plans need no external choice.

`ObjectiveSnapshot` contains copied observed beliefs, public lift topology, inventory, remembered hazards/decoys, detected signals, visits, and candidate utilities/routes lengths. Hidden hazards remain believed floor; unknown cells remain absent. No true grid, BFS route, opponent room, player name, or reconnect credential reaches the model. A model choice cannot override the world's legality check. `LUNA_CHOICE` and `PLANNER_FALLBACK` events record what actually selected each objective; replay metadata counts each source.

`src/server/luna.ts` uses the OpenAI Decisions choice schema with model `gpt-6-luna`, server-side bearer authorization, fixed endpoint, supplied-value validation, cancellation, and a circuit that stops further provider calls after the first failure. One session spans both fresh/adapted attempts: at most eight calls, four seconds per call, and eight seconds in total, then baseline selection resumes. The router additionally limits two concurrent solo launches, one launch per IP per 30 seconds, and 60 provider requests/minute plus 1,000/day per process. Those limits reset on restart and are not a billing guarantee.

`POST /api/scout` validates the room locally before any paid call and returns a complete solo replay with its score. `LUNA_ENABLED=true` and `OPENAI_API_KEY` are both required for provider calls. Missing configuration still produces an explicitly identified fallback replay. Model non-escape stays a recorded outcome; BFS solvability is unchanged. The frontend also falls back locally if this endpoint is unreachable and cancels pending work on navigation. Shared competitive validation and the Grid/Socket.IO protocol are unchanged. Solo remodel runs use the deterministic baseline and their replay labels reflect this.

Luna is a pretrained model used for bounded objective selection. We do not train it, and its choices are not deterministic or guaranteed to outperform the baseline. Tests mock the provider to verify isolation, legality, protocol and failure handling; they are not evidence of live account access or game-playing quality.

## Challenge modes and persistence

The shared challenge helpers own the stable facility-link alphabet, validated UTC daily generation, ghost movement schedules and pure campaign rewards. Links contain public Grid snapshots rather than transient server references; decoding runs the full validator before rendering or remixing. Rewards extend the existing device-local progress record additively. Human completion supplies the actual movement trace; missions inspect its events. Ghost movement uses an independent deterministic scout trace and never shares human inventory or calls a model.

The daily router exposes `GET /api/daily`, `POST /api/daily/start` and `POST /api/daily/move`. Start issues a random run credential; move accepts that credential and a cardinal intent, never authoritative coordinates or a score. Movement legality, cooldowns, UTC expiry, origin checks, bounded new-run requests and session limits are server-owned. The same anonymous session identity can resume a run; restarting invalidates the previous credential. Only observed extraction records a result. Identity credentials are hashed before persistence and excluded from public rankings.

`DailyScoreStore` serializes atomic temporary-file/rename writes under `DATA_DIR`. It loads results at startup, keeps the best result per date/identity, caps history and prunes old dates. Unreadable or corrupt existing files are protected from overwrite; a persistence failure produces `rankingSaved: false`. Compose mounts a named volume at `/app/data`; a Dokploy Dockerfile application needs an equivalent application mount. This remains one replica, with active daily runs and multiplayer rooms in process.

`COOP` is an additive match mode using the existing lifecycle and `race:move` format. Dedicated co-op rooms use existing tiles and the existing Grid format. `moveCoop` shares key masks and derives phase polarity from actual pressure-pad occupancy, deliberately differing from ordinary toggle switches. MatchManager applies that shared state to both bound players, records individual extractions, and advances the team exactly once after both finish. Final completion sets team victory. Cooldowns, mines, EMP effects, private reconnect credentials and spectator restrictions remain enforced.

The rewind laboratory passes a validated original prefix to the agent’s local-only `resume` option. It restores discovered beliefs from the original static room, masking untriggered hazards and unverified decoys, then restores inventory, spent hazards, portal usage, visits and switch counts. A fresh observation at the checkpoint discovers only changes currently in view. The exact prefix stays unchanged; continuation uses the existing deterministic frontier + A* engine. HTTP/competitive callers never accept resume state. Branch playback starts at the edit point, with original-trace restoration and unchanged submitted scores.

## Campaign and endless adventure engine

`adventureContent.ts` defines a versioned room model: stable room/sector IDs, a legacy Grid adapter, entry/exit connections, derived deck-cell metadata, power circuits and their connected gates, turn-based pulses, optional terminals/salvage, par, and a cooperative solution dependency sequence. All 18 campaign rooms are authored; there are no physics-based freeform floors. The renderer derives actual legal decks from existing lifts. Grid and the original competitive network formats remain unchanged.

`adventure.ts` owns version 2 state, legal moves, shared cores/pressure pads, clock, powered circuits, discoveries, journal records, mastery, checkpoints and run upgrades. Effective grids turn powered gate cells into floor and unpowered gate cells into walls. Interaction checks proximity and deck accessibility. Required circuits must be restored before exit. Timed pulse entry is blocked during its active beats; wait advances the shared clock. ASTRA routes through observed beliefs with elevation/hazard-aware A* and can choose frontier goals, hold tasks, operate assigned consoles, or report blocked routes. The competitive scout continues to use its existing frontier+A* engine.

Endless selects a template from a difficulty-bounded pool and applies seeded candidate mutations. Complete-information validation executes the template's cooperative dependency sequence, using bounded searches over each actor's legal movement, waits, key/switch state and pulse phase. Hidden information is available to validation, never to the companion's goal planner. Generation is capped and retains a valid original template fallback. The cache is bounded. Branch choice changes subsequent seeded templates; reward selection, consumables and run identity remain in saves. Local careers merge best room mastery and archive terminal runs idempotently.

## Authoritative online expedition sessions

`ExpeditionManager` adds a separate `expedition:*` Socket.IO protocol (version 1). A public snapshot contains state, per-recipient seat/sequence, revision, ready/connection status and rematch votes. Requests accept intentions only. Each action is bound to a live socket's seat; the server validates action shape, sequence, cooldown, team presence, host-only checkpoint privileges and shared game rules. A duplicate accepted sequence returns the existing state without applying again. Revisions protect the client from stale acknowledgements. One-human sessions tick ASTRA on the server; two-human sessions give both actors independent control.

Credentials use the existing private browser token and are SHA-256 hashed in persistent session members. They never appear in public snapshots or rankings. Rebinding a seat revokes its former socket binding. Disconnected teams cannot move or advance. Either teammate can pause; rematches require all votes and get a fresh code, seed and counters. Anonymous identity is explicitly not authenticated account identity.

`ExpeditionStore` uses the Node built-in SQLite module, WAL, synchronous FULL and explicit transactions. Each accepted state and any terminal result commit together. Sessions load lazily by invite code after a process restart; seven-day stale checkpoints are cleaned up, and idle disconnected sessions leave memory after 30 minutes. Results are server-observed floors/moves with unique expedition codes. Storage failure rejects the action; autonomous persistence failure pauses the session and notifies clients. Existing architecture/race sessions retain their original in-memory lifecycle.

`AdventureScreen` renders either a local reducer or a controlled online snapshot. Online controls send actions and never mutate an authoritative state or import a local save. The screen shares its renderer, inventory, rule helpers and movement controls. Console markers and circuit lines are supplemental 3D overlays; the blueprint fallback and labeled machinery buttons remain available. Local and online careers are separate from verified rankings, and existing legacy save keys are retained.
