# Reverse Escape: Expedition — delivery map

## Phase 1: foundation

Implemented command deck, connected Docking Ring, ASTRA commands, local save migration/export/import, checkpoint loop, pause/restart and responsive HUD. Original solo challenge maps, studio, duels, races, sharing, daily challenges and rewind remain available.

## Phase 2: adventure and progression

Implemented all six sectors / 18 rooms, powered circuits, pulse timing and wait actions, shared inventory/pad dependencies, raised-deck tasks, station records, salvage, escalating hints, three-star mastery, career persistence and cosmetic console unlocks. Orbital navigation previews the actual six sector entry rooms and revisits unlocked destinations at checkpoints. Rooms adapt the existing Grid; the engine does not provide arbitrary overlapping/freeform floors.

## Phase 3: endless expeditions

Implemented seeded cooperative templates with bounded validated mutations and fallback, difficulty tiers, three-room floors, seeded branch choices, five upgrade types, consumable tracking, integrity/failure, extraction, resumable runs and idempotent career archives. Validation searches legal movement/wait paths through an authored dependency sequence; it does not claim to solve arbitrary procedurally invented puzzle dependencies.

## Phase 4: online and operations

Implemented a separate versioned, sequenced Socket.IO protocol, one-human/ASTRA and two-human configurations, private seat recovery, host privileges, disconnection pause, rematch votes, SQLite/WAL checkpoint transactions, persisted server-verified endless results and operator disable flag. Node 22.13+ and the existing persistent data directory are required. Accounts and cross-device cloud identity remain outside this release.

## Verification and release

Unit coverage executes the full campaign with both controlled actors and the actual ASTRA planner; validates generated rooms, hazards/upgrades, profile idempotency, forged/duplicate actions, full online campaign, SQLite restart recovery and endless results/rematch. Browser coverage exercises machinery, records, local checkpoints, mobile endless, two-browser online movement/cooperation, pause and reconnect, plus the original mode regression suite.

A successful local check is not evidence of public deployment. Production Docker image verification requires Docker or the repository CI runner; deployment retains one instance and a mounted DATA_DIR. Keep the previous image available for rollback; EXPEDITIONS_ENABLED=false disables new online expeditions independently of old modes.
