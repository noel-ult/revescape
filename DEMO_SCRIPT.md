# Two-minute demo — Reverse Escape: Mind Wars

Before presenting: run `npm run build && npm start`, then open `http://localhost:3001`. For a second device use the server's LAN address. Test connectivity before starting the clock.

## 0:00–0:20 — Show the world

The landing page is already running a real scout simulation.

“You build the world. The AI finds a way. This is an architectural strategy game: design a facility that challenges an exploring AI, then compete with another architect.”

Enter the architect studio. Orbit the Orbital Research Station with right-drag. Point out the main floor and the two connected raised annexes, then briefly switch between Ion and Ember environments. Each annex holds four playable sectors, including access cores in this setup.

## 0:20–0:45 — Build architecture

Click **Clear**, select **Transit chamber**, rotate the module, and place it near the center. Add a **Security wing** in separate open space. Use Undo/Redo to show that each chamber is a complete editable module. The shared energy budget and solvability checks stay visible.

Load **Orbital research station** from the setup library for a guaranteed demonstration layout.

## 0:45–1:10 — Follow the scout

Click **Simulate AI**, then **Follow AI**. The robot walks, turns, warps through the transit ring, crosses both lift bridges onto the raised decks to collect access cores, then unlocks the extraction bulkheads. Keep Follow AI active for a close view during the climbs; Plan shows the complete bridge connections. These events come from its actual planning simulation.

“This is a deterministic search AI: partial-observation frontier exploration plus A* pathfinding, with memory and replanning. It knows the public lift locations, but discovers the room contents through nearby observations. A* respects lift access and elevation costs. A separate full-map BFS verifies a solution and counts the shortest possible moves. This baseline uses no trained model or LLM. Solo launches can optionally use Luna for objective selection; routing and legality still use A*.”

## 1:10–1:40 — Show competition or adaptation

For multiplayer, prepare a lobby before the pitch. Both players ready up, load different facilities, and lock them. Show the two 3D attempts, switch World View to AI View, and compare the scores.

For a solo demonstration, return to building, load **Mirage containment complex**, and launch the expedition. Use **2x** playback. Switch to **Attempt 2 (Adapted Memory)** and point to the decision events showing remembered traps and decoys. Use the displayed metrics rather than promising a fixed step improvement for every facility.

## 1:40–2:00 — Make room for play

Show the results and choose **Try escaping…** to enter the facility yourself with WASD, arrow keys, or the touch D-pad. A neighboring annex sector cannot be entered from an arbitrary main-floor edge: approach its lift, cross the bridge, and return through the same lift.

“The same space is a construction toy, an AI experiment, a human escape challenge, and a multiplayer competition.”

The demo requires no paid API or LLM service. If a device cannot render WebGL, the blueprint fallback keeps the game playable.

If asked about scope: the annexes reuse eight sectors of the existing 8×8 grid; they are not arbitrary stacked floors. Their lift components activate the raised geometry and legal access. The eight distant platforms are separate playable levels selected through the orbital map, not extra cells in this room. Competitive simulation and scoring remain server-authoritative. Present the local or LAN session only; a GitHub source repository is not a public game deployment.


## Orbital levels and live human race variant

Open **Explore levels**. Rotate the map and point out that every outer platform is now a named destination with a miniature of its real room. Enter Arrival dock, move to extraction with WASD/arrows or the D-pad, then return to show Wormhole terminal unlocked. Progress is stored on this browser.

For a live multiplayer demo, open two browsers/devices on the same deployed HTTPS URL. Choose **Live escape race**, create a room, share its invite URL, and ready both players. Show the common three-second start, the amber rival moving on the same deck, and one player extracting into the next sector while the other remains behind. Refresh the leading player's page to demonstrate state recovery. The server validates movements and checkpoints; the first final extraction wins. Architect duel remains a separate selectable mode.

Deployment is through the user's Dokploy instance using the repository Dockerfile and port 3001. Follow DEPLOYMENT.md; do not claim a public deployment until its URL and WebSocket checks have been verified.

## Optional Luna demonstration

In the solo studio, set **Expedition scout → Luna Decisions + A*** and launch. The arena explainer shows how many objectives Luna actually chose and how many used fallback. The builder preview remains the baseline. If no API key is configured, demonstrate the clearly labelled deterministic fallback; do not present that as a live model response. With `LUNA_ENABLED=true` and a server-side `OPENAI_API_KEY`, Luna chooses only from the scout's observed, reachable targets. A* follows legal routes, including lift transitions; BFS still validates the complete room. Compare real run metrics without promising model superiority. Architect multiplayer always uses the reproducible baseline.
