import { describe, expect, it, vi } from 'vitest';
import { runAutonomousAgent, runAutonomousAgentAsync, ObjectiveSnapshot } from '../../src/shared/agent';
import { createEmptyGrid } from '../../src/shared/board';
import { SHOWCASE_FACILITY } from '../../src/shared/facility';
import { canTraverseDeck, getDeckTopology } from '../../src/shared/levels';
import { createLunaPolicy } from '../../src/server/luna';

const snapshot: ObjectiveSnapshot = {
  stepIndex: 0, position: { row: 0, col: 0 }, keyMask: 0, switchMask: 0, empRemainingTurns: 0,
  topology: { accessA: null, accessB: null }, knownCells: [], knownHazards: [], disarmedHazards: [], verifiedDecoys: [], signals: [],
  candidates: [
    { id: '0', type: 'EXPLORE_FRONTIER', target: { row: 0, col: 1 }, score: 500, moves: 1 },
    { id: '1', type: 'EXPLORE_FRONTIER', target: { row: 1, col: 0 }, score: 450, moves: 1 },
  ],
};
const answer = (choice: unknown = '1') => new Response(JSON.stringify({
  answers: [{ name: 'objective', type: 'choice', choice }],
}), { headers: { 'Content-Type': 'application/json' } });

describe('Luna Decisions objective policy', () => {
  it('uses the documented endpoint/model/choice schema with server-side authorization', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(answer());
    const result = await createLunaPolicy({ enabled: true, apiKey: 'test-secret', fetch: request })(snapshot);
    expect(result).toEqual({ source: 'luna', candidateId: '1' });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/decisions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-secret' });
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.questions[0]).toMatchObject({ type: 'choice', name: 'objective', choices: [{ value: '0' }, { value: '1' }] });
    expect(body.input[0].content[0]).toEqual({ type: 'input_json', data: snapshot });
  });

  it.each([
    ['missing key', { enabled: true }], ['disabled', { enabled: false, apiKey: 'test-secret' }],
  ])('falls back without any network request when %s', async (_, config) => {
    const request = vi.fn<typeof fetch>();
    const result = await createLunaPolicy({ ...config, fetch: request })(snapshot);
    expect(result.source).toBe('fallback');
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['out-of-set choice', () => answer('99')],
    ['wrong choice type', () => answer(1)],
    ['refusal', () => new Response(JSON.stringify({ answers: [{ name: 'objective', type: 'refusal' }] }))],
    ['provider rejection', () => new Response('private provider response', { status: 429 })],
    ['malformed JSON', () => new Response('{')],
  ])('opens a fallback circuit after %s, without leaking provider details', async (_, response) => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const policy = createLunaPolicy({ enabled: true, apiKey: 'test-secret', fetch: request });
    expect(await policy(snapshot)).toEqual({ source: 'fallback', reason: 'decision unavailable' });
    expect(await policy(snapshot)).toEqual({ source: 'fallback', reason: 'decision unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aborts a slow provider, then makes no further calls', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const policy = createLunaPolicy({ enabled: true, apiKey: 'test-secret', fetch: request, timeoutMs: 10 });
    expect((await policy(snapshot)).source).toBe('fallback');
    expect((await policy(snapshot)).source).toBe('fallback');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('bounds per-session calls and honors the server quota', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => answer());
    const policy = createLunaPolicy({ enabled: true, apiKey: 'test-secret', fetch: request, maxCalls: 1 });
    expect((await policy(snapshot)).source).toBe('luna');
    expect(await policy(snapshot)).toMatchObject({ source: 'fallback', reason: 'decision budget reached' });
    expect(request).toHaveBeenCalledTimes(1);
    const limited = createLunaPolicy({ enabled: true, apiKey: 'test-secret', fetch: request, allowCall: () => false });
    expect((await limited(snapshot)).source).toBe('fallback');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('lets a model choice change the actual objective without exposing unknown hazards or distant tiles', async () => {
    const grid = createEmptyGrid();
    grid[0][1] = 'TRAP_RESET';
    grid[6][6] = 'EMP_SCRAMBLER';
    let first: ObjectiveSnapshot | undefined;
    const result = await runAutonomousAgentAsync(grid, async state => {
      first ??= structuredClone(state);
      return { source: 'luna', candidateId: state.candidates[state.candidates.length - 1].id };
    }, { maxSteps: 1 });
    expect(first!.knownCells.length).toBeLessThanOrEqual(6);
    expect(first!.knownCells.find(cell => cell.row === 0 && cell.col === 1)?.tile).toBe('EMPTY');
    expect(first!.knownCells.some(cell => cell.row === 6 && cell.col === 6)).toBe(false);
    const chosen = first!.candidates[first!.candidates.length - 1];
    expect(result.steps[0].objectiveTarget).toEqual(chosen.target);
    expect(result.steps[0].objectiveTarget).not.toEqual(first!.candidates[0].target);
    expect(result.decisionEvents.some(event => event.type === 'LUNA_CHOICE')).toBe(true);
  });

  it('keeps starter paths, both raised decks, and adapted memory identical during fallback', async () => {
    const baseline = runAutonomousAgent(SHOWCASE_FACILITY);
    const policy = createLunaPolicy({ enabled: true });
    const fallback = await runAutonomousAgentAsync(SHOWCASE_FACILITY, policy);
    expect(fallback.escaped).toBe(true);
    expect(fallback.steps.map(step => [step.row, step.col, step.level])).toEqual(baseline.steps.map(step => [step.row, step.col, step.level]));
    expect(new Set(fallback.steps.map(step => step.level))).toEqual(new Set([0, 1, 2]));
    expect(fallback.updatedMemory).toEqual(baseline.updatedMemory);
    expect(fallback.planner).toMatchObject({ modelChoices: 0, fallbackChoices: expect.any(Number) });
    const adapted = await runAutonomousAgentAsync(SHOWCASE_FACILITY, policy, { priorMemory: fallback.updatedMemory });
    expect(adapted.updatedMemory.attemptCount).toBe(2);
  });

  it('enforces deck edges even when a model repeatedly chooses a different candidate', async () => {
    const topology = getDeckTopology(SHOWCASE_FACILITY);
    const result = await runAutonomousAgentAsync(SHOWCASE_FACILITY, async state => ({
      source: 'luna', candidateId: state.candidates[state.stepIndex % state.candidates.length].id,
    }), { maxSteps: 100 });
    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      if (step.event === 'PORTAL_WARP' || step.event === 'TRAP_RESET_TRIGGERED') continue;
      expect(canTraverseDeck(topology, result.steps[i - 1], step)).toBe(true);
    }
  });

  it('rejects a forged objective and recovers from a throwing policy', async () => {
    for (const policy of [async () => ({ source: 'luna' as const, candidateId: 'outside-set' }), async () => { throw new Error('failure'); }]) {
      const result = await runAutonomousAgentAsync(createEmptyGrid(), policy);
      expect(result.escaped).toBe(true);
      expect(result.planner?.modelChoices).toBe(0);
      expect(result.planner!.fallbackChoices).toBeGreaterThan(0);
    }
  });
});
