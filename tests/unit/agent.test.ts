import { describe, expect, it } from 'vitest';
import { runAutonomousAgent } from '../../src/shared/agent';
import {
  createEmptyGrid,
  createEmptyMemory,
  PRESET_BOARDS,
} from '../../src/shared/board';

describe('Reverse Escape: Mind Wars — Autonomous Planning AI Engine', () => {
  it('starts with partial observability (fog of war) and never sees the full map on step 0', () => {
    const grid = createEmptyGrid();
    const res = runAutonomousAgent(grid, { visibilityRadius: 2 });

    expect(res.escaped).toBe(true);
    // At (0,0) with Manhattan radius 2, only (0,0),(0,1),(0,2),(1,0),(1,1),(2,0) = 6 cells are visible
    expect(res.steps[0].visibleCells.length).toBeLessThanOrEqual(6);
    expect(res.steps[0].discoveredCells.length).toBeLessThan(64);
  });

  it('uses Frontier Exploration & A* to navigate around walls when Exit is in fog of war', () => {
    const grid = createEmptyGrid();
    grid[0][2] = 'WALL';
    grid[1][2] = 'WALL';
    grid[2][2] = 'WALL';

    const res = runAutonomousAgent(grid);
    expect(res.escaped).toBe(true);
    expect(res.explorationSteps).toBeGreaterThan(0);
    // Verify it never stepped onto a WALL
    for (const step of res.steps) {
      expect(grid[step.row][step.col]).not.toBe('WALL');
    }
  });

  it('investigates a Decoy Exit Signal, exposes the hologram, and replans to the True Exit', () => {
    const grid = createEmptyGrid();
    // Place DECOY_EXIT at (0, 4) along top row
    grid[0][4] = 'DECOY_EXIT';

    const res = runAutonomousAgent(grid);
    expect(res.escaped).toBe(true);
    expect(res.decoysInvestigatedCount).toBe(1);
    expect(res.updatedMemory.verifiedDecoys).toContain('0,4');
    expect(
      res.decisionEvents.some((e) => e.type === 'DECOY_EXPOSED')
    ).toBe(true);
  });

  it('recovers from a Reset Pressure Plate (Trap B) on Attempt 1, remembers it, and avoids it on Attempt 2 in fewer steps', () => {
    // Use the Mind Wars: Mirage & Reset preset which has both a Reset Trap and a Decoy
    const mindWarsGrid = PRESET_BOARDS[0].grid;

    // Attempt 1: Fresh memory
    const attempt1 = runAutonomousAgent(mindWarsGrid, {
      priorMemory: createEmptyMemory(),
    });
    expect(attempt1.escaped).toBe(true);
    expect(attempt1.trapsTriggeredCount).toBeGreaterThanOrEqual(1);
    expect(attempt1.updatedMemory.knownHazards.length).toBeGreaterThanOrEqual(1);

    // Attempt 2: Retained memory of discovered Reset Trap & Decoy
    const attempt2 = runAutonomousAgent(mindWarsGrid, {
      priorMemory: attempt1.updatedMemory,
    });
    expect(attempt2.escaped).toBe(true);
    expect(attempt2.trapsTriggeredCount).toBe(0);
    expect(attempt2.memoryAvoidancesCount).toBeGreaterThanOrEqual(1);
    expect(attempt2.totalSteps).toBeLessThan(attempt1.totalSteps);
  });

  it('terminates safely within execution limits when a room is completely blocked', () => {
    const grid = createEmptyGrid();
    grid[0][1] = 'WALL';
    grid[1][0] = 'WALL';

    const res = runAutonomousAgent(grid, { maxSteps: 50 });
    expect(res.escaped).toBe(false);
    expect(res.totalSteps).toBeLessThanOrEqual(50);
  });
});
