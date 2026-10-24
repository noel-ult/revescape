import { cloneGrid, createEmptyGrid, PRESET_BOARDS } from './board';
import { SHOWCASE_FACILITY } from './facility';
import { Grid } from './types';

export interface Sector {
  id: string;
  name: string;
  theme: 'ion' | 'ember' | 'void';
  color: string;
  mechanic: string;
  objective: string;
  grid: Grid;
}

const transit = cloneGrid(SHOWCASE_FACILITY);
for (const [r, c] of [[1, 4], [5, 3], [2, 5], [6, 2], [7, 5], [7, 6]]) transit[r][c] = 'EMPTY';
const aerial = cloneGrid(SHOWCASE_FACILITY);
for (const [r, c] of [[5, 3], [6, 2], [7, 6]]) aerial[r][c] = 'EMPTY';
const finale = cloneGrid(SHOWCASE_FACILITY);
finale[4][4] = 'EMP_SCRAMBLER';

/** Each orbital platform is a complete playable room, using the existing Grid format. */
export const SECTORS: Sector[] = [
  { id: 'arrival', name: 'Arrival dock', theme: 'ion', color: '#88e8cf', mechanic: 'Navigation', objective: 'Reach the extraction beacon. Learn the controls before taking the orbital route.', grid: createEmptyGrid() },
  { id: 'transit', name: 'Wormhole terminal', theme: 'void', color: '#bda5fa', mechanic: 'Linked portals', objective: 'Use the linked transit rings to cross the station and find extraction.', grid: transit },
  { id: 'aerial', name: 'Aerial research wing', theme: 'ion', color: '#8bd9eb', mechanic: 'Lift + access core', objective: 'Cross the aerial lift, collect the red access core, then unlock extraction.', grid: aerial },
  { id: 'cryo', name: 'Cryogenic reactor', theme: 'ion', color: '#83e4ed', mechanic: 'Phase gates + cryo', objective: 'Find the phase switch and access cores. Coolant fields slow the AI’s route planning.', grid: cloneGrid(PRESET_BOARDS[2].grid) },
  { id: 'mirage', name: 'Mirage observatory', theme: 'void', color: '#ef9fcf', mechanic: 'Decoys + reset mines', objective: 'Find the real exit. Reset mines return you to deployment and disarm after one hit.', grid: cloneGrid(PRESET_BOARDS[0].grid) },
  { id: 'vault', name: 'Chromatic vault', theme: 'ember', color: '#f3bc87', mechanic: 'Three access cores', objective: 'Collect red, cyan and gold cores to pass the security bulkheads.', grid: cloneGrid(PRESET_BOARDS[1].grid) },
  { id: 'sky', name: 'Skybridge complex', theme: 'ion', color: '#bcebd9', mechanic: 'Two raised decks', objective: 'Visit both elevated annexes for the access cores, then return to the main extraction route.', grid: cloneGrid(SHOWCASE_FACILITY) },
  { id: 'command', name: 'Orbital command', theme: 'ember', color: '#ffb66b', mechanic: 'Final expedition', objective: 'Escape the full multi-deck complex with portals, two access cores and an EMP field.', grid: finale },
];

export function sectorPosition(index: number): [number, number, number] {
  const angle = index / SECTORS.length * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * 12, 1 + index % 3 * 0.7, Math.sin(angle) * 12];
}
