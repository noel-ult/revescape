---
version: alpha
name: Reverse Escape Mind Wars
description: An orbital facility construction game with tactile 3D sectors and restrained mission-control UI.
colors:
  background: '#060c15'
  panel: '#0e1b2a'
  primary: '#a7f2d6'
  secondary: '#ffb47f'
  text: '#ecf5f8'
  muted: '#8da3b6'
typography:
  sans:
    fontFamily: 'Inter, system-ui, sans-serif'
  display:
    fontFamily: 'Space Grotesk, Inter, sans-serif'
  mono:
    fontFamily: 'JetBrains Mono, monospace'
rounded:
  DEFAULT: '10px'
  control: '7px'
spacing:
  page: '32px'
  panel-gap: '20px'
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
  facility:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
  sector:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
---

# Reverse Escape design context

## Overview

The audience builds sci-fi escape facilities and plays them with friends on desktop or phone. The physical reference is an orbital research station: raised metal decks, illuminated access hardware, and a visible articulated scout. Keep the established dark sci-fi visual identity and working Three.js scene. The user explicitly rejected a light replacement interface: refine the existing app directly. Orbitron remains on the compact brand wordmark; Space Grotesk carries product headings and Inter carries body text. The landing screen introduces the game; sector maps, builders and races prioritize useful controls over decorative chrome. English is the current interface language.

This file mirrors implemented tokens. Runtime ownership remains in `src/client/index.css`, `tailwind.config.js`, and `src/client/lib/facilityScene.ts`; it does not generate competing tokens. Campaign sectors reuse this identity rather than introducing a rebrand.

## Colors

Dark blue panels sit on the nearly black background. Mint identifies the local scout, primary actions and completed sectors; amber identifies the race rival. Sector colors distinguish destinations, accompanied by names and state labels. Never rely on color alone for completion or connection status. Ion, Ember and Void change scene materials without changing rules.

## Typography

Inter carries product copy and the large game title. Space Grotesk carries mission headings, score typography and competition controls. Orbitron is confined to the familiar wordmark. Monospace labels convey coordinates, timing and counts. Keep objectives in sentence case and explain the algorithms in normal prose.

## Layout

Desktop uses a large 3D scene and a 310px mission/progress sidebar. Below 1000px these stack; phones use 10px side padding, two-column destination cards and visible movement buttons. Document scrolling owns long pages; only catalogs and dialog content scroll internally. Keep the scene framed at its default camera and provide Plan, Orbit and zoom controls.

## Elevation & Depth

Use borders and tonal panels for UI hierarchy. The world supplies the depth: playable platforms, bridges and character motion. Every outer destination represents a real sector, with a miniature of its actual room. Sectors are separate levels reached by extraction checkpoints, not fictional walkable links through empty space.

## Shapes

Panels use 12–16px corners, controls 8–10px corners and fine blue-gray borders. Use the existing Lucide icon family. The miniature room previews use instanced geometry to avoid multiplying draw calls.

## Components

`FacilityView` owns camera controls and the blueprint fallback. `SectorMap` owns local campaign selection, locked-sector feedback and device-local completion. `RaceScreen` presents authoritative positions, touch controls and progress. `HumanPlayModal` shares movement rules with the race server. It and the game guide reuse `useGameDialog`, render outside the app root, isolate background interactions, trap focus and restore the trigger. Landing duration uses the native select intentionally; operating-system popup geometry is accepted. Explicit button groups select multiplayer mode.

Solo expedition has eight dedicated rooms, independent of the race layouts. Its map uses those actual rooms for platform previews. The mission sidebar names the difficulty and required mechanic, presents a practical hint and best score, and offers human play or a studio remix. Extraction offers the next sector directly; advancing resets the room state while retaining completion and best scores on this device. Studio remixes and scout replays do not mark human missions complete.

On phones, expedition play uses a shorter 3D viewport and puts movement status and the D-pad before optional score/inventory details, keeping the room and controls visible together. The next-sector action leads the completion controls. Desktop retains the scene/sidebar layout.

## Do's and Don'ts

Keep names, objectives, countdowns and connection state visible. Respect reduced motion. Use native buttons, accessible labels and focus indicators. Do not add decorative fake actions, claim cloud-synced campaign progress, call search-based AI machine learning, or infer public deployment from a successful local build.

The home screen keeps the Reverse Escape title and live station. Mint selects exploration/build actions; warm amber distinguishes a selected live race. A three-item feature rail explains actual play options. Mode selection and lobby fields form one intentional multiplayer region. Do not return to a light concept, introduce fake dashboards, or replace the real 3D scene with a flat illustration.

## Challenge interactions

Ghost racing is an optional sector/shared-room action. Amber identifies the deterministic scout and a visible countdown coordinates the start; a race loss does not block campaign progression. Three stars correspond to real extraction, par and the displayed bonus mission. Reward summaries and saved ghost wins reuse mint completion styling.

Studio sharing generates a public snapshot with an explicitly selectable read-only link and a clipboard fallback. Daily play has its own room, movement status, callsign and server-verified ranking sidebar; loading/error states keep retry available. Co-op uses the existing lobby and race layout with teammate language, shared access-core feedback and a clear waiting-for-partner checkpoint state. Decision rewind reuses native number fields/select, inline validation and the replay slider; it exposes deterministic continuation and original-trace restoration rather than changing submitted scores.

## Expedition interfaces

The command deck now prioritizes Adventure and Endless above the preserved solo challenge map and studio. The live station remains the visual anchor, with a blue architectural accent and mint/amber explorer identities. Adventure uses a large room with a compact ASTRA command console, route strip, shared inventory, checkpoint panel and optional mission journal. On phones the scene is 300px tall and controls stack below it.

Adventure ships six sectors and 18 connected rooms. Relays have visible circuit lines; pulse markers and Wait communicate safe crossing. The six-sector navigation map previews actual rooms. Endless uses validated puzzle templates, upgrades, branch choices and career archives. Online expeditions reuse the adventure HUD with connection/ready/invite controls and server-owned state. Local careers and anonymous verified online results have explicit ownership labels. Existing multiplayer modes retain their server rules.
