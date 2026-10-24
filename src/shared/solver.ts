import { findPortalDestination } from './board';
import {
  DOOR_KEY_BITS,
  EXIT_POS,
  GRID_COLS,
  GRID_ROWS,
  KEY_BITS,
  MAX_SOLVER_STATES,
  START_POS,
  TILE_CATALOG,
} from './constants';
import { ExploredCell, Grid, SolverResult, SolverStep, StepEventType, TileType } from './types';
import { canTraverseDeck, deckAt, getDeckTopology } from './levels';

interface QueueNode {
  row: number;
  col: number;
  keyMask: number;
  switchMask: number;
  resetMask: number;
  parentIndex: number;
  event: StepEventType;
  tile: TileType;
  description: string;
  depth: number;
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // UP
  [0, 1],  // RIGHT
  [1, 0],  // DOWN
  [0, -1], // LEFT
];

export function encodeState(
  row: number,
  col: number,
  keyMask: number,
  switchMask: number,
  resetMask = 0
): number {
  return (
    ((((((row * GRID_COLS + col) << 3) | (keyMask & 0b111)) << 1) |
      (switchMask & 0b1)) <<
      3) |
    (resetMask & 0b111)
  );
}

export function canEnterTile(
  tile: TileType,
  keyMask: number,
  switchMask: number
): boolean {
  if (tile === 'WALL') return false;

  const requiredKeyBit = DOOR_KEY_BITS[tile];
  if (requiredKeyBit !== undefined) {
    return (keyMask & requiredKeyBit) !== 0;
  }

  if (tile === 'GATE_A_CLOSED') {
    return (switchMask & 1) === 1;
  }

  if (tile === 'GATE_A_OPEN') {
    return (switchMask & 1) === 0;
  }

  return true;
}

export function computeNextMasks(
  tile: TileType,
  keyMask: number,
  switchMask: number
): {
  nextKeyMask: number;
  nextSwitchMask: number;
  event: StepEventType;
  description: string;
} {
  let nextKeyMask = keyMask;
  let nextSwitchMask = switchMask;
  let event: StepEventType = 'MOVE';
  let description = `Moved to ${TILE_CATALOG[tile]?.shortLabel ?? tile}`;

  const keyBit = KEY_BITS[tile];
  if (keyBit !== undefined) {
    if ((keyMask & keyBit) === 0) {
      nextKeyMask = keyMask | keyBit;
      event = 'COLLECT_KEY';
      description = `Collected ${TILE_CATALOG[tile].label}`;
    } else {
      event = 'MOVE';
      description = `Stepped over ${TILE_CATALOG[tile].label} pad`;
    }
  } else if (DOOR_KEY_BITS[tile] !== undefined) {
    event = 'UNLOCK_DOOR';
    description = `Unlocked & passed ${TILE_CATALOG[tile].label}`;
  } else if (tile === 'SWITCH_A') {
    nextSwitchMask = switchMask ^ 1;
    event = 'TOGGLE_SWITCH';
    description = `Toggled Pulse Switch (${nextSwitchMask === 1 ? 'ON' : 'OFF'})`;
  } else if (tile === 'GATE_A_CLOSED' || tile === 'GATE_A_OPEN') {
    event = 'PASS_GATE';
    description = `Passed through ${TILE_CATALOG[tile].label}`;
  } else if (tile === 'DECOY_EXIT') {
    event = 'DECOY_DISCOVERED';
    description = 'Passed over Decoy Exit Emitter';
  } else if (tile === 'TRAP_RESET') {
    event = 'TRAP_RESET_TRIGGERED';
    description = 'Stepped on Reset Pressure Plate';
  } else if (tile === 'EXIT') {
    event = 'EXIT';
    description = 'Reached Escape Portal!';
  } else {
    event = 'MOVE';
    description = 'Moved across floor';
  }

  return { nextKeyMask, nextSwitchMask, event, description };
}

function computeMeaningfulInteractions(steps: SolverStep[]): {
  meaningfulInteractions: number;
  keysCollectedCount: number;
  doorsUnlockedCount: number;
  switchesToggledCount: number;
  gatesPassedCount: number;
} {
  const keysUsedForDoors = new Set<TileType>();
  const unlockedDoorPositions = new Set<string>();
  const passedGatePositions = new Set<string>();
  let keysCollectedCount = 0;
  let switchesToggledCount = 0;
  let switchToggledBeforeGate = false;

  for (const step of steps) {
    if (step.event === 'COLLECT_KEY') {
      keysCollectedCount++;
    }
    if (step.event === 'UNLOCK_DOOR') {
      unlockedDoorPositions.add(`${step.row},${step.col}`);
      if (step.tile === 'DOOR_RED') keysUsedForDoors.add('KEY_RED');
      if (step.tile === 'DOOR_CYAN') keysUsedForDoors.add('KEY_CYAN');
      if (step.tile === 'DOOR_GOLD') keysUsedForDoors.add('KEY_GOLD');
    }
    if (step.event === 'TOGGLE_SWITCH') {
      switchesToggledCount++;
      switchToggledBeforeGate = true;
    }
    if (step.event === 'PASS_GATE') {
      passedGatePositions.add(`${step.row},${step.col}`);
    }
  }

  const doorsUnlockedCount = unlockedDoorPositions.size;
  const gatesPassedCount = passedGatePositions.size;

  let meaningfulInteractions = keysUsedForDoors.size + doorsUnlockedCount;
  if (gatesPassedCount > 0) {
    meaningfulInteractions += gatesPassedCount + (switchToggledBeforeGate ? 1 : 0);
  }

  return {
    meaningfulInteractions,
    keysCollectedCount,
    doorsUnlockedCount,
    switchesToggledCount,
    gatesPassedCount,
  };
}

/**
 * Complete-Information Validation Solver (Exhaustive State-Space BFS).
 * Used strictly by the Validation & Scoring Engine to verify that a room has
 * a guaranteed valid solution and to measure the omniscient shortest path.
 * Models dynamic TRAP_RESET plates accurately (first entry teleports to START (0,0)
 * and disarms that plate bit in resetMask).
 */
export function solveBoardBFS(grid: Grid): SolverResult {
  const startTime = performance.now();

  if (
    !grid ||
    grid.length !== GRID_ROWS ||
    grid.some((r) => !r || r.length !== GRID_COLS)
  ) {
    return {
      solvable: false,
      algorithm: 'BFS',
      shortestPathLength: 0,
      statesExplored: 0,
      solveTimeMs: 0,
      steps: [],
      exploredCells: [],
      meaningfulInteractions: 0,
      keysCollectedCount: 0,
      doorsUnlockedCount: 0,
      switchesToggledCount: 0,
      gatesPassedCount: 0,
      reason: 'Invalid grid dimensions',
    };
  }
  const topology = getDeckTopology(grid);

  // Index all TRAP_RESET tiles so each gets a bit (0..2) in resetMask
  const resetTrapIndexMap = new Map<string, number>();
  let trapBitCounter = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] === 'TRAP_RESET') {
        resetTrapIndexMap.set(`${r},${c}`, trapBitCounter++);
      }
    }
  }

  const queue: QueueNode[] = [
    {
      row: START_POS.row,
      col: START_POS.col,
      keyMask: 0,
      switchMask: 0,
      resetMask: 0,
      parentIndex: -1,
      event: 'START',
      tile: grid[START_POS.row][START_POS.col],
      description: 'Spawned at AI Start Teleporter (0,0)',
      depth: 0,
    },
  ];

  const visited = new Set<number>();
  visited.add(encodeState(START_POS.row, START_POS.col, 0, 0, 0));

  const cellStats = new Map<string, ExploredCell>();
  let visitOrderCounter = 0;

  let head = 0;
  let statesExplored = 0;
  let goalNodeIndex = -1;

  while (head < queue.length) {
    if (statesExplored >= MAX_SOLVER_STATES) {
      return {
        solvable: false,
        algorithm: 'BFS',
        shortestPathLength: 0,
        statesExplored,
        solveTimeMs: Number((performance.now() - startTime).toFixed(3)),
        steps: [],
        exploredCells: Array.from(cellStats.values()),
        meaningfulInteractions: 0,
        keysCollectedCount: 0,
        doorsUnlockedCount: 0,
        switchesToggledCount: 0,
        gatesPassedCount: 0,
        reason: 'Exceeded solver state limit',
      };
    }

    const currentIndex = head++;
    const current = queue[currentIndex];
    statesExplored++;

    const cellKey = `${current.row},${current.col}`;
    const existingCell = cellStats.get(cellKey);
    if (existingCell) {
      existingCell.visitCount++;
    } else {
      cellStats.set(cellKey, {
        row: current.row,
        col: current.col,
        visitOrder: visitOrderCounter++,
        visitCount: 1,
      });
    }

    if (current.row === EXIT_POS.row && current.col === EXIT_POS.col) {
      goalNodeIndex = currentIndex;
      break;
    }

    for (const [dr, dc] of DIRECTIONS) {
      const nr = current.row + dr;
      const nc = current.col + dc;

      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) {
        continue;
      }
      if (!canTraverseDeck(topology, current, { row: nr, col: nc })) continue;

      const targetTile = grid[nr][nc];
      if (!canEnterTile(targetTile, current.keyMask, current.switchMask)) {
        continue;
      }

      let finalRow = nr;
      let finalCol = nc;
      let nextResetMask = current.resetMask;
      let { nextKeyMask, nextSwitchMask, event, description } = computeNextMasks(
        targetTile,
        current.keyMask,
        current.switchMask
      );
      const previousDeck = deckAt(topology, current.row, current.col);
      const nextDeck = deckAt(topology, nr, nc);
      if (previousDeck !== nextDeck) {
        if (event === 'MOVE') event = 'CHANGE_LEVEL';
        description += `; crossed lift from deck ${previousDeck} to deck ${nextDeck}`;
      }

      // Model dynamic TRAP_RESET behavior (activates once per attempt, teleports to START)
      if (targetTile === 'TRAP_RESET') {
        const trapIdx = resetTrapIndexMap.get(`${nr},${nc}`);
        const trapBit = trapIdx !== undefined ? 1 << trapIdx : 0;
        if (trapBit !== 0 && (current.resetMask & trapBit) === 0) {
          nextResetMask = current.resetMask | trapBit;
          finalRow = START_POS.row;
          finalCol = START_POS.col;
          event = 'TRAP_RESET_TRIGGERED';
          description = `Warp Mine at (${nr},${nc}) blasted agent back to Spawn (0,0)`;
        } else {
          event = 'MOVE';
          description = `Crossed disarmed Warp Mine at (${nr},${nc})`;
        }
      } else if (targetTile === 'PORTAL_A') {
        const dest = findPortalDestination(grid, nr, nc);
        if (dest) {
          finalRow = dest.row;
          finalCol = dest.col;
          event = 'PORTAL_WARP';
          description = `Quantum Wormhole warped agent from (${nr},${nc}) to (${dest.row},${dest.col})`;
        }
      } else if (targetTile === 'EMP_SCRAMBLER') {
        event = 'EMP_JAMMED';
        description = `EMP Jammer detonated at (${nr},${nc})`;
      } else if (targetTile === 'GRAVITY_MUD') {
        event = 'GRAVITY_SLOW';
        description = `Pushed through Cryo-Stasis Field at (${nr},${nc})`;
      }

      const nextStateId = encodeState(
        finalRow,
        finalCol,
        nextKeyMask,
        nextSwitchMask,
        nextResetMask
      );
      if (visited.has(nextStateId)) {
        continue;
      }

      visited.add(nextStateId);
      queue.push({
        row: finalRow,
        col: finalCol,
        keyMask: nextKeyMask,
        switchMask: nextSwitchMask,
        resetMask: nextResetMask,
        parentIndex: currentIndex,
        event,
        tile: targetTile,
        description,
        depth: current.depth + 1,
      });
    }
  }

  const solveTimeMs = Number((performance.now() - startTime).toFixed(3));
  const exploredCells = Array.from(cellStats.values());

  if (goalNodeIndex === -1) {
    return {
      solvable: false,
      algorithm: 'BFS',
      shortestPathLength: 0,
      statesExplored,
      solveTimeMs,
      steps: [],
      exploredCells,
      meaningfulInteractions: 0,
      keysCollectedCount: 0,
      doorsUnlockedCount: 0,
      switchesToggledCount: 0,
      gatesPassedCount: 0,
      reason:
        'No valid path to the Escape Portal (7,7). Check blocked walls, missing keys, or closed gates.',
    };
  }

  const reconstructedNodes: QueueNode[] = [];
  let cursor = goalNodeIndex;
  while (cursor !== -1) {
    reconstructedNodes.push(queue[cursor]);
    cursor = queue[cursor].parentIndex;
  }
  reconstructedNodes.reverse();

  const steps: SolverStep[] = reconstructedNodes.map((node, idx) => ({
    stepIndex: idx,
    row: node.row,
    col: node.col,
    level: deckAt(topology, node.row, node.col),
    keyMask: node.keyMask,
    switchMask: node.switchMask,
    resetMask: node.resetMask,
    event: node.event,
    tile: node.tile,
    description: node.description,
  }));

  const interactionStats = computeMeaningfulInteractions(steps);

  return {
    solvable: true,
    algorithm: 'BFS',
    shortestPathLength: steps.length - 1,
    statesExplored,
    solveTimeMs,
    steps,
    exploredCells,
    ...interactionStats,
  };
}

export const solveBoard = solveBoardBFS;
