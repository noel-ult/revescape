import { parseShorthandGrid } from './board';
import { moveHuman, HumanState } from './movement';
import type { Sector } from './sectors';
import type { Grid } from './types';

export const COOP_SECTORS: Sector[] = [
  { id: 'coop-relay', name: 'Pressure relay', theme: 'ion', color: '#88e8cf', mechanic: 'Hold the switch, share the core',
    objective: 'One player holds the phase switch so their teammate can cross. Recover the shared red core beyond the divider to open the return route, then both extract.',
    grid: parseShorthandGrid([
      'S . . . . . . .', '. . . . . . . .', '. w . . . . . .',
      '# # # X # # R #', '. . . . . . . .', '. . . . . r . .',
      '. . . . . . . .', '. . . . . . . E',
    ]) },
  { id: 'coop-aerial', name: 'Shared aerial clearance', theme: 'void', color: '#bda5fa', mechanic: 'Split the core search',
    objective: 'Split up to recover the red aerial core and cyan ground core. Access cores are shared instantly. Both players must reach extraction.',
    grid: parseShorthandGrid([
      'S . . . . . . .', '. . . . U . r .', '. # . # . . . .',
      '. # . . . . . .', '. . . # . . . .', '. c . . . # . .',
      '. . . . . # # #', '. . . . . R C E',
    ]) },
  { id: 'coop-command', name: 'Twin-deck recovery', theme: 'ember', color: '#ffb66b', mechanic: 'Two decks, one team',
    objective: 'Coordinate the two lifts, recover both shared cores and reunite at extraction. EMP effects belong to each player separately.',
    grid: parseShorthandGrid([
      'S . . . . . . .', '. J . . U . r .', '. . . . . . . .',
      '. . . . . . . .', '. V . . . . . .', '. . . . . . . .',
      '. c . . . # # #', '. . . . . R C E',
    ]) },
];

export function moveCoop(grid: Grid, players: HumanState[], index: number, dr: number, dc: number) {
  if (!players[index] || players.length !== 2) return { error: 'Wait for both teammates before moving.', players, escaped: false, state: players[index] };
  const sharedKeyMask = players.reduce((mask, player) => mask | player.keyMask, 0);
  const pressure = (states: HumanState[]) => Number(states.some(p => p.lastStep.event !== 'EXIT' && grid[p.row][p.col] === 'SWITCH_A'));
  const current = { ...players[index], keyMask: sharedKeyMask, switchMask: pressure(players) };
  const move = moveHuman(grid, current, dr, dc);
  if (move.error) return { ...move, players };
  const next = players.map((p, i) => i === index ? move.state : p);
  const keys = sharedKeyMask | move.state.keyMask;
  const switches = pressure(next);
  const shared = next.map(p => ({ ...p, keyMask: keys, switchMask: switches,
    lastStep: { ...p.lastStep, keyMask: keys, switchMask: switches } }));
  if (grid[move.state.row][move.state.col] === 'SWITCH_A') shared[index].lastStep.description = 'Pressure switch held. Your teammate can cross the phase gate.';
  return { ...move, state: shared[index], players: shared };
}
