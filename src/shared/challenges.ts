import { cloneGrid } from './board';
import { EXPEDITION_SECTORS } from './expedition';
import { validateBoard } from './validator';
import type { AgentSimulationStep, Grid, SolverStep, TileType } from './types';

// Explicit stable alphabet: shared links remain compatible if the catalog order changes.
const SHARE_TILES: TileType[] = ['EMPTY', 'START', 'EXIT', 'WALL', 'KEY_RED', 'DOOR_RED', 'KEY_CYAN', 'DOOR_CYAN', 'KEY_GOLD', 'DOOR_GOLD', 'SWITCH_A', 'GATE_A_CLOSED', 'GATE_A_OPEN', 'DECOY_EXIT', 'TRAP_RESET', 'PORTAL_A', 'EMP_SCRAMBLER', 'GRAVITY_MUD', 'ELEVATOR_A', 'ELEVATOR_B'];
export function encodeFacility(grid: Grid): string {
  const validation = validateBoard(grid);
  if (!validation.valid) throw new Error(validation.errors[0]);
  return 'v1-' + grid.flat().map(tile => String.fromCharCode(65 + SHARE_TILES.indexOf(tile))).join('');
}
export function decodeFacility(code: string): Grid {
  if (!/^v1-[A-T]{64}$/.test(code)) throw new Error('This facility link is invalid or uses an unsupported version.');
  const cells = [...code.slice(3)].map(char => SHARE_TILES[char.charCodeAt(0) - 65]);
  const grid = Array.from({ length: 8 }, (_, row) => cells.slice(row * 8, row * 8 + 8));
  const validation = validateBoard(grid);
  if (!validation.valid) throw new Error(`This facility cannot be played: ${validation.errors[0]}`);
  return grid;
}

export const GHOST_MOVE_MS = 350;
export function ghostTimeline(steps: AgentSimulationStep[]): number[] {
  let elapsed = 0;
  return steps.map((step, index) => {
    if (index) elapsed += steps[index - 1].event === 'GRAVITY_SLOW' ? GHOST_MOVE_MS * 3 : GHOST_MOVE_MS;
    return elapsed;
  });
}
export interface ExpeditionRunReport {
  moves: number;
  history: SolverStep[];
  ghostWon: boolean;
}
export interface ExpeditionReward { stars: number; bonus: boolean; ghostWon: boolean; }
export function expeditionBonus(id: string): string {
  if (id === 'exp-mirage') return 'Expose the decoy beacon';
  if (id === 'exp-sky') return 'Visit both raised decks';
  if (id === 'exp-command') return 'Escape after surviving the EMP';
  return 'Escape without triggering a reset mine';
}
export function scoreExpeditionRun(id: string, run: ExpeditionRunReport, scoutMoves: number): ExpeditionReward {
  const escaped = run.history.at(-1)?.event === 'EXIT';
  if (!escaped) return { stars: 0, bonus: false, ghostWon: false };
  const bonus = id === 'exp-mirage' ? run.history.some(s => s.event === 'DECOY_DISCOVERED') :
    id === 'exp-sky' ? [1, 2].every(level => run.history.some(s => s.level === level)) :
    id === 'exp-command' ? run.history.some(s => s.event === 'EMP_JAMMED') :
    !run.history.some(s => s.event === 'TRAP_RESET_TRIGGERED');
  return { stars: 1 + Number(run.moves <= scoutMoves) + Number(bonus), bonus, ghostWon: run.ghostWon };
}

/** UTC date + seeded, validated mutations give every client the same daily room. */
export function dailyChallenge(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('Invalid challenge date.');
  let seed = [...date].reduce((value, c) => Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const template = EXPEDITION_SECTORS[Math.floor(random() * EXPEDITION_SECTORS.length)];
  let grid = cloneGrid(template.grid);
  for (let attempt = 0, accepted = 0; attempt < 24 && accepted < 3; attempt++) {
    const row = Math.floor(random() * 8), col = Math.floor(random() * 8);
    if (grid[row][col] !== 'EMPTY') continue;
    const candidate = cloneGrid(grid);
    candidate[row][col] = random() < 0.7 ? 'WALL' : 'GRAVITY_MUD';
    if (validateBoard(candidate).valid) { grid = candidate; accepted++; }
  }
  const validation = validateBoard(grid);
  return { date, grid, theme: template.theme, optimalMoves: validation.solverResult!.shortestPathLength, scoutMoves: validation.agentResult!.totalSteps };
}
