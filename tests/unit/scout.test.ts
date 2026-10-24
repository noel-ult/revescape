import express from 'express';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyGrid } from '../../src/shared/board';
import { createScoutRouter } from '../../src/server/scout';

describe('Server-owned solo Luna endpoint', () => {
  it('validates grids, keeps same-origin boundaries, and serves a transparent no-key fallback', async () => {
    const request = vi.fn<typeof fetch>();
    const app = express();
    app.use(express.json());
    app.use('/api', createScoutRouter({ enabled: true, fetch: request }, 'https://game.example'));
    app.use('/invalid', createScoutRouter({ enabled: true, fetch: request }, 'https://game.example'));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scout`;
    const post = (grid: unknown, origin = 'https://game.example', target = url) => fetch(target, {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify({ grid }),
    });
    try {
      expect((await post(createEmptyGrid(), 'https://attacker.example')).status).toBe(403);
      const invalid = await post([['START']], 'https://game.example', url.replace('/api/', '/invalid/'));
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).valid).toBe(false);
      const response = await post(createEmptyGrid());
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.valid).toBe(true);
      expect(result.solverResult.algorithm).toBe('BFS');
      expect(result.agentResult.escaped).toBe(true);
      expect(result.adaptedAgentResult.attemptNumber).toBe(2);
      expect(result.agentResult.planner).toMatchObject({ mode: 'LUNA', modelChoices: 0 });
      expect(result.agentResult.decisionEvents.some((event: { message: string }) => event.message.includes('API key not configured'))).toBe(true);
      expect((await post(createEmptyGrid())).status).toBe(429);
      expect(request).not.toHaveBeenCalled();
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
