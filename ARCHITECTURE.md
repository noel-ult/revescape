# Technical Architecture — Reverse Escape: Mind Wars

## 3D presentation and construction

`PuzzleGrid.tsx` is the shared, lazy-loaded entry point for the Three.js renderer used by the landing simulation, builder, arena, and human exploration modal. `FacilityView.tsx` owns the React camera controls and WebGL fallback. `facilityScene.ts` owns the scene, procedural geometry, materials, lighting, shadows, camera, pointer projection, and render loop.

The renderer consumes `SolverStep` / `AgentSimulationStep` data. It interpolates between adjacent navigation positions, articulates the robot's legs and heading, and uses a disappear/reappear animation for teleport events. Replay seeks snap directly to the selected state rather than drawing a path through walls. Scene animation never writes simulation state, scores, or multiplayer results. Fog visibility and hidden hardware derive from the current agent snapshot.

The canvas uses a bounded pixel ratio and shadow resolution; offscreen/hidden canvases skip rendering. ResizeObserver keeps cameras fitted to their containers. Unmounting disposes geometry, shared materials, controls, observers, animation frames, and WebGL contexts. A context failure selects the blueprint renderer, preserving editing and gameplay.

`src/shared/facility.ts` defines room modules and atomic, rotated placement. It produces the same `Grid` consumed by the existing validators and multiplayer protocol, so no new client-trusted game rules or network format is introduced. Module placement rejects overlap, out-of-bounds cells, anchor changes, excess budget, and component-cap violations. Solvability remains checked by `validateBoard`; an unfinished invalid draft may be edited but not submitted.

Theme and one saved draft use local browser storage. Theme changes affect only rendering. Multiplayer attempts continue to come from the server. The old browser-only sabotage experiment is restricted to solo and explicitly restarts an unscored preview; it cannot modify a competitive attempt.

## 1. Dual-Solver AI Architecture (`src/shared/agent.ts` & `src/shared/solver.ts`)

A core engineering requirement of **Reverse Escape: Mind Wars** is the strict separation between the **Complete-Information Validation Solver** and the **Partial-Observation Autonomous Planning Agent**:

| System | Module | World Access | Algorithm | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Validation Engine** | `src/shared/solver.ts` | **Complete True Grid** | Exhaustive State-Space BFS over `(row, col, keyMask, switchMask, resetMask)` | Rejects impossible puzzles and computes the omniscient shortest path baseline |
| **Autonomous Escape Agent** | `src/shared/agent.ts` | **Partial Observability Only** (`knownMap` within Manhattan radius `2`) | Frontier Exploration + Inventory-Aware A* Search + Persistent Memory + Dynamic Replanning | Explores the room under fog of war, reacts to Decoy Beacons & Reset Traps, and adapts across attempts |

### How the Autonomous Agent Works (`runAutonomousAgent`)
1. **Observation Phase (`observeEnvironment`)**:
   - At each step, reveals tiles within Manhattan distance `R = 2` into `knownMap`.
   - **Deception Modeling**: Untriggered `TRAP_RESET` plates appear as ordinary `EMPTY` floor tiles until stepped on (or unless already stored in `knownHazards` from a prior attempt). `DECOY_EXIT` tiles emit a long-range beacon signal identical to the true `EXIT` until the agent approaches within distance `1` and exposes the hologram.
2. **Objective & Frontier Selection (`selectNextObjectiveAndPlan`)**:
   - Evaluates candidate goals: known unverified Exit beacons, known uncollected keys, known switches (when a gate is blocked), and **Exploration Frontiers** (known walkable tiles adjacent to at least one unknown tile, scored by unseen neighbor count and beacon signal proximity).
3. **A* Route Planning (`planRouteAStar`)**:
   - Computes minimum-cost paths strictly through `knownMap`.
   - Applies a `+45` step-cost penalty to remembered `TRAP_RESET` coordinates (`knownHazards`), causing A* to automatically route around known traps on subsequent steps or attempts whenever a safer path exists.
4. **Cross-Attempt Memory Adaptation (`AgentMemory`)**:
   - After Attempt #1 finishes, `updatedMemory` retains `knownHazards` and `verifiedDecoys` (without revealing the rest of the hidden map).
   - Running Attempt #2 with `priorMemory` demonstrates measurable step reduction as the AI ignores known decoys and routes around remembered reset plates.
