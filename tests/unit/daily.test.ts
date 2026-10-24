import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, Server } from 'http';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createDailyRouter, DailyScoreStore } from '../../src/server/daily';
import { solveBoardBFS } from '../../src/shared/solver';
import { moveHuman, spawnHuman } from '../../src/shared/movement';

let directory: string, server: Server, origin: string, clock: number;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'revescape-daily-'));
  clock = Date.parse('2026-10-25T12:00:00Z');
  const app = express(); app.use(express.json());
  app.use('/api', createDailyRouter({ dataDir: directory, now: () => clock, moveCooldownMs: 0, publicOrigin: 'https://game.test' }));
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
const post = (route: string, body: unknown, headers = {}) => fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('Server-verified daily runs and persistent rankings', () => {
  it('rejects forged movement and scores, resumes an active run, records a real escape, and rolls over at UTC midnight', async () => {
    expect((await post('/daily/start', { name: 'Human', playerToken: 'daily-player-secret-identity' }, { Origin: 'https://evil.test' })).status).toBe(403);
    expect((await post('/daily/move', { runToken: 'forged', moves: 1, dr: 7, dc: 7 })).status).toBe(409);
    const daily = await (await fetch(origin + '/daily')).json();
    expect(daily.date).toBe('2026-10-25');
    const run = await (await post('/daily/start', { name: 'Human', playerToken: 'daily-player-secret-identity' })).json();
    const resumed = await (await post('/daily/start', { name: 'Renamed', playerToken: 'daily-player-secret-identity' })).json();
    expect(resumed.runToken).toBe(run.runToken);
    expect(resumed.name).toBe('Human');
    expect((await post('/daily/move', { runToken: run.runToken, dr: 1, dc: 1, moves: 1 })).status).toBe(400);
    let human = spawnHuman(), last: any;
    const solution = solveBoardBFS(daily.grid);
    for (const expected of solution.steps.slice(1)) {
      const choices = [[-1, 0], [0, 1], [1, 0], [0, -1]].map(([dr, dc]) => ({ dr, dc, result: moveHuman(daily.grid, human, dr, dc) }));
      const next = choices.find(({ result }) => !result.error && result.state.row === expected.row && result.state.col === expected.col && result.state.keyMask === expected.keyMask && result.state.switchMask === expected.switchMask)!;
      const response = await post('/daily/move', { runToken: run.runToken, dr: next.dr, dc: next.dc, moves: 1, keyMask: 7 });
      expect(response.status).toBe(200); last = await response.json(); human = next.result.state;
      expect(last.state.moves).toBe(human.moves);
    }
    expect(last.escaped).toBe(true); expect(last.rankingSaved).toBe(true);
    expect(last.leaderboard[0]).toMatchObject({ name: 'Human', moves: solution.shortestPathLength });
    expect(JSON.stringify(last.leaderboard)).not.toContain(run.runToken);
    expect((await post('/daily/move', { runToken: run.runToken, dr: 0, dc: 1 })).status).toBe(409);
    const stored = new DailyScoreStore(path.join(directory, 'daily-scores.json')); await stored.ready;
    expect(stored.list(daily.date)[0].moves).toBe(solution.shortestPathLength);
    expect(await readFile(path.join(directory, 'daily-scores.json'), 'utf8')).not.toContain('daily-player-secret-identity');
    clock = Date.parse('2026-10-26T00:00:00Z');
    expect((await post('/daily/move', { runToken: run.runToken, dr: 0, dc: 1 })).status).toBe(409);
    expect((await (await fetch(origin + '/daily')).json()).date).toBe('2026-10-26');
  });
  it('bounds new sessions and invalidates the old run token on restart', async () => {
    expect((await post('/daily/start', { name: 'X', playerToken: 'short' })).status).toBe(400);
    const first = await (await post('/daily/start', { name: 'Human', playerToken: 'daily-player-secret-identity' })).json();
    const restarted = await (await post('/daily/start', { name: 'Human', playerToken: 'daily-player-secret-identity', restart: true })).json();
    expect(first.runToken).not.toBe(restarted.runToken);
    expect((await post('/daily/move', { runToken: first.runToken, dr: 0, dc: 1 })).status).toBe(409);
    for (let i = 0; i < 13; i++) expect((await post('/daily/start', { name: 'Human', playerToken: `another-player-identity-${i}` })).status).toBe(200);
    expect((await post('/daily/start', { name: 'Human', playerToken: 'one-more-player-identity' })).status).toBe(429);
  });
  it('serializes concurrent writes, retains only the best score, and loads it after restart', async () => {
    const filename = path.join(directory, 'scores.json');
    const store = new DailyScoreStore(filename);
    await Promise.all([18, 14, 20, 12].map((moves, index) => store.record({ id: 'same-player', name: 'Human', moves, date: '2026-10-25', completedAt: clock + index })));
    const loaded = new DailyScoreStore(filename); await loaded.ready;
    expect(loaded.list('2026-10-25')).toHaveLength(1);
    expect(loaded.list('2026-10-25')[0].moves).toBe(12);
  });
  it('does not overwrite corrupted ranking storage', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const filename = path.join(directory, 'broken.json'); await writeFile(filename, '{broken');
    const store = new DailyScoreStore(filename); await store.ready;
    expect(await store.record({ id: 'one', name: 'Human', moves: 14, date: '2026-10-25', completedAt: clock })).toBe(false);
    expect(await readFile(filename, 'utf8')).toBe('{broken'); log.mockRestore();
  });
  it('enforces server movement cooldown before accepting another intention', async () => {
    const app = express(); app.use(express.json());
    app.use(createDailyRouter({ dataDir: directory, now: () => clock, moveCooldownMs: 150 }));
    const service = createServer(app); await new Promise<void>(resolve => service.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(service.address() as any).port}`;
    const send = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const daily = await (await fetch(base + '/daily')).json();
      const run = await (await send('/daily/start', { name: 'Clocked', playerToken: 'clocked-daily-player-identity' })).json();
      const first = solveBoardBFS(daily.grid).steps[1];
      const direction = [[-1, 0], [0, 1], [1, 0], [0, -1]].find(([dr, dc]) => { const move = moveHuman(daily.grid, spawnHuman(), dr, dc); return !move.error && move.state.row === first.row && move.state.col === first.col; })!;
      expect((await send('/daily/move', { runToken: run.runToken, dr: direction[0], dc: direction[1] })).status).toBe(200);
      expect((await send('/daily/move', { runToken: run.runToken, dr: 1, dc: 1 })).status).toBe(429);
      clock += 150;
      expect((await send('/daily/move', { runToken: run.runToken, dr: 1, dc: 1 })).status).toBe(400);
    } finally { await new Promise<void>(resolve => service.close(() => resolve())); }
  });
});
