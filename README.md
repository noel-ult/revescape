# REVERSE ESCAPE: MIND WARS
> **"You Build the Trap. The AI Finds a Way."**
> Built for **Devin Hacks Kochi 2026** | Theme: **Make Room for Play**

**Reverse Escape: Mind Wars** is a real-time multiplayer strategy game where two human architects engineer deceptive 8×8 escape rooms under an identical 30-point budget and challenge a **deterministic planning agent** operating under partial observation (Fog of War). It uses frontier exploration and A* search with memory and replanning. That baseline uses no trained model or external AI API. Solo Architect studio simulations additionally offer an optional **GPT-6 Luna Decisions + A*** mode: a pretrained model selects an observed, reachable objective, while the existing search engine plans and enforces the route. It falls back automatically when Luna is unavailable; competitive play keeps the deterministic baseline.

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

Lift topology is public architecture, but annex contents remain under partial observation. The scout approaches a lift to observe across decks, explores reachable frontiers, and plans through known cells. A* adds 2 movement-cost units for each deck change; full-map BFS still measures the shortest number of moves, not weighted energy cost. The 8×8 `Grid` remains unchanged and architect messages stay compatible; races add movement/progression events and fields. In-room decks are derived from lift placement. The eight outer platforms represent separate playable destinations selected through the orbital map. There are no freeform floors or physics-based navigation. Solo's **Remodel & re-run** restarts a modified preview and leaves the submitted score unchanged. Competitive PvP has no client-side remodel control.

---

## Orbital expedition and live multiplayer

Open **Solo expedition** for eight dedicated single-player sectors: **Docking perimeter**, **Quantum relay**, **Aerial archive**, **Coolant exchange**, **Echo containment**, **Prismatic vault**, **Twin observatories**, and **Blackout command**. Each has its own layout and challenge, separate from the multiplayer race rooms. Choose a destination in the 3D map or its accessible card list; the platform previews its actual room. Play with WASD, arrows or the touch D-pad. Extraction unlocks the next sector and offers **Next sector** directly. Completion, best move counts and your selected sector are saved on this browser/device. Each room starts with fresh inventory and trap state. Earlier completion of the former shared race-room campaign is kept in its old storage key and does not complete these new solo rooms.

The campaign progresses from navigation to a required portal crossing, an elevated access core, a phase-switch divider, reset mines and a decoy, three required keys, and two-deck extraction under an EMP field. Watching the scout or remixing a room in Architect studio does not complete a human challenge. These are separate rooms, alongside the two walkable raised annexes within individual rooms.

Multiplayer has two modes:

- **Architect duel:** the existing budgeted construction competition, with server-validated rooms, AI attempts, scores and rematches.
- **Live escape race:** both players start after one server countdown and race through eight shared race sectors. The race retains its original layouts, independently of the dedicated solo campaign. Cyan is your scout; amber is the rival when both are in the same sector. WASD, arrows and on-screen touch buttons send movement intentions; the server handles keys, switches, mines, lift transitions, checkpoints and the first-to-finish winner. Player inventories and switch states are independent. EMP fields narrow human sensors for six moves; cryo coolant delays the next move. The inventory panel shows collected access cores and phase polarity.

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
- Luna choice validation, hidden-information boundaries, missing-key/error/timeout fallback, bounded calls, and server-only simulation (`tests/unit/luna.test.ts`, `tests/unit/scout.test.ts`)
- Partial observability & fog-of-war discovery (`tests/unit/agent.test.ts`)
- Frontier exploration & A* pathfinding around obstacles (`tests/unit/agent.test.ts`)
- Decoy Exit investigation & Reset Pressure Plate recovery + Attempt #2 memory adaptation (`tests/unit/agent.test.ts`)
- Legal lift placement, blocked cross-deck BFS/A* shortcuts, elevation costs, and deterministic visits to both starter annexes (`tests/unit/levels.test.ts`)
- Complete-information state-space BFS validation (`tests/unit/solver.test.ts`, `tests/unit/validator.test.ts`)
- Mind Wars bounded scoring formula (`tests/unit/scoring.test.ts`)
- Eight dedicated solo layouts and eight race layouts, required solo mechanics, full manual-movement solution replays, saved campaign normalization, authoritative race checkpoints/winner/reconnect/rematch, and spectator/host permission boundaries (`tests/unit/expedition.test.ts`, `tests/unit/sectors.test.ts`, `tests/unit/race.test.ts`)
- Real-time 2-player Socket.IO multiplayer lifecycle (`tests/unit/multiplayer.test.ts`)
- Atomic module placement, rotation, caps, anchors, budget, and the starter station's actual portal/key/door sequence (`tests/unit/validator.test.ts`)

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Browser tests cover optional Luna launch with server/network fallback, 3D placement (including grid seams and both raised surfaces), save/restore, undo/redo, interpolated lift movement, follow camera, manual lift entry/return and blocked edges, desktop/mobile layouts, solo results, a complete two-browser architect match/rematch, an eight-sector solo playthrough at mobile size using keyboard and on-screen controls, next-sector resets and saved best scores, 3D destination picking, expired invites, and a live desktop-versus-touch-mobile race with checkpoint/reconnect recovery. The test configuration enables Chromium's software WebGL renderer for machines without an available GPU.

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

Every competitive room is evaluated deterministically on the server by comparing the **Autonomous Fog-of-War Agent** against the **Omniscient BFS Validation Solver**:
- **35% Optimal BFS Path Length (`0 – 350 pts`)**: Structural maze complexity measured by the omniscient shortest path.
- **30% Exploration & A* Replanning Effort (`0 – 300 pts`)**: State-space branching and number of dynamic A* replanning events forced on the AI.
- **20% Deception & Trap Impact (`0 – 200 pts`)**: Rewards exploration overhead (`actualAgentSteps - optimalBfsSteps`), triggered Reset Pressure Plates, and investigated Decoy Exit Beacons.
- **15% Meaningful Lock/Switch Interactions (`0 – 150 pts`)**: Counts only keys, doors, and switch gates actually used along the solution route.

## Optional Luna scout

In the solo studio, choose **Luna Decisions + A*** under **Expedition scout**, then **Launch expedition**. The builder preview and its metrics still show the deterministic baseline. The arena/results use the selected run; its explainer reports actual model and fallback choice counts. Luna can change objective choices, so these solo scores are sandbox comparisons, not competitive scores. The landing preview, human races, and architect duels keep their existing rules.

Enable the model on the Node server using `LUNA_ENABLED=true` and `OPENAI_API_KEY` as a secret. No key belongs in client code or any `VITE_` variable. Missing configuration, refused/invalid choices, API errors, timeout, and quota exhaustion use deterministic frontier scoring. A failed model exploration is displayed as a failed run; it does not invalidate a BFS-solvable room. The game does not train a model, and memory adaptation remains explicit remembered coordinates rather than machine learning.

The integration uses the official [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions), `POST /v1/decisions`, model `gpt-6-luna`. Only a partial-observation snapshot and reachable objective choices are sent, never the true grid or player identity. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup and limits. Mocked integration tests verify the API contract and failure handling; a live Luna response requires your API key and has not been verified by those tests.

### Ghost races, missions and sharing

- **Race the AI ghost:** choose this action on a solo sector or shared facility. A three-second countdown starts you alongside the amber deterministic frontier + A* scout. Its normal movement takes 350 ms per move, with longer coolant crossings. Inventories and switches are independent. EMP hides the ghost while your sensors are jammed. Extraction still advances the campaign if the scout wins; a human victory earns a saved ghost badge. No model API is called.
- **Three stars per sector:** earn one for extraction, one for matching or beating the scout’s move count, and one for the displayed bonus mission. Bonuses include a clean escape, stepping on the decoy, visiting both decks or surviving the EMP. Best stars and ghost victories stay on this device. Previously completed sectors keep completion and receive one completion star.
- **Share facility:** generate a playable snapshot link from Architect studio. A friend can open it in another browser, escape it, race its scout or remix the exact layout. Links encode a versioned compact Grid and pass the same budget, anchor, lift and solvability checks. Editing the studio does not change an existing snapshot; use **Update challenge link**. Clipboard failure leaves a selectable link.

### Daily challenge and verified rankings

**Play today’s daily challenge** opens a date-seeded room shared by all players, resetting at 00:00 UTC. Only room mutations that pass BFS validation and the deterministic scout are accepted. Start or resume with a callsign and play using WASD, arrows or movement buttons. The server owns position, inventory, cooldowns and score; claimed client scores are ignored. Extraction records one best result per anonymous browser-session identity. The public table shows the 25 lowest move counts, with earlier completion breaking equal scores. Callsigns are player-provided, not authenticated accounts.

Rankings use atomic writes to `DATA_DIR/daily-scores.json`, retaining at most 500 scores per day for 31 days. Active runs are in process and expire on restart or UTC rollover. Mount `/app/data` persistently in Dokploy to retain scores across deployments; Compose defines this volume. Failed writes are reported as unsaved rankings. Corrupt existing storage is not overwritten automatically.

### Co-op expedition

Two players cooperate through three dedicated missions. Recovered access cores are shared instantly. In co-op, a phase switch is a pressure pad: one player stays on it while the teammate crosses its gate and recovers a core that opens the holder’s bypass. Both must extract before the team advances. Later rooms split the search across raised decks. EMP and spent mines stay individual. Movement, shared inventory, checkpoints and team victory are server-authoritative; invite, reconnect and rematch use the existing room flow.

### Decision rewind

In a solo AI arena, pause or scrub **Replay step**, inspect the scout’s knowledge, and replace one cell with a wall, clear floor, cryo field or EMP in **Decision rewind**. **Compare continuation** validates the edit and resumes from that state with the actual keys, polarity, discovered map, masked hazard beliefs, spent mines, portal usage and original replay prefix. Lift topology stays fixed during a rewind; redesign decks in the studio. Hidden edits are learned through observation. Continuations use deterministic frontier + A*, including when the retained prefix used Luna; no new model call is made. **Restore original replay** recovers the original trace. Submitted scores stay unchanged, and this editor is not available in competitive matches.

## Expedition revamp

The command deck offers **Continue adventure**, **Endless expedition**, and **Play online expedition**, alongside all previous modes.

### Campaign: six sectors, 18 rooms

Restore Docking Ring, Power Foundry, Cryo Research, Signal Archive, Sky Observatory and Command Nexus. Each sector has three connected rooms with its own layout and objectives. Later sectors combine powered relay circuits, occupied pressure pads, access cores, raised decks, pulse barriers, decoys and EMP. Restore all required relays before extraction. Every room requires both explorers to reach the exit.

ASTRA follows commands: Follow, Hold, Interact, Regroup and Scout. Interact assigns a discovered tile and holds there; at a relay or terminal ASTRA operates the console. The companion chooses goals and uses A* through shared discoveries, respects deck boundaries, avoids known reset mines, and reports blocked tasks. Scouting chooses reachable frontiers with undiscovered neighbors. It uses deterministic planning and explicit memory, with no training or model API calls. The optional Luna studio mode remains separate.

Use **Systems & discoveries** to operate a neighboring relay or recover a station log. Lines in the 3D scene connect relays to their gates; labels report power and pulse state. Pulses advance on successful human movement, machinery interaction or **Wait one beat**, so they are readable tactical hazards rather than reaction tests. EMP narrows sensors. Optional salvage and recovered logs persist in the career journal. Escalating hints reveal objectives, guidance, then suggested coordination.

Each completed campaign room earns an extraction star, a par star when the combined explorer move count meets its par, and a clean-run star for avoiding reset mines. Best mastery persists across restarts. Amber and violet console cosmetics unlock after 3 and 9 mastered rooms; cosmetics do not change rules. Checkpoints unlock the next sector; orbital navigation previews the six actual destinations and lets you revisit unlocked sectors between rooms.

### Endless runs

Endless uses seeded, validated cooperative puzzle templates. Difficulty increases the template pool and bounded obstacle/hazard mutations. A mutation is accepted only if an authored sequence of cooperative dependencies can still be completed through legal move/wait/interaction searches. Generation has a bounded attempt budget and falls back to the validated original template. There is no guaranteed outer-corridor bypass.

Three rooms form a floor. At floor checkpoints choose an upgrade, extract, or continue. Maintenance and Signal routes select different deterministic puzzle branches. Integrity begins at 3, repairs cap at 5, reset mines cost integrity, and zero ends the run. Shields absorb one loss; scanners reveal nearby cells once; cryo stabilizers shorten human coolant recovery; scout modules enable autonomous companion exploration. Duplicate installed modules convert to integrity repair. Seeds, branch choices, rewards, collected records and consumed upgrades survive resume; reloading cannot reroll them. Terminal runs are archived once in the career with best floor and run count.

### Online adventure and endless

Choose one human with ASTRA or two human explorers. Create a private expedition, share its invite, and ready the team. Both modes use the same adventure engine with the Node server owning movement, machinery, timers, upgrades, progression and completion. Two-human sessions pause progression while either player is disconnected. Either player can pause; the host selects destinations, checkpoint upgrades and extraction. Two humans control their own explorers and cannot issue ASTRA commands to one another.

Socket messages are versioned and numbered per seat. Duplicate actions cannot apply twice; stale, malformed, unbound or forged actions are rejected. Reconnect credentials are hashed in storage and never broadcast. Refresh restores the seat and checkpoint; server restarts also recover from SQLite. Credentials live in the originating browser tab's session storage; invite codes alone cannot take an occupied seat. There are no authenticated accounts or automatic cross-device credential recovery.

Completed online endless runs enter a server-verified results table ordered by floors, then moves. Callsigns are anonymous; this is not account authentication or sophisticated bot detection. Local imported saves never enter online sessions or verified results. Rematch requires both players' votes and opens a fresh expedition without overwriting the previous result.

### Saves and deployment

Local version 1 expedition saves migrate to version 2, preserving the completed Docking Ring and unlocking the remaining campaign. Legacy solo and architect saves remain separate. Local adventure and career progress stay on this device; export/import transfers adventure saves. Online state and verified results use `DATA_DIR/expeditions.sqlite` with WAL and atomic transactions; keep the entire data directory mounted persistently. Existing races and architect duels still live in memory.

Use Node **22.13 or newer** (the production Dockerfile uses Node 22). `EXPEDITIONS_ENABLED=false` disables new online expedition creation/joining for rollout or rollback while existing game modes remain available. Keep one server replica. See [DEPLOYMENT.md](DEPLOYMENT.md) and [REVAMP_ROADMAP.md](REVAMP_ROADMAP.md).

## Operations interface

The interface has been replaced with a scene-led mission launcher, desktop navigation rail, mobile bottom navigation, charcoal/warm-white typography and orange action controls. Adventure uses a floating command HUD; the studio has a wide drafting surface with a right-hand construction tray. Lobbies, replay, results, challenges and portal dialogs share the new material system. The former landing/navigation markup, cyber-card styles and stacked legacy stylesheet have been removed. Game rules, saves and multiplayer protocols remain compatible.
