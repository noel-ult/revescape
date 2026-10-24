import { describe, expect, it } from 'vitest';
import { SECTORS, sectorPosition } from '../../src/shared/sectors';
import { validateBoard } from '../../src/shared/validator';
import { moveHuman, spawnHuman } from '../../src/shared/movement';
import { createEmptyGrid } from '../../src/shared/board';

describe('Orbital levels and human movement', () => {
  it('every platform has a distinct valid, escapable level within the shared budget', () => {
    expect(SECTORS).toHaveLength(8);
    expect(new Set(SECTORS.map(s => s.id)).size).toBe(8);
    expect(new Set(SECTORS.map(s => JSON.stringify(s.grid))).size).toBe(8);
    expect(new Set(SECTORS.map((_, i) => JSON.stringify(sectorPosition(i)))).size).toBe(8);
    for (const sector of SECTORS) {
      const result = validateBoard(sector.grid);
      expect(result.valid, `${sector.name}: ${result.errors.join(', ')}`).toBe(true);
      expect(result.agentResult?.escaped).toBe(true);
      expect(result.budgetUsed).toBeLessThanOrEqual(30);
      expect(result.solverResult?.steps.at(-1)?.event).toBe('EXIT');
    }
  });
  it('rejects diagonal, out-of-range, wall and non-lift deck moves without mutating state', () => {
    const grid = createEmptyGrid();
    grid[1][4] = 'ELEVATOR_A';
    grid[0][1] = 'WALL';
    const spawn = spawnHuman();
    expect(moveHuman(grid, spawn, 1, 1).state).toBe(spawn);
    expect(moveHuman(grid, spawn, -1, 0).state).toBe(spawn);
    expect(moveHuman(grid, spawn, 0, 1).state).toBe(spawn);
    const outside = { ...spawn, row: 0, col: 5 };
    expect(moveHuman(grid, outside, 1, 0).error).toMatch(/lift bridge/);
    const lift = { ...spawn, row: 1, col: 4 };
    const raised = moveHuman(grid, lift, 0, 1);
    expect(raised.state.lastStep.level).toBe(1);
    expect(moveHuman(grid, raised.state, 0, -1).state.lastStep.level).toBe(0);
  });
  it('keeps keys, switches, reset traps and portal semantics identical for humans and races', () => {
    const grid = createEmptyGrid();
    grid[0][1] = 'KEY_RED'; grid[0][2] = 'DOOR_RED'; grid[0][3] = 'SWITCH_A';
    grid[0][4] = 'GATE_A_CLOSED'; grid[0][5] = 'TRAP_RESET';
    let state = spawnHuman();
    for (let i = 0; i < 5; i++) state = moveHuman(grid, state, 0, 1).state;
    expect(state.row).toBe(0); expect(state.col).toBe(0);
    expect(state.keyMask).toBe(1); expect(state.switchMask).toBe(1);
    expect(state.spentTraps).toEqual(['0,5']);
    expect(state.lastStep.event).toBe('TRAP_RESET_TRIGGERED');
    grid[0][1] = 'PORTAL_A'; grid[4][4] = 'PORTAL_A';
    const warped = moveHuman(grid, state, 0, 1);
    expect([warped.state.row, warped.state.col]).toEqual([4, 4]);
    expect(warped.state.lastStep.event).toBe('PORTAL_WARP');
  });
});

it('EMP hides distant contents for six moves and does not retrigger after disarming', async () => {
  const { humanViewStep } = await import('../../src/shared/movement');
  const grid = createEmptyGrid(); grid[0][1] = 'EMP_SCRAMBLER'; grid[0][2] = 'GRAVITY_MUD';
  let state = moveHuman(grid, spawnHuman(), 0, 1).state;
  expect(state.empRemainingTurns).toBe(6);
  expect(state.lastStep.event).toBe('EMP_JAMMED');
  const jammed = humanViewStep(grid, state);
  expect('visibleCells' in jammed && jammed.visibleCells).not.toContain('7,7');
  state = moveHuman(grid, state, 0, 1).state;
  expect(state.lastStep.event).toBe('GRAVITY_SLOW');
  state = moveHuman(grid, state, 0, -1).state;
  expect(state.empRemainingTurns).toBe(4);
  for (let i = 0; i < 4; i++) state = moveHuman(grid, state, 0, i % 2 === 0 ? 1 : -1).state;
  expect(state.empRemainingTurns).toBe(0);
  expect(humanViewStep(grid, state)).toBe(state.lastStep);
});
