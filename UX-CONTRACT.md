# Game interaction contract

The user-requested scope is playable orbital levels, preserved architect PvP, live human escape races, and deployment through Dokploy. Game rules are owned by `src/shared/movement.ts`, `levels.ts`, `sectors.ts`, and server `MatchManager`.

| Capability | Owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native duration select | LandingPage | Platform popup accepted | Browser lobby tests |
| Form | LandingPage + server acknowledgements | MatchManager | Join/create; inline errors and bounded timeout | Multiplayer browser tests |
| Scrollbar | Global application stylesheet | DESIGN.md | Dialog/catalog geometry only | Desktop/mobile review |
| Status | Inline role=status / role=alert | Owning screen | Blocked movement, connection, invite failure | Race and invitation tests |
| Dialog | HumanPlayModal | Shared human movement | Solo exploration / campaign completion | Keyboard, escape, focus return |
| 3D input | FacilityView + FacilityScene | Shared topology + sector catalog | Cell editing / sector selection | Pointer and raised-deck browser tests |

Solo campaign completion is device-local and only recorded after reaching the sector exit. It unlocks the following destination. Remixing or watching an AI run does not complete a human level.

Architect PvP retains its budget, server validation, scoring and existing room lifecycle. Only the connected player's socket can ready, edit, submit, rematch or advance results. Only the host can configure a lobby. Opponent reconnect credentials are never broadcast.

Live races use the same fixed sector order for both players. After a common server countdown, clients send only cardinal movement intents. The server owns inventory, lift access, traps, checkpoint changes and the winner. Each player has independent inventory and switches. Portal and reset effects retain their existing semantics. Race completion is the final exit, not a client-submitted score. Spectators cannot move players.

Reconnect restores the server-owned player state while the process remains alive. Leaving a lobby frees the seat and transfers host ownership. Leaving an active game disconnects that player. Matches are in memory; restarting or redeploying the single game instance loses them. The UI reports a missing saved room and allows creating another. Persistent accounts, database-backed saves and multiple game replicas are outside this deployment.
