import { describe, expect, it } from 'vitest';
import { createEmptyGrid, PRESET_BOARDS } from '../../src/shared/board';
import { solveBoardBFS } from '../../src/shared/solver';

describe('Deterministic Multi-State BFS Solver', () => {
  it('solves an empty 8x8 board in exactly 14 moves (Manhattan shortest path)', () => {
    const grid = createEmptyGrid();
    const result = solveBoardBFS(grid);

    expect(result.solvable).toBe(true);
    expect(result.shortestPathLength).toBe(14);
    expect(result.steps.length).toBe(15);
    expect(result.steps[0].row).toBe(0);
    expect(result.steps[0].col).toBe(0);
    expect(result.steps[result.steps.length - 1].row).toBe(7);
    expect(result.steps[result.steps.length - 1].col).toBe(7);
    expect(result.meaningfulInteractions).toBe(0);
  });

  it('rejects a completely walled-off start position', () => {
    const grid = createEmptyGrid();
    grid[0][1] = 'WALL';
    grid[1][0] = 'WALL';

    const result = solveBoardBFS(grid);
    expect(result.solvable).toBe(false);
    expect(result.steps).toHaveLength(0);
  });

  it('requires collecting a matching colored key before unlocking a colored door', () => {
    const grid = createEmptyGrid();
    // Block row 6 completely except at (6, 7) where we place a Red Door
    for (let c = 0; c < 7; c++) {
      grid[6][c] = 'WALL';
    }
    grid[6][7] = 'DOOR_RED';

    // Without key, should be unsolvable
    const withoutKey = solveBoardBFS(grid);
    expect(withoutKey.solvable).toBe(false);

    // Place KEY_RED at (2, 0) requiring a detour
    grid[2][0] = 'KEY_RED';
    const withKey = solveBoardBFS(grid);
    expect(withKey.solvable).toBe(true);
    expect(withKey.keysCollectedCount).toBe(1);
    expect(withKey.doorsUnlockedCount).toBe(1);
    expect(withKey.meaningfulInteractions).toBeGreaterThanOrEqual(2);
  });

  it('handles floor switches toggling closed and open gates', () => {
    const grid = createEmptyGrid();
    // Block exit at (6,7) and (7,6) with walls/gates
    grid[6][7] = 'WALL';
    grid[7][6] = 'GATE_A_CLOSED';

    // Without switch, GATE_A_CLOSED blocks the exit
    expect(solveBoardBFS(grid).solvable).toBe(false);

    // Add switch at (0, 2)
    grid[0][2] = 'SWITCH_A';
    const solved = solveBoardBFS(grid);
    expect(solved.solvable).toBe(true);
    expect(solved.switchesToggledCount).toBeGreaterThanOrEqual(1);
    expect(solved.gatesPassedCount).toBe(1);
  });

  it('solves all 3 curated preset boards cleanly', () => {
    for (const preset of PRESET_BOARDS) {
      const res = solveBoardBFS(preset.grid);
      expect(res.solvable, `Preset ${preset.id} should be solvable`).toBe(true);
      expect(res.shortestPathLength).toBeGreaterThan(14);
      expect(res.meaningfulInteractions).toBeGreaterThan(0);
    }
  });
});
