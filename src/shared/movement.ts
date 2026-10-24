import { findPortalDestination } from './board';
import { KEY_BITS, START_POS } from './constants';
import { canTraverseDeck, deckAt, getDeckTopology } from './levels';
import { canEnterTile } from './solver';
import { AgentSimulationStep, Coordinate, Grid, SolverStep } from './types';

export interface HumanState extends Coordinate {
  keyMask: number;
  switchMask: number;
  spentTraps: string[];
  moves: number;
  empRemainingTurns?: number;
  lastStep: SolverStep;
}
export function spawnHuman(): HumanState {
  return { ...START_POS, keyMask: 0, switchMask: 0, spentTraps: [], moves: 0, empRemainingTurns: 0,
    lastStep: { ...START_POS, stepIndex: 0, level: 0, keyMask: 0, switchMask: 0, event: 'START', tile: 'START', description: 'Deployed at the sector entrance.' } };
}

/** Pure movement rules shared by solo exploration and authoritative multiplayer racing. */
export function moveHuman(grid: Grid, state: HumanState, dr: number, dc: number): { state: HumanState; escaped: boolean; error?: string } {
  const blocked = (error: string) => ({ state, escaped: false, error });
  if (!Number.isInteger(dr) || !Number.isInteger(dc) || Math.abs(dr) + Math.abs(dc) !== 1) return blocked('Choose one movement direction.');
  const nr = state.row + dr, nc = state.col + dc;
  if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return blocked('You are at the edge of this platform.');
  const topology = getDeckTopology(grid);
  if (!canTraverseDeck(topology, state, { row: nr, col: nc })) return blocked('The raised platform is inaccessible from here. Find its lift bridge.');
  const tile = grid[nr][nc];
  if (!canEnterTile(tile, state.keyMask, state.switchMask)) return blocked(`Blocked by ${tile}. Find its key or phase switch.`);
  let row = nr, col = nc, keyMask = state.keyMask, switchMask = state.switchMask;
  const spentTraps = [...state.spentTraps];
  let empRemainingTurns = Math.max(0, (state.empRemainingTurns ?? 0) - 1);
  let event: SolverStep['event'] = 'MOVE';
  let description = 'Moved across the platform.';
  const bit = KEY_BITS[tile];
  if (bit !== undefined && !(keyMask & bit)) {
    keyMask |= bit; event = 'COLLECT_KEY'; description = `Collected ${tile}.`;
  } else if (tile === 'SWITCH_A') {
    switchMask ^= 1; event = 'TOGGLE_SWITCH'; description = `Phase switch ${switchMask ? 'ON' : 'OFF'}.`;
  } else if (tile === 'TRAP_RESET' && !spentTraps.includes(`${nr},${nc}`)) {
    spentTraps.push(`${nr},${nc}`); row = 0; col = 0; event = 'TRAP_RESET_TRIGGERED'; description = 'Reset mine triggered. Back to deployment; this mine is now disarmed.';
  } else if (tile === 'PORTAL_A') {
    const destination = findPortalDestination(grid, nr, nc);
    if (destination) { row = destination.row; col = destination.col; event = 'PORTAL_WARP'; description = 'Warped through the linked transit ring.'; }
  } else if (tile === 'EMP_SCRAMBLER' && !spentTraps.includes(`${nr},${nc}`)) {
    spentTraps.push(`${nr},${nc}`); empRemainingTurns = 6; event = 'EMP_JAMMED'; description = 'EMP field triggered. Sensors limited for six moves.';
  } else if (tile === 'GRAVITY_MUD') {
    event = 'GRAVITY_SLOW'; description = 'Cryo coolant slows the next movement.';
  } else if (tile === 'DECOY_EXIT') {
    event = 'DECOY_DISCOVERED'; description = 'Decoy beacon. Keep looking for the real exit.';
  } else if (tile === 'EXIT') {
    event = 'EXIT'; description = 'Sector extraction complete.';
  }
  const level = deckAt(topology, row, col);
  if (level !== deckAt(topology, state.row, state.col) && event === 'MOVE') { event = 'CHANGE_LEVEL'; description = `Crossed lift bridge to deck ${level}.`; }
  const moves = state.moves + 1;
  return { escaped: event === 'EXIT', state: { row, col, keyMask, switchMask, spentTraps, moves, empRemainingTurns,
    lastStep: { row, col, level, stepIndex: moves, keyMask, switchMask, event, tile, description } } };
}

/** EMP narrows human sensors; ordinary human exploration keeps the full room visible. */
export function humanViewStep(grid: Grid, state: HumanState): SolverStep | AgentSimulationStep {
  if (!(state.empRemainingTurns ?? 0)) return state.lastStep;
  const topology = getDeckTopology(grid);
  const level = deckAt(topology, state.row, state.col);
  const onLift = [topology.accessA, topology.accessB].some(access => access?.row === state.row && access.col === state.col);
  const visible = grid.flatMap((row, r) => row.flatMap((_, c) =>
    Math.abs(r - state.row) + Math.abs(c - state.col) <= 1 && (onLift || deckAt(topology, r, c) === level) ? [`${r},${c}`] : []));
  return { ...state.lastStep, visionRadius: 1, empRemainingTurns: state.empRemainingTurns ?? 0,
    triggeredResetPositions: state.spentTraps, objectiveType: 'REACH_EXIT', objectiveTarget: null,
    plannedRoute: [], visibleCells: visible, discoveredCells: visible, knownHazards: state.spentTraps,
    verifiedDecoys: [], decisionLog: state.lastStep.description };
}
