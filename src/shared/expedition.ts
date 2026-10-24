import { parseShorthandGrid } from './board';
import type { Sector } from './sectors';

export interface ExpeditionSector extends Sector {
  difficulty: 'Training' | 'Standard' | 'Advanced' | 'Finale';
  hint: string;
}

/** Dedicated solo rooms. Race layouts remain in sectors.ts. */
export const EXPEDITION_SECTORS: ExpeditionSector[] = [
  {
    id: 'exp-dock', name: 'Docking perimeter', theme: 'ion', color: '#88e8cf',
    difficulty: 'Training', mechanic: 'Navigation',
    objective: 'Navigate the docking barriers and reach the extraction beacon.',
    hint: 'Use WASD, arrow keys or the D-pad. Look for openings between the plasma barriers.',
    grid: parseShorthandGrid([
      'S . . . . . . .',
      '. # # # . # # .',
      '. . . . . . . .',
      '. # . . . # . .',
      '. # . # . # . .',
      '. . . # . . . .',
      '. # . . . # . .',
      '. . . . . . . E',
    ]),
  },
  {
    id: 'exp-relay', name: 'Quantum relay', theme: 'void', color: '#bda5fa',
    difficulty: 'Standard', mechanic: 'Required portal crossing',
    objective: 'Find the transit ring. Its linked portal is the only route past the sealed divider.',
    hint: 'Stepping onto a transit ring warps you instantly to its partner.',
    grid: parseShorthandGrid([
      'S . . # . . . .',
      '. # . # . # . .',
      '. . P . . . # .',
      '# # # # # # # #',
      '. . . . . P . .',
      '. # # . # # . .',
      '. . . . . . # .',
      '. # . . . . . E',
    ]),
  },
  {
    id: 'exp-aerial', name: 'Aerial archive', theme: 'ion', color: '#8bd9eb',
    difficulty: 'Standard', mechanic: 'Raised access core',
    objective: 'Take the aerial lift to the red core, then return to the main floor and open extraction.',
    hint: 'The red core is on deck 1. Cross through the lift beside the archive; other deck edges are blocked.',
    grid: parseShorthandGrid([
      'S . . . . . . .',
      '. # . . U . r .',
      '. # . # . . . .',
      '. . . # . . . .',
      '. # . . . # . .',
      '. . . # . # . .',
      '. # . . . . . R',
      '. . . . . . R E',
    ]),
  },
  {
    id: 'exp-cryo', name: 'Coolant exchange', theme: 'ion', color: '#83e4ed',
    difficulty: 'Standard', mechanic: 'Phase switch + cryo',
    objective: 'Activate the phase switch to cross the reactor divider. Coolant fields slow your next move.',
    hint: 'The switch flips polarity every time you step onto it. Keep it on until you pass the closed gate.',
    grid: parseShorthandGrid([
      'S . . . # . . .',
      '. # . . # . # .',
      '. # w . . . . .',
      '. . . M M . . .',
      '# # # X # # # #',
      '. . . . . . . .',
      '. # . . M . # .',
      '. . . . . . . E',
    ]),
  },
  {
    id: 'exp-mirage', name: 'Echo containment', theme: 'void', color: '#ef9fcf',
    difficulty: 'Advanced', mechanic: 'Decoy + reset mine',
    objective: 'Survive the reset field and find the real extraction beacon among the false signals.',
    hint: 'A reset mine returns you to deployment once, then stays disarmed. A decoy never completes the level.',
    grid: parseShorthandGrid([
      'S T . . . . . D',
      '# . # # . # . .',
      '. . . # . # . .',
      '. # . . . . . .',
      '. # # . # # . .',
      '. . . . . . # .',
      '. # . # . . # .',
      '. . . . . . . E',
    ]),
  },
  {
    id: 'exp-vault', name: 'Prismatic vault', theme: 'ember', color: '#f3bc87',
    difficulty: 'Advanced', mechanic: 'Three required cores',
    objective: 'Recover all three access cores before entering the gold, cyan and red extraction airlocks.',
    hint: 'Keys stay with you. The three bulkheads form the only entrance to the extraction corridor.',
    grid: parseShorthandGrid([
      'S . . . # . . g',
      '. # # . # . # .',
      '. . r . . . # .',
      '# . # # . . . .',
      '. . . . . # . .',
      '. # . c . . . .',
      '. . . . # # # #',
      '. . . . G C R E',
    ]),
  },
  {
    id: 'exp-sky', name: 'Twin observatories', theme: 'ion', color: '#bcebd9',
    difficulty: 'Advanced', mechanic: 'Two required decks',
    objective: 'Visit both observatories: the red core is on deck 1 and the cyan core on deck 2.',
    hint: 'Each raised deck has its own lift. Return to the main floor with both cores before approaching extraction.',
    grid: parseShorthandGrid([
      'S . . . . . . .',
      '. # # . . . . .',
      '. . . # . . r .',
      '. # . . . . U .',
      '. V . # # . . .',
      '. . . . . # . .',
      '. c . . . # # #',
      '. . . . . R C E',
    ]),
  },
  {
    id: 'exp-command', name: 'Blackout command', theme: 'ember', color: '#ffb66b',
    difficulty: 'Finale', mechanic: 'EMP + phase gate + two decks',
    objective: 'Recover both raised cores, open the phase divider and extract while the station’s sensors are jammed.',
    hint: 'The EMP clears after six moves. Collect the aerial core before crossing the phase gate, then take the observatory lift.',
    grid: parseShorthandGrid([
      'S J . . . U . .',
      '# . . . . . r .',
      '. w . . . . . .',
      '# # # # X # # #',
      '. . V . . . . .',
      '. . . . . . . .',
      '. c . . . # # #',
      '. . . . . R C E',
    ]),
  },
];

export interface ExpeditionProgress {
  completed: string[];
  bestMoves: Record<string, number>;
  selectedSectorId: string;
}

export const EXPEDITION_STORAGE_KEY = 'reverse-escape-solo-expedition-v2';

export function isExpeditionUnlocked(completed: string[], index: number): boolean {
  return index >= 0 && index < EXPEDITION_SECTORS.length &&
    (index === 0 || completed.includes(EXPEDITION_SECTORS[index - 1].id));
}

/** Restore only a contiguous completed route; never carry old race-room completion into new rooms. */
export function restoreExpeditionProgress(value: unknown): ExpeditionProgress {
  const saved = value && typeof value === 'object' ? value as Partial<ExpeditionProgress> : {};
  const completed: string[] = [];
  for (const sector of EXPEDITION_SECTORS) {
    if (!Array.isArray(saved.completed) || !saved.completed.includes(sector.id)) break;
    completed.push(sector.id);
  }
  const bestMoves: Record<string, number> = {};
  for (const id of completed) {
    const moves = saved.bestMoves?.[id];
    if (typeof moves === 'number' && Number.isSafeInteger(moves) && moves > 0) bestMoves[id] = moves;
  }
  const index = EXPEDITION_SECTORS.findIndex(sector => sector.id === saved.selectedSectorId);
  const selectedSectorId = isExpeditionUnlocked(completed, index) ? EXPEDITION_SECTORS[index].id :
    EXPEDITION_SECTORS[Math.min(completed.length, EXPEDITION_SECTORS.length - 1)].id;
  return { completed, bestMoves, selectedSectorId };
}
