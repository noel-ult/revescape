---
version: alpha
name: Reverse Escape Mind Wars
description: An orbital facility construction game with tactile 3D sectors and restrained mission-control UI.
colors:
  background: '#060814'
  panel: '#111d27'
  primary: '#bcebd9'
  secondary: '#ffc581'
  text: '#d8e6e9'
  muted: '#9aabb7'
typography:
  sans:
    fontFamily: 'Inter, system-ui, sans-serif'
  display:
    fontFamily: 'Orbitron, sans-serif'
  mono:
    fontFamily: 'JetBrains Mono, monospace'
rounded:
  DEFAULT: '10px'
  control: '7px'
spacing:
  page: '32px'
  panel-gap: '20px'
components:
  button: {}
  facility: {}
  sector: {}
---

# Reverse Escape design context

## Overview

The audience builds sci-fi escape facilities and plays them with friends on desktop or phone. The physical reference is an orbital research station: raised metal decks, illuminated access hardware, and a visible articulated scout. Keep the established Three.js scene and architect surfaces. The landing screen introduces the game; sector maps, builders and races prioritize useful controls over decorative chrome. English is the current interface language.

This file mirrors implemented tokens. Runtime ownership remains in `src/client/index.css`, `tailwind.config.js`, and `src/client/lib/facilityScene.ts`; it does not generate competing tokens. Campaign sectors reuse this identity rather than introducing a rebrand.

## Colors

Dark blue panels sit on the nearly black background. Mint identifies the local scout, primary actions and completed sectors; amber identifies the race rival. Sector colors distinguish destinations, accompanied by names and state labels. Never rely on color alone for completion or connection status. Ion, Ember and Void change scene materials without changing rules.

## Typography

Inter carries product copy. Orbitron is used sparingly for the existing title and competition chrome. Monospace labels convey coordinates, timing and counts. Keep objectives in sentence case and explain the algorithms in normal prose.

## Layout

Desktop uses a large 3D scene and a 310px mission/progress sidebar. Below 1000px these stack; phones use 10px side padding, two-column destination cards and visible movement buttons. Document scrolling owns long pages; only catalogs and dialog content scroll internally. Keep the scene framed at its default camera and provide Plan, Orbit and zoom controls.

## Elevation & Depth

Use borders and tonal panels for UI hierarchy. The world supplies the depth: playable platforms, bridges and character motion. Every outer destination represents a real sector, with a miniature of its actual room. Sectors are separate levels reached by extraction checkpoints, not fictional walkable links through empty space.

## Shapes

Panels use 10px corners, controls 7px corners and fine borders. Use the existing Lucide icon family. The miniature room previews use instanced geometry to avoid multiplying draw calls.

## Components

`FacilityView` owns camera controls and the blueprint fallback. `SectorMap` owns local campaign selection, locked-sector feedback and device-local completion. `RaceScreen` presents authoritative positions, touch controls and progress. `HumanPlayModal` shares movement rules with the race server, traps focus and restores its trigger. Landing duration uses the native select intentionally; operating-system popup geometry is accepted. Explicit button groups select multiplayer mode.

## Do's and Don'ts

Keep names, objectives, countdowns and connection state visible. Respect reduced motion. Use native buttons, accessible labels and focus indicators. Do not add decorative fake actions, claim cloud-synced campaign progress, call search-based AI machine learning, or infer public deployment from a successful local build.
