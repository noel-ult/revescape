import { runAutonomousAgent } from './agent';
import { computeGridStats, createEmptyMemory } from './board';
import {
  EXIT_POS,
  GRID_COLS,
  GRID_ROWS,
  MAX_BUDGET,
  START_POS,
  TILE_CATALOG,
} from './constants';
import { calculateScore } from './scoring';
import { solveBoardBFS } from './solver';
import { AgentMemory, Grid, TileType, ValidationResult } from './types';
import { validDeckAccess } from './levels';

export function validateBoard(
  grid: Grid,
  priorMemory?: AgentMemory
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(grid) || grid.length !== GRID_ROWS) {
    return {
      valid: false,
      errors: [`Grid must have exactly ${GRID_ROWS} rows.`],
      warnings: [],
      budgetUsed: 0,
      budgetRemaining: MAX_BUDGET,
      tileCounts: {} as Record<TileType, number>,
    };
  }

  for (let r = 0; r < GRID_ROWS; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length !== GRID_COLS) {
      return {
        valid: false,
        errors: [`Row ${r} must have exactly ${GRID_COLS} columns.`],
        warnings: [],
        budgetUsed: 0,
        budgetRemaining: MAX_BUDGET,
        tileCounts: {} as Record<TileType, number>,
      };
    }
    for (let c = 0; c < GRID_COLS; c++) {
      const tile = grid[r][c];
      if (typeof tile !== 'string' || !Object.hasOwn(TILE_CATALOG, tile)) {
        errors.push(`Invalid tile type "${typeof tile === 'string' ? tile : typeof tile}" at (${r}, ${c}).`);
      } else if (!validDeckAccess(tile, r, c)) {
        errors.push(`${TILE_CATALOG[tile].label} at (${r}, ${c}) must stand on the main floor beside its annex.`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      budgetUsed: 0,
      budgetRemaining: MAX_BUDGET,
      tileCounts: {} as Record<TileType, number>,
    };
  }

  if (grid[START_POS.row][START_POS.col] !== 'START') {
    errors.push(
      `Start position at (${START_POS.row}, ${START_POS.col}) must remain START.`
    );
  }

  if (grid[EXIT_POS.row][EXIT_POS.col] !== 'EXIT') {
    errors.push(
      `Exit position at (${EXIT_POS.row}, ${EXIT_POS.col}) must remain EXIT.`
    );
  }

  const { budgetUsed, tileCounts } = computeGridStats(grid);
  const budgetRemaining = MAX_BUDGET - budgetUsed;

  if (budgetUsed > MAX_BUDGET) {
    errors.push(
      `Resource budget exceeded: used ${budgetUsed} / ${MAX_BUDGET} points.`
    );
  }

  for (const [tileKey, count] of Object.entries(tileCounts)) {
    const tile = tileKey as TileType;
    const meta = TILE_CATALOG[tile];
    if (meta && count > meta.maxCount) {
      errors.push(
        `${meta.label} limit exceeded: placed ${count} / max ${meta.maxCount}.`
      );
    }
  }

  if (tileCounts.DOOR_RED > 0 && tileCounts.KEY_RED === 0) {
    warnings.push('Crimson Door placed without a Crimson Key on the board.');
  }
  if (tileCounts.DOOR_CYAN > 0 && tileCounts.KEY_CYAN === 0) {
    warnings.push('Cobalt Door placed without a Cobalt Key on the board.');
  }
  if (tileCounts.DOOR_GOLD > 0 && tileCounts.KEY_GOLD === 0) {
    warnings.push('Solar Door placed without a Solar Key on the board.');
  }
  if (tileCounts.GATE_A_CLOSED > 0 && tileCounts.SWITCH_A === 0) {
    warnings.push('Closed Gate placed without a Pulse Switch on the board.');
  }

  // 1. Complete-information validation solver (BFS)
  const solverResult = solveBoardBFS(grid);
  if (!solverResult.solvable) {
    errors.push(
      solverResult.reason ||
        'Room is unsolvable! The AI Escape Agent must have at least one valid path from START to EXIT.'
    );
  }

  // 2. Autonomous Fog-of-War Planning Agent (Attempt 1 & Adapted Attempt 2)
  let agentResult;
  let adaptedAgentResult;
  if (solverResult.solvable && errors.length === 0) {
    agentResult = runAutonomousAgent(grid, {
      priorMemory: priorMemory ?? createEmptyMemory(),
    });
    if (!agentResult.escaped) {
      errors.push(
        agentResult.reason ||
          'Room causes non-terminating exploration loop beyond safe AI step limits.'
      );
    } else {
      // Also compute Attempt 2 with retained trap/decoy memory so players can compare adaptation!
      adaptedAgentResult = runAutonomousAgent(grid, {
        priorMemory: agentResult.updatedMemory,
      });
    }
  }

  const scoreBreakdown = calculateScore(solverResult, agentResult);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    budgetUsed,
    budgetRemaining,
    tileCounts,
    solverResult,
    agentResult,
    adaptedAgentResult,
    scoreBreakdown,
  };
}
