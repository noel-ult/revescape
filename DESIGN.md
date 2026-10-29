---
version: expedition-2
name: Reverse Escape Operations
description: A cinematic orbital game launcher and instrument HUD on charcoal surfaces.
colors:
  background: '#101115'
  panel: '#191a20'
  primary: '#ff995c'
  secondary: '#a5bcff'
  text: '#f1eee7'
  muted: '#a5a4ad'
typography:
  sans:
    fontFamily: 'Inter, system-ui, sans-serif'
  display:
    fontFamily: 'Space Grotesk, Inter, sans-serif'
  mono:
    fontFamily: 'JetBrains Mono, monospace'
rounded:
  DEFAULT: '6px'
  control: '5px'
spacing:
  page: '30px'
  panel-gap: '20px'
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
  facility:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
---

# Operations interface

The user explicitly requested deleting the previous interface, superseding the earlier instruction to preserve its layout. The previous mint/navy card system, split landing hero, top navigation component and stacked stylesheet have been removed. Keep the working game engines, network protocols and Three.js renderer underneath this replacement UI.

## Visual direction

Use graphite/charcoal surfaces, warm white text, tangerine primary actions, slate supporting text and restrained blue or green functional indicators. Space Grotesk owns all display typography and the wordmark. Inter owns body and controls; JetBrains Mono is reserved for coordinates, captions and status. Orbitron is removed. Corners are compact rather than pill-shaped; borders communicate structure without luminous shadows. The renderer's Ion palette uses neutral architectural surfaces against the charcoal world.

Runtime tokens are owned in `src/client/index.css`. Scene materials live in `facilityScene.ts`. This file documents them; it does not generate a second theme. Use the existing Lucide icon family. English remains the current language.

## Navigation and launcher

Desktop has an 88px navigation rail and a 72px utility line. The rail exposes mission control, campaign, endless, online expeditions, studio and challenges. Phones use a 58px utility line and a 62px bottom navigation bar. Content reserves space for fixed chrome; portaled play/guide dialogs render above it.

The home screen is a game launcher, not a marketing page: a masthead, one panoramic live station scene with an overlaid mission action, three mode entries, two challenge shortcuts and a private-match terminal. The renderer remains the actual live scout simulation. No simulated online counts, fake progression metrics or static replacement room illustration.

## Play and construction

Adventure uses a full-width world with a floating companion command HUD. At narrow widths the HUD becomes a compact tray below the room. Movement controls, state, shared inventory and companion commands remain functional. System consoles and checkpoint actions are below the world; the journal and career are optional supporting surfaces. EMP, lift movement, pointer targeting and the blueprint fallback retain their real rules.

The studio puts a wide drafting surface first and a right-hand construction tray on desktop. On phones the world comes before the tray. Modules use compact illustrated cells; component tools, setup library, validity, history and launch remain accessible. Match staging uses an invitation ticket beside two explorer seats. Results use a horizontal verdict/debrief with a dedicated action column. Replays, daily challenges and shared facilities use the same neutral panel and warm action primitives. Legacy cyber-card classes are removed in favor of interface-panel.

## Behavior and responsive rules

Native selects remain the owned selection primitive. `useGameDialog` remains the shared dialog owner for focus, Escape, inert background and trigger restoration. Keep status and errors in owned live regions. Keyboard movement ignores editable inputs and stops behind dialog overlays. Every icon button has an accessible name; rail navigation also exposes visible labels. Respect reduced motion and forced colors.

Keep the room and human movement pad inside the mobile play dialog viewport; optional comparisons and inventory may continue below it. Persistent bottom navigation must not cover dialog controls. Page scrolling owns long screens; only tool catalogs, floating HUDs and dialogs scroll internally. Global scrollbar tokens apply everywhere. Primary button labels state real actions; game AI remains accurately described as deterministic planning with an optional separate Luna studio experiment.
