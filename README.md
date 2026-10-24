# REVERSE ESCAPE: MIND WARS
> **"You Build the Trap. The AI Finds a Way."**
> Built for **Devin Hacks Kochi 2026** | Theme: **Make Room for Play**

**Reverse Escape: Mind Wars** is a real-time multiplayer strategy game where two human architects engineer deceptive 8×8 escape rooms under an identical 30-point budget and challenge a **deterministic planning agent** operating under partial observation (Fog of War). It uses frontier exploration and A* search with memory and replanning. It uses no machine learning, trained model, LLM, or external AI API.

Unlike conventional maze games where the AI sees the entire map, the **Mind Wars Autonomous Agent**:
1. **Starts Blind (Partial Observability)**: Observes only a local Manhattan radius (`R = 2`) plus long-range unverified exit beacon signals.
2. **Explores Unknown Frontiers**: Evaluates reachable frontier cells bordering unexplored territory using information-gain heuristics.
3. **Plans Routes with A* Search**: Computes optimal routes through its currently known map while respecting inventory keys, switch states, and hazard costs.
4. **Falls for & Exposes Human Deception**: Investigates **Decoy Exit Beacons** (`DECOY_EXIT`) and triggers hidden **Reset Pressure Plates** (`TRAP_RESET`) that teleport it back to Spawn `(0,0)`.
5. **Replans Dynamically & Adapts Across Attempts**: Records discovered traps and fake exits in persistent **Agent Memory**, dynamically recalculating A* routes and using that memory on **Attempt #2 (Adapted Memory)**. Improvement depends on the room; some attempts take the same number of steps.

Meanwhile, a separate **Complete-Information State-Space BFS Validation Solver** verifies every submitted room on the server so impossible rooms can never enter a match.

## 3D Facility Architect

The primary game surface is now a Three.js facility with connected walls, raised bulkheads, animated portal rings, access-core pedestals, coolant fields, and an articulated scout. The navigation rules still use the shared 8×8 engine; the renderer interpolates the engine's actual steps rather than choosing its own route.

- **Room modules:** Place and rotate security wings, transit chambers, cryo laboratories, signal observatories, phase airlocks, and gallery partitions. A module is one undoable edit. Placement checks the footprint, anchors, collisions, component caps, legal lift locations, and the shared energy budget.
- **Detailed construction:** Switch to Components for individual structures. Click or drag to build; right-click to erase. The validity panel updates after edits.
- **Camera controls:** Right-drag to orbit while building; drag normally during playback. Scroll or use the +/− buttons to zoom. Plan gives an overhead view; Follow AI tracks the scout. Use two fingers to orbit/zoom on touch screens.
- **Setups and environments:** Solo opens in the Orbital Research Station, where the scout visits both raised decks through lift bridges, traverses a portal, collects access cores, and unlocks the extraction doors. The setup library includes three other validated facilities. Ion, Ember, and Void change materials and lighting without changing competitive rules.
- **Simulation and exploration:** Simulate AI previews the real run at a readable pace; pause it or return to building. Explore yourself uses WASD, arrows, or touch controls. Launch expedition opens the full arena with replay, fog, adaptation, and results.
- **Save design:** Stores one draft on the current browser/device. Restore it from the setup library. Save storage is local, not a cloud account.
- **Fallback:** The toolbar's blueprint control provides a conventional accessible editor; it also appears automatically when WebGL is unavailable. Reduced-motion preferences disable ambient animation and shorten movement presentation.

The facility supports the main floor (deck 0) and two playable 2×2 raised annexes. Place **Aerial annex lift (`ELEVATOR_A`)** on the main floor immediately beside logical rows 1–2, columns 5–6, or **Sky observatory lift (`ELEVATOR_B`)** beside rows 5–6, columns 1–2 (zero-based). Each lift costs 1 point, with one of each allowed. The starter facility includes both. Keys, traps, walls, and other components can be placed on the raised surfaces with the same pointer editor.

A lift activates its annex: those four existing grid cells move onto the raised deck, rather than creating additional cells. Without that lift they remain ordinary main-floor cells. Movement between an active annex and the main floor must pass through its matching lift; neighboring logical cells across any other deck edge are inaccessible. BFS, A*, frontier selection, and manual play share this rule. Existing portal/reset teleport effects remain explicit exceptions to adjacent movement. Visible bridges connect the lift pads to the raised surfaces, and the scout interpolates vertically along them.

Lift topology is public architecture, but annex contents remain under partial observation. The scout approaches a lift to observe across decks, explores reachable frontiers, and plans through known cells. A* adds 2 movement-cost units for each deck change; full-map BFS still measures the shortest number of moves, not weighted energy cost. The 8×8 `Grid` and Socket.IO messages keep their existing format; levels are derived from lift placement. Decorative towers beyond these annexes remain scenery. There are no freeform floors or physics-based navigation. Solo's **Remodel & re-run** restarts a modified preview and leaves the submitted score unchanged. Competitive PvP has no client-side remodel control.

---

## Orbital expedition and live multiplayer

The surrounding platforms now represent **eight playable sectors**, each with its own layout and objective: Arrival dock, Wormhole terminal, Aerial research wing, Cryogenic reactor, Mirage observatory, Chromatic vault, Skybridge complex, and Orbital command. Open **Explore the orbital levels** to choose a platform in the 3D sector map or its accessible card list. Escape a level yourself to unlock the next one; completion is saved on this browser/device. Watching the scout or remixing a room does not complete the human challenge. These are separate rooms connected by extraction checkpoints, alongside the two walkable raised annexes within a room.

Multiplayer has two modes:

- **Architect duel:** the existing budgeted construction competition, with server-validated rooms, AI attempts, scores and rematches.
- **Live escape race:** both players start after one server countdown and race through the same eight sectors. Cyan is your scout; amber is the rival when both are in the same sector. WASD, arrows and on-screen touch buttons send movement intentions; the server handles keys, switches, mines, lift transitions, checkpoints and the first-to-finish winner. Player inventories and switch states are independent. EMP fields narrow human sensors for six moves; cryo coolant delays the next move. The inventory panel shows collected access cores and phase polarity.

Invite URLs join a room across devices. Refresh/reconnect restores server-owned progress while the server remains running. Spectators can watch but cannot move either player. Opponent session tokens are private. Leaving a lobby frees the slot and transfers host ownership if necessary.

For **Dokploy**, use the root Dockerfile as a single Application, route your HTTPS domain to container port **3001**, and keep one replica. The full setup, operational limits and live WebSocket smoke check are in [DEPLOYMENT.md](DEPLOYMENT.md). Production runs compiled JavaScript with development dependencies removed.

## Quick Start (Local Development & Production)

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode (Live Reload Frontend + Backend)
```bash
npm run dev
```
- Frontend Vite dev server: `http://localhost:5173`
- Backend Express + Socket.IO server: `http://localhost:3001`

### 3. Production Build & Start
```bash
npm run build
npm run start
```
- Launches the unified server at `http://localhost:3001`.

### 4. Run Automated Tests
```bash
npm test
```
Runs Vitest unit & Socket.IO integration tests covering:
- Partial observability & fog-of-war discovery (`tests/unit/agent.test.ts`)
- Frontier exploration & A* pathfinding around obstacles (`tests/unit/agent.test.ts`)
- Decoy Exit investigation & Reset Pressure Plate recovery + Attempt #2 memory adaptation (`tests/unit/agent.test.ts`)
- Legal lift placement, blocked cross-deck BFS/A* shortcuts, elevation costs, and deterministic visits to both starter annexes (`tests/unit/levels.test.ts`)
- Complete-information state-space BFS validation (`tests/unit/solver.test.ts`, `tests/unit/validator.test.ts`)
- Mind Wars bounded scoring formula (`tests/unit/scoring.test.ts`)
- Eight validated sector layouts, shared human movement, authoritative race checkpoints/winner/reconnect/rematch, and spectator/host permission boundaries (`tests/unit/sectors.test.ts`, `tests/unit/race.test.ts`)
- Real-time 2-player Socket.IO multiplayer lifecycle (`tests/unit/multiplayer.test.ts`)
- Atomic module placement, rotation, caps, anchors, budget, and the starter station's actual portal/key/door sequence (`tests/unit/validator.test.ts`)

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Browser tests cover 3D placement (including grid seams and both raised surfaces), save/restore, undo/redo, interpolated lift movement, follow camera, manual lift entry/return and blocked edges, desktop/mobile layouts, solo results, a complete two-browser architect match/rematch, solo sector unlocks, 3D destination picking, expired invites, and a live desktop-versus-touch-mobile race with checkpoint/reconnect recovery. The test configuration enables Chromium's software WebGL renderer for machines without an available GPU.

For two devices on the same network, run the production server and open `http://<server-LAN-IP>:3001` on both devices. For hosting, use a Node service with `npm install`, `npm run build`, and `npm start`; set `PORT` to the host's assigned port. Forward WebSocket upgrades for `/socket.io/` and use `/api/health` for health checks. Keep one Node instance unless match storage is moved to a shared service. Matches live in memory and are lost on restart. No public deployment is included in the local setup.

---

## Trap & Deception Component Catalog (30-Point Budget)

| Component | Cost | Max | Gameplay Mechanic |
| :--- | :---: | :---: | :--- |
| **Laser Wall (`WALL`)** | 1 pt | 22 | Impassable barrier; blocks movement and forces frontier detours |
| **Decoy Exit Beacon (`DECOY_EXIT`)** | 3 pts | 2 | Broadcasts a fake exit signal through the fog of war, luring the AI to investigate until distance 1 |
| **Reset Pressure Plate (`TRAP_RESET`)** | 3 pts | 2 | Hidden hazard (looks like empty floor in AI fog view!); teleports AI back to `(0,0)` once per run and is recorded in AI memory |
| **Crimson / Cobalt / Solar Keys** | 2 pts | 1 ea | Collected on entry; unlocks matching security doors |
| **Crimson / Cobalt / Solar Doors** | 2 pts | 2 ea | Passable only after the AI discovers and collects the matching key |
| **Pulse Switch (`SWITCH_A`)** | 3 pts | 2 | Toggles phase polarity (`0 ↔ 1`), flipping Open and Closed Gates |
| **Closed / Open Phase Gates** | 2 pts | 2 / 1 | Passable only when Pulse Switch is ON (`1`) or OFF (`0`) respectively |
| **Quantum Wormhole (`PORTAL_A`)** | 2 pts | 2 | A linked pair teleports the scout between chambers |
| **EMP Jammer (`EMP_SCRAMBLER`)** | 2 pts | 2 | Temporarily reduces the scout's vision |
| **Cryo Field (`GRAVITY_MUD`)** | 1 pt | 6 | Adds route cost to the scout's planner |
| **Aerial / Sky Lift (`ELEVATOR_A` / `ELEVATOR_B`)** | 1 pt | 1 ea | Activates its matching raised 2×2 annex and provides the only adjacent cross-deck access |

---

## Mind Wars Bounded Scoring Formula (`0 – 1,000 Pts`)

Every submitted room is evaluated deterministically on the server by comparing the **Autonomous Fog-of-War Agent** against the **Omniscient BFS Validation Solver**:
- **35% Optimal BFS Path Length (`0 – 350 pts`)**: Structural maze complexity measured by the omniscient shortest path.
- **30% Exploration & A* Replanning Effort (`0 – 300 pts`)**: State-space branching and number of dynamic A* replanning events forced on the AI.
- **20% Deception & Trap Impact (`0 – 200 pts`)**: Rewards exploration overhead (`actualAgentSteps - optimalBfsSteps`), triggered Reset Pressure Plates, and investigated Decoy Exit Beacons.
- **15% Meaningful Lock/Switch Interactions (`0 – 150 pts`)**: Counts only keys, doors, and switch gates actually used along the solution route.
