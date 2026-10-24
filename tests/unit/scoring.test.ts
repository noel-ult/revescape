import { describe, expect, it } from 'vitest';
import { createEmptyGrid, PRESET_BOARDS } from '../../src/shared/board';
import { calculateScore } from '../../src/shared/scoring';
import { solveBoardBFS } from '../../src/shared/solver';

describe('Difficulty Scoring & Anti-Cheese Model', () => {
  it('assigns 0 points to an unsolvable board', () => {
    const grid = createEmptyGrid();
    grid[0][1] = 'WALL';
    grid[1][0] = 'WALL';
    const solved = solveBoardBFS(grid);
    const score = calculateScore(solved);
    expect(score.totalScore).toBe(0);
  });

  it('does not award interaction bonus for decoy keys/doors that are never used on the optimal path', () => {
    const emptyGrid = createEmptyGrid();
    const emptyScore = calculateScore(solveBoardBFS(emptyGrid));

    const cheeseGrid = createEmptyGrid();
    // Place key and door in bottom-left corner far off the optimal path
    cheeseGrid[7][0] = 'KEY_RED';
    cheeseGrid[6][0] = 'DOOR_RED';
    const cheeseSolved = solveBoardBFS(cheeseGrid);
    const cheeseScore = calculateScore(cheeseSolved);

    expect(cheeseSolved.meaningfulInteractions).toBe(0);
    expect(cheeseScore.interactionScore).toBe(0);
    expect(cheeseScore.lengthScore).toBe(emptyScore.lengthScore);
  });

  it('awards significantly higher scores to complex preset traps than an empty board', () => {
    const emptyScore = calculateScore(solveBoardBFS(createEmptyGrid()));
    for (const preset of PRESET_BOARDS) {
      const presetScore = calculateScore(solveBoardBFS(preset.grid));
      expect(presetScore.totalScore).toBeGreaterThan(emptyScore.totalScore + 250);
      expect(presetScore.interactionScore).toBeGreaterThan(0);
    }
  });
});
