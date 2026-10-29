# Game interaction contract

The user-requested scope is playable orbital levels, preserved architect PvP, live human escape races, and deployment through Dokploy. Game rules are owned by `src/shared/movement.ts`, `levels.ts`, `sectors.ts`, and server `MatchManager`.

| Capability | Owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native selects | LandingPage / BuilderScreen / DecisionRewind | Platform popup accepted | Lobby, scout selection and rewind browser tests |
| Form | LandingPage + server acknowledgements | MatchManager | Join/create; inline errors and bounded timeout | Multiplayer browser tests |
| Scrollbar | Global application stylesheet | DESIGN.md | Dialog/catalog geometry only | Desktop/mobile review |
| Status | Inline role=status / role=alert | Owning screen | Blocked movement, connection, invite failure | Race and invitation tests |
| Dialog | useGameDialog + body portal | HumanPlayModal / HowToPlayModal | Exploration / campaign / guide | Keyboard, Escape, focus return, inert background |
| 3D input | FacilityView + FacilityScene | Shared topology + sector catalog | Cell editing / sector selection | Pointer and raised-deck browser tests |

Solo campaign completion is device-local and only recorded after reaching the sector exit. It unlocks the following destination. Remixing or watching an AI run does not complete a human level.

Architect PvP retains its budget, server validation, scoring and existing room lifecycle. Only the connected player's socket can ready, edit, submit, rematch or advance results. Only the host can configure a lobby. Opponent reconnect credentials are never broadcast.

Live races use the same fixed sector order for both players. After a common server countdown, clients send only cardinal movement intents. The server owns inventory, lift access, traps, checkpoint changes and the winner. Each player has independent inventory and switches. Portal and reset effects retain their existing semantics. Race completion is the final exit, not a client-submitted score. Spectators cannot move players.

Reconnect restores the server-owned player state while the process remains alive. Leaving a lobby frees the seat and transfers host ownership. Leaving an active game disconnects that player. Matches are in memory; restarting or redeploying the single game instance loses them. The UI reports a missing saved room and allows creating another. Persistent accounts, database-backed saves and multiple game replicas are outside this deployment.

## Additional challenges

Campaign rewards are local and additive: prior completion remains completed with one star. A completed human trace earns par/mission stars and optional ghost victory; losing a ghost race never blocks extraction progress. Ghosts use independent deterministic traces and a shared three-second start, with no competitive model calls.

Shared facilities are versioned public Grid snapshots. Full validation runs before play or remix; invalid links show an owned error and a home action. Clipboard failure retains a selectable snapshot URL. Daily play is a server-owned movement session; completed scores are written atomically to persistent application storage. Names are anonymous and self-provided; accounts and identity verification remain out of scope. UTC rollover or expired server state offers a fresh challenge, and failed persistence is reported accurately.

Co-op shares recovered keys, uses occupied pressure pads for gates, and requires both teammates at extraction. Individual traps, EMP and cooldowns are preserved. Only the bound player socket can move; disconnected teammates can reconnect, and one extracted player waits for the other. This mode uses three dedicated missions with the existing Grid and movement-intent format.

The solo rewind editor owns a native component select and numeric row/column inputs with inline validation. It resumes from the paused replay state, preserves original knowledge/prefix, makes a deterministic continuation and offers original restoration. Competitive scoring and controls never accept a rewind edit.

## Adventure behavior

`AdventureScreen` owns local adventure sessions, with rules in shared `adventure.ts` and room data in `adventureContent.ts`. Companion commands use discovered cells and shared legal movement. Hold/Interact persist until a new command; regroup follows the player. Both explorers must extract. Keyboard movement pauses for guide overlays, editable inputs, pause, restart confirmation and import. Room transitions reset transient inventory and observations. Device saves are separate from all legacy progression; storage failures offer export. Import validates version, mode and state before replacing the session. Restart uses inline confirmation. Endless seeds and rewards persist so resuming cannot reroll them. No online ranking is claimed for these local runs.

## Complete adventure and online protocol

Circuit interaction requires proximity and legal deck access. Pulse barriers advance on actual human actions or Wait; indicators and 3D markers expose their state. Both explorers must extract; all required relays must be powered. Sector travel is allowed only between rooms, to unlocked destinations. Hints and recovered logs are journal content; cosmetic unlocks do not change competitive rules.

Online expedition state is a controlled server snapshot. No imported save, client position, score or inventory is accepted. Per-seat sequences prevent duplicate effects, revisions prevent stale UI rollback, and only the bound socket can act. Team absence or pause blocks progression; the host alone chooses upgrades, branches, travel and extraction. Two humans cannot command one another as a bot. SQLite transactions preserve checkpoints/results across server restarts, while old race/duel rooms keep their prior memory lifecycle. Online credentials remain private and are stored in the originating tab; anonymous names are not authenticated accounts.

Native form/select ownership applies to the online setup. Loading/pending/timeout/storage errors retain recovery actions. In-app confirmation protects local restart; online rematches require all votes and produce a fresh session. New sessions are saved before advertising success. Export/import is disabled for online state. Console accents and careers persist locally, independently of verified rankings.

## Operations UI replacement

The previous visual stylesheet and landing/navigation markup are removed. `Navbar` owns the rail/bottom navigation and utility line; `LandingPage` owns the scene-led launcher and private-match terminal. The shared panel primitive is `interface-panel`; the old cyber-card styling is retired. `architect-btn` remains a behavior-compatible shared control hook with entirely new tokens. Native selects and `useGameDialog` retain canonical ownership.

The studio places the construction tray to the right on desktop and below the world on mobile. The adventure HUD floats within the full-width world on desktop and stacks on narrow screens. Fixed chrome reserves page space, while portal dialogs render above navigation. New UI changes must preserve legal placement, lift visibility, movement, save/restore, competitive authority and existing network formats.
