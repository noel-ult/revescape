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

The escape AI is a deterministic, hand-authored search agent: partial-observation frontier exploration + A*, with persistent memory and replanning. It uses no machine learning, training, LLM, or external AI service. Timing metrics may vary, but the same board and memory produce the same decisions and movement steps.

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

`src/shared/sectors.ts` defines eight complete rooms and their orbital positions. Each outer platform renders an instanced miniature of its actual room. `SectorMap` selects these destinations in 3D or with normal buttons, launches `HumanPlayModal`, and stores device-local completion only after extraction. A completed sector unlocks its successor. Selecting another platform loads a separate room; this does not expand the 8×8 wire grid or imply continuous walking through the space between sectors.

`src/shared/movement.ts` is the pure human movement engine used by both solo exploration and server racing. It validates cardinal moves, walls, current inventory/polarity and lift topology, then applies pickup, portal, switch, reset and extraction effects. `MatchManager` owns race states. Clients send only `(dr, dc)`; the server checks the bound socket, shared start countdown and movement rate, applies the rules, advances extraction checkpoints and selects the first finisher. State broadcasts include rival position/progression, enabling the amber scout in `FacilityScene`. `RACING` and optional race fields extend match state; architect messages and the existing `Grid` stay compatible.

Reconnect credentials are serialized only to their owner. Lobby configuration is host-only; ready/build/submit/results/rematch/race actions require an active bound player socket. Spectators receive public positions but no movement authority. Progress messages are throttled before expensive validation. Malformed packets, oversized payloads and abandoned rooms are bounded. Race inventories, trap state and switches belong to each player independently.

The production build emits `dist/` and an external-dependency ESM server bundle in `dist-server/`. The multi-stage Dockerfile removes development tools and runs Node as an unprivileged user. Dokploy routes one HTTPS origin to port 3001 for assets, HTTP and WebSocket upgrades. `PUBLIC_ORIGIN` restricts browser handshake origins. Health, shutdown, payload limits, stale invites and browser reconnect behavior are covered by the deployment guide and smoke script. Matches remain in-process and are lost on redeployment; this release requires one replica.
