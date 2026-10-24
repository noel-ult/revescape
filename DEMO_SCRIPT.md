# Two-minute demo — Reverse Escape: Mind Wars

Before presenting: run `npm run build && npm start`, then open `http://localhost:3001`. For a second device use the server's LAN address. Test connectivity before starting the clock.

## 0:00–0:20 — Show the world

The landing page is already running a real scout simulation.

“You build the world. The AI finds a way. This is an architectural strategy game: design a facility that challenges an exploring AI, then compete with another architect.”

Enter the architect studio. Orbit the Orbital Research Station with right-drag and briefly switch between Ion and Ember environments.

## 0:20–0:45 — Build architecture

Click **Clear**, select **Transit chamber**, rotate the module, and place it near the center. Add a **Security wing** in separate open space. Use Undo/Redo to show that each chamber is a complete editable module. The shared energy budget and solvability checks stay visible.

Load **Orbital research station** from the setup library for a guaranteed demonstration layout.

## 0:45–1:10 — Follow the scout

Click **Simulate AI**, then **Follow AI**. The robot walks, turns, warps through the transit ring, collects an access core, and unlocks the extraction bulkhead. These events come from its actual planning simulation.

“The scout only knows what it has observed. The 3D animation follows real exploration steps; a separate complete-information solver verifies that our design has a solution.”

## 1:10–1:40 — Show competition or adaptation

For multiplayer, prepare a lobby before the pitch. Both players ready up, load different facilities, and lock them. Show the two 3D attempts, switch World View to AI View, and compare the scores.

For a solo demonstration, return to building, load **Mirage containment complex**, and launch the expedition. Use **2x** playback. Switch to **Attempt 2 (Adapted Memory)** and point to the decision events showing remembered traps and decoys. Use the displayed metrics rather than promising a fixed step improvement for every facility.

## 1:40–2:00 — Make room for play

Show the results and choose **Try escaping…** to enter the facility yourself with WASD or arrow keys.

“The same space is a construction toy, an AI experiment, a human escape challenge, and a multiplayer competition.”

The demo requires no paid API or LLM service. If a device cannot render WebGL, the blueprint fallback keeps the game playable.
