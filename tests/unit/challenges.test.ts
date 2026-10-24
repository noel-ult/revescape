import { describe, expect, it } from 'vitest';
import { cloneGrid, createEmptyGrid } from '../../src/shared/board';
import { dailyChallenge, decodeFacility, encodeFacility, expeditionBonus, ghostTimeline, scoreExpeditionRun } from '../../src/shared/challenges';
import { EXPEDITION_SECTORS, restoreExpeditionProgress } from '../../src/shared/expedition';
import { validateBoard } from '../../src/shared/validator';
import { runAutonomousAgent, runAutonomousAgentAsync } from '../../src/shared/agent';
import { COOP_SECTORS, moveCoop } from '../../src/shared/coop';
import { moveHuman, spawnHuman } from '../../src/shared/movement';

describe('Campaign challenges, sharing and ghost pacing', () => {
  it('round-trips every solo layout through stable, compact links and rejects corrupt or illegal rooms', () => {
    for (const sector of EXPEDITION_SECTORS) {
      const code = encodeFacility(sector.grid);
      expect(code).toHaveLength(67);
      expect(decodeFacility(code)).toEqual(sector.grid);
      expect(decodeFacility(code)).not.toBe(sector.grid);
    }
    for (const value of ['', 'v2-' + 'A'.repeat(64), 'v1-' + 'Z'.repeat(64), 'v1-' + 'A'.repeat(64), '__proto__']) expect(() => decodeFacility(value)).toThrow();
    const grid = createEmptyGrid(); grid[0][1] = 'WALL'; grid[1][0] = 'WALL';
    expect(() => encodeFacility(grid)).toThrow();
  });
  it('generates the same valid room for a UTC date and different daily layouts across dates', () => {
    const rooms = new Set<string>();
    for (const date of ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']) {
      const daily = dailyChallenge(date);
      expect(dailyChallenge(date)).toEqual(daily);
      expect(validateBoard(daily.grid).valid).toBe(true);
      rooms.add(JSON.stringify(daily.grid));
    }
    expect(rooms.size).toBe(5);
    expect(() => dailyChallenge('2026-02-31')).toThrow();
  });
  it('awards completion, par and achievable sector missions only for an actual escape', () => {
    const run = runAutonomousAgent(EXPEDITION_SECTORS[0].grid);
    const history = run.steps.map(s => ({ ...s, description: s.decisionLog }));
    expect(scoreExpeditionRun('exp-dock', { moves: 14, history, ghostWon: true }, 14)).toEqual({ stars: 3, bonus: true, ghostWon: true });
    expect(scoreExpeditionRun('exp-dock', { moves: 16, history, ghostWon: false }, 14).stars).toBe(2);
    expect(scoreExpeditionRun('exp-dock', { moves: 0, history: [], ghostWon: true }, 14).stars).toBe(0);
    const mirage = runAutonomousAgent(EXPEDITION_SECTORS[4].grid);
    expect(expeditionBonus('exp-mirage')).toContain('decoy');
    let human = spawnHuman(); const humanHistory = [human.lastStep];
    for (let i = 0; i < 15; i++) {
      human = moveHuman(EXPEDITION_SECTORS[4].grid, human, i < 8 ? 0 : 1, i < 8 ? 1 : 0).state;
      humanHistory.push(human.lastStep);
    }
    expect(scoreExpeditionRun('exp-mirage', { moves: human.moves, history: humanHistory, ghostWon: false }, mirage.totalSteps).bonus).toBe(true);
    const restored = restoreExpeditionProgress({ completed: ['exp-dock'], bestMoves: { 'exp-dock': 14 } });
    expect(restored.rewards?.['exp-dock']).toEqual({ stars: 1, bonus: false, ghostWon: false });
  });
  it('times a visible scout independently, including coolant delay, without changing its trace', () => {
    const result = runAutonomousAgent(EXPEDITION_SECTORS[3].grid);
    const before = JSON.stringify(result.steps);
    const times = ghostTimeline(result.steps);
    expect(times[0]).toBe(0);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(result.steps[i - 1].event === 'GRAVITY_SLOW' ? 1050 : 350);
    expect(JSON.stringify(result.steps)).toBe(before);
  });
});

describe('Real checkpoint replanning', () => {
  it('retains the exact prefix, inventory and raised-deck state while continuing an edited room', () => {
    const source = EXPEDITION_SECTORS[6].grid;
    const original = runAutonomousAgent(source);
    const cursor = original.steps.findIndex(s => s.event === 'COLLECT_KEY');
    const grid = cloneGrid(source); grid[7][0] = 'GRAVITY_MUD';
    const prefix = original.steps.slice(0, cursor + 1);
    const result = runAutonomousAgent(grid, { resume: { sourceGrid: source, steps: prefix, decisionEvents: original.decisionEvents, attemptNumber: original.attemptNumber } });
    expect(result.escaped).toBe(true);
    expect(result.steps.slice(0, prefix.length)).toEqual(prefix);
    expect(result.steps[prefix.length].keyMask & prefix.at(-1)!.keyMask).toBe(prefix.at(-1)!.keyMask);
    expect(result.decisionEvents.some(e => e.message.includes('Counterfactual branch'))).toBe(true);
    expect(original.steps.slice(0, prefix.length)).toEqual(prefix);
  });
  it('does not expose unseen edits or masked hazards to the resumed objective selector', async () => {
    const source = createEmptyGrid(); source[0][1] = 'EMP_SCRAMBLER';
    const original = runAutonomousAgent(source);
    const edited = cloneGrid(source); edited[6][6] = 'WALL';
    let snapshot: any;
    await runAutonomousAgentAsync(edited, async observed => { snapshot ??= observed; return { source: 'fallback' }; }, {
      maxSteps: 1, resume: { sourceGrid: source, steps: original.steps.slice(0, 1), decisionEvents: original.decisionEvents, attemptNumber: 1 },
    });
    expect(snapshot).toBeDefined();
    expect(snapshot.knownCells.some((cell: any) => cell.row === 6 && cell.col === 6)).toBe(false);
    expect(snapshot.knownCells.find((cell: any) => cell.row === 0 && cell.col === 1).tile).toBe('EMPTY');
  });
  it('retains disarmed mines and EMP duration instead of creating a fresh spawn', () => {
    const source = EXPEDITION_SECTORS[7].grid;
    const original = runAutonomousAgent(source);
    const cursor = original.steps.findIndex(s => s.event === 'EMP_JAMMED');
    expect(cursor).toBeGreaterThan(0);
    const result = runAutonomousAgent(source, { resume: { sourceGrid: source, steps: original.steps.slice(0, cursor + 1), decisionEvents: original.decisionEvents, attemptNumber: 1 } });
    expect(result.escaped).toBe(true);
    expect(result.steps[cursor + 1].empRemainingTurns).toBe(5);
    expect(result.steps.filter(s => s.event === 'EMP_JAMMED')).toHaveLength(1);
  });
  it('retains used portals and rejects edits that would collapse the scout’s deck topology', () => {
    const relay = EXPEDITION_SECTORS[1].grid;
    const original = runAutonomousAgent(relay);
    const cursor = original.steps.findIndex(s => s.event === 'PORTAL_WARP');
    const replay = runAutonomousAgent(relay, { resume: { sourceGrid: relay, steps: original.steps.slice(0, cursor + 1), decisionEvents: original.decisionEvents, attemptNumber: 1 } });
    expect(replay.escaped).toBe(true);
    expect(replay.steps.filter(s => s.event === 'PORTAL_WARP')).toHaveLength(1);
    const sky = EXPEDITION_SECTORS[6].grid, scout = runAutonomousAgent(sky);
    const edited = sky.map(row => row.map(tile => tile === 'ELEVATOR_A' ? 'EMPTY' as const : tile));
    expect(() => runAutonomousAgent(edited, { resume: { sourceGrid: sky, steps: scout.steps.slice(0, 3), decisionEvents: scout.decisionEvents, attemptNumber: 1 } })).toThrow(/lift topology/);
  });
});

describe('Cooperative pressure and inventory rules', () => {
  it('needs a teammate on the pressure pad, shares a recovered key, and closes the gate when released', () => {
    const grid = COOP_SECTORS[0].grid;
    let players = [spawnHuman(), spawnHuman()];
    const go = (index: number, dr: number, dc: number) => { const result = moveCoop(grid, players, index, dr, dc); expect(result.error).toBeUndefined(); players = result.players; };
    for (let i = 0; i < 3; i++) go(1, 0, 1);
    go(1, 1, 0); go(1, 1, 0);
    expect(moveCoop(grid, players, 1, 1, 0).error).toContain('Blocked');
    go(0, 1, 0); go(0, 1, 0); go(0, 0, 1);
    expect(players.every(p => p.switchMask === 1)).toBe(true);
    go(1, 1, 0); go(1, 1, 0); go(1, 1, 0); go(1, 0, 1); go(1, 0, 1);
    expect(players.every(p => p.keyMask === 1)).toBe(true);
    go(0, 0, 1);
    expect(players.every(p => p.switchMask === 0)).toBe(true);
    expect(players[1].row).toBe(5);
    for (const sector of COOP_SECTORS) expect(validateBoard(sector.grid).valid, sector.name).toBe(true);
  });
});
