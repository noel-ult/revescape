import { describe, expect, it } from 'vitest';
import { EXPEDITION_SECTORS, isExpeditionUnlocked, restoreExpeditionProgress } from '../../src/shared/expedition';
import { SECTORS } from '../../src/shared/sectors';
import { validateBoard } from '../../src/shared/validator';
import { solveBoardBFS } from '../../src/shared/solver';
import { moveHuman, spawnHuman } from '../../src/shared/movement';
import type { TileType } from '../../src/shared/types';

describe('Dedicated solo expedition', () => {
  it('has eight unique valid rooms separate from race rooms and playable by both humans and the scout', () => {
    expect(EXPEDITION_SECTORS).toHaveLength(8);
    expect(new Set(EXPEDITION_SECTORS.map(s => s.id)).size).toBe(8);
    expect(new Set(EXPEDITION_SECTORS.map(s => JSON.stringify(s.grid))).size).toBe(8);
    const raceRooms = new Set(SECTORS.map(s => JSON.stringify(s.grid)));
    for (const sector of EXPEDITION_SECTORS) {
      expect(raceRooms.has(JSON.stringify(sector.grid))).toBe(false);
      const result = validateBoard(sector.grid);
      expect(result.valid, `${sector.name}: ${result.errors.join(', ')}`).toBe(true);
      expect(result.agentResult?.escaped, sector.name).toBe(true);
      expect(result.budgetUsed).toBeLessThanOrEqual(30);

      // Execute the full BFS solution through the actual manual movement engine,
      // including portal jumps, one-shot reset mines, keys, polarity and lifts.
      let human = spawnHuman();
      let escaped = false;
      for (const expected of result.solverResult!.steps.slice(1)) {
        const legal = [[-1, 0], [0, 1], [1, 0], [0, -1]].map(([dr, dc]) => moveHuman(sector.grid, human, dr, dc));
        const move = legal.find(m => !m.error && m.state.row === expected.row && m.state.col === expected.col &&
          m.state.keyMask === expected.keyMask && m.state.switchMask === expected.switchMask);
        expect(move, `${sector.id}: human route diverged at step ${expected.stepIndex}`).toBeDefined();
        human = move!.state;
        escaped = move!.escaped;
      }
      expect(escaped, sector.name).toBe(true);
      expect(human.moves).toBe(result.solverResult!.shortestPathLength);
    }
  });

  it('requires each advertised core mechanic instead of allowing an empty-floor bypass', () => {
    const required: Array<[string, TileType[]]> = [
      ['exp-relay', ['PORTAL_A']], ['exp-aerial', ['KEY_RED']], ['exp-cryo', ['SWITCH_A']],
      ['exp-vault', ['KEY_RED', 'KEY_CYAN', 'KEY_GOLD']],
      ['exp-sky', ['KEY_RED', 'KEY_CYAN']], ['exp-command', ['KEY_RED', 'KEY_CYAN', 'SWITCH_A']],
    ];
    for (const [id, tiles] of required) {
      const sector = EXPEDITION_SECTORS.find(s => s.id === id)!;
      for (const tile of tiles) {
        const removed = sector.grid.map(row => row.map(t => t === tile ? 'EMPTY' as const : t));
        expect(solveBoardBFS(removed).solvable, `${id} must require ${tile}`).toBe(false);
      }
    }
    for (const id of ['exp-sky', 'exp-command']) {
      const result = solveBoardBFS(EXPEDITION_SECTORS.find(s => s.id === id)!.grid);
      expect(new Set(result.steps.map(s => s.level))).toEqual(new Set([0, 1, 2]));
    }
    expect(solveBoardBFS(EXPEDITION_SECTORS[4].grid).steps.some(s => s.event === 'TRAP_RESET_TRIGGERED')).toBe(true);
  });

  it('restores only a contiguous unlocked route, valid scores and an accessible selected sector', () => {
    const ids = EXPEDITION_SECTORS.map(s => s.id);
    const fresh = restoreExpeditionProgress(null);
    expect(fresh).toEqual({ completed: [], bestMoves: {}, selectedSectorId: ids[0] });
    expect(isExpeditionUnlocked([], 0)).toBe(true);
    expect(isExpeditionUnlocked([], -1)).toBe(false);
    expect(isExpeditionUnlocked(ids, 8)).toBe(false);
    expect(isExpeditionUnlocked([], 1)).toBe(false);
    const restored = restoreExpeditionProgress({
      completed: [ids[0], ids[1], ids[3], 'arrival'],
      bestMoves: { [ids[0]]: 14, [ids[1]]: -1, [ids[3]]: 12 }, selectedSectorId: ids[7],
    });
    expect(restored).toMatchObject({ completed: ids.slice(0, 2), bestMoves: { [ids[0]]: 14 }, selectedSectorId: ids[2] });
    expect(restoreExpeditionProgress({ completed: ids, selectedSectorId: ids[3] }).selectedSectorId).toBe(ids[3]);
    expect(restoreExpeditionProgress('broken')).toEqual(fresh);
    expect(restoreExpeditionProgress({ completed: 'invalid', bestMoves: null })).toEqual(fresh);
  });
});
