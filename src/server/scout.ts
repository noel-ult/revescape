import { Router } from 'express';
import { runAutonomousAgentAsync } from '../shared/agent';
import { calculateScore } from '../shared/scoring';
import { validateBoard } from '../shared/validator';
import { createLunaPolicy, LunaOptions } from './luna';

/** Solo-only model strategy; competitive rooms continue using their synchronous baseline. */
export function createScoutRouter(options: LunaOptions, publicOrigin?: string) {
  const router = Router();
  let active = 0;
  let quota = { minute: 0, minuteCalls: 0, day: 0, dayCalls: 0 };
  const clients = new Map<string, number>();
  const allowCall = () => {
    const minute = Math.floor(Date.now() / 60_000), day = Math.floor(Date.now() / 86_400_000);
    if (minute !== quota.minute) { quota.minute = minute; quota.minuteCalls = 0; }
    if (day !== quota.day) { quota.day = day; quota.dayCalls = 0; }
    if (quota.minuteCalls >= 60 || quota.dayCalls >= 1000) return false;
    quota.minuteCalls++; quota.dayCalls++; return true;
  };
  router.post('/scout', async (req, res, next) => {
    const requestOrigin = req.get('origin');
    if (requestOrigin && requestOrigin !== (publicOrigin || `${req.protocol}://${req.get('host')}`)) {
      res.status(403).json({ error: 'Use the game origin.' }); return;
    }
    if (active >= 2) { res.status(429).json({ error: 'Scouts are busy. Try again shortly.' }); return; }
    const now = Date.now(), ip = req.ip ?? 'unknown';
    if ((clients.get(ip) ?? 0) > now) { res.status(429).json({ error: 'Wait before launching another Luna scout.' }); return; }
    if (clients.size > 5000) for (const [key, until] of clients) if (until <= now) clients.delete(key);
    clients.set(ip, now + 30_000);
    const validation = validateBoard(req.body?.grid);
    if (!validation.valid || !validation.solverResult) { res.status(400).json(validation); return; }
    active++;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);
    try {
      const policy = createLunaPolicy({ ...options, signal: controller.signal, allowCall });
      const agentResult = await runAutonomousAgentAsync(req.body.grid, policy);
      const adaptedAgentResult = agentResult.escaped
        ? await runAutonomousAgentAsync(req.body.grid, policy, { priorMemory: agentResult.updatedMemory }) : undefined;
      // A failed model exploration is a real run, not an invalid room or fabricated success.
      res.json({ ...validation, agentResult, adaptedAgentResult,
        scoreBreakdown: calculateScore(validation.solverResult, agentResult) });
    } catch (error) { next(error); }
    finally { res.off('close', cancel); active--; }
  });
  return router;
}
