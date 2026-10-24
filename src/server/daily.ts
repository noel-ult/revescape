import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { dailyChallenge } from '../shared/challenges';
import { HumanState, moveHuman, spawnHuman } from '../shared/movement';

interface Score { date: string; id: string; name: string; moves: number; completedAt: number; }
interface DailyRun { token: string; id: string; name: string; date: string; state: HumanState; readyAt: number; escaped: boolean; startedAt: number; }

export class DailyScoreStore {
  private scores: Score[] = [];
  private queue = Promise.resolve();
  private writable = true;
  readonly ready: Promise<void>;
  constructor(private filename: string) {
    this.ready = readFile(filename, 'utf8').then(text => {
      const rows: unknown = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('Invalid score storage.');
      this.scores = rows.filter((s): s is Score => !!s && typeof s === 'object' && typeof s.date === 'string' &&
        typeof s.id === 'string' && typeof s.name === 'string' && Number.isSafeInteger(s.moves) && s.moves > 0 && Number.isFinite(s.completedAt));
    }).catch(error => {
      if (error.code !== 'ENOENT') { this.writable = false; console.error('[daily] Score storage could not be read; existing data will not be overwritten.'); }
    });
  }
  list(date: string) {
    return this.scores.filter(s => s.date === date).sort((a, b) => a.moves - b.moves || a.completedAt - b.completedAt)
      .slice(0, 25).map(({ name, moves, completedAt }) => ({ name, moves, completedAt }));
  }
  async record(score: Score): Promise<boolean> {
    await this.ready;
    if (!this.writable) return false;
    let saved = false;
    const work = this.queue.then(async () => {
      const previous = this.scores.find(s => s.date === score.date && s.id === score.id);
      if (previous && previous.moves <= score.moves) { saved = true; return; }
      const cutoff = new Date(score.completedAt - 31 * 86400000).toISOString().slice(0, 10);
      const next = this.scores.filter(s => s !== previous && s.date >= cutoff);
      next.push(score);
      // Bound file growth; retain the strongest scores per day, not an unbounded identity list.
      const perDay = new Map<string, number>();
      const retained = next.sort((a, b) => a.moves - b.moves || a.completedAt - b.completedAt).filter(s => {
        const count = perDay.get(s.date) ?? 0; perDay.set(s.date, count + 1); return count < 500;
      });
      await mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = this.filename + '.tmp';
      await writeFile(temporary, JSON.stringify(retained), { mode: 0o600 });
      await rename(temporary, this.filename);
      this.scores = retained; saved = true;
    });
    this.queue = work.catch(() => { console.error('[daily] Could not save a verified result.'); });
    await this.queue;
    return saved;
  }
}

export function createDailyRouter(options: { dataDir: string; publicOrigin?: string; now?: () => number; moveCooldownMs?: number }) {
  const router = Router();
  const now = options.now ?? Date.now;
  const store = new DailyScoreStore(path.join(options.dataDir, 'daily-scores.json'));
  const runs = new Map<string, DailyRun>();
  const identity = new Map<string, string>();
  const starts = new Map<string, { count: number; until: number }>();
  let cached: ReturnType<typeof dailyChallenge>;
  const challenge = () => {
    const date = new Date(now()).toISOString().slice(0, 10);
    if (!cached || cached.date !== date) cached = dailyChallenge(date);
    return cached;
  };
  const publicRun = (run: DailyRun) => ({ runToken: run.token, name: run.name, state: run.state, escaped: run.escaped, date: run.date });
  router.use((req, res, next) => {
    if (req.method !== 'GET') {
      const expected = options.publicOrigin ?? `${req.protocol}://${req.get('host')}`;
      if (req.get('origin') && req.get('origin') !== expected) { res.status(403).json({ error: 'Use the game’s own URL for daily runs.' }); return; }
    }
    next();
  });
  router.get('/daily', async (_req, res) => {
    await store.ready;
    const daily = challenge();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...daily, leaderboard: store.list(daily.date), resetsAt: Date.parse(daily.date + 'T00:00:00Z') + 86400000 });
  });
  router.post('/daily/start', (req, res) => {
    const { playerToken, name, restart } = req.body ?? {};
    if (typeof playerToken !== 'string' || playerToken.length < 16 || playerToken.length > 200 || typeof name !== 'string' || !name.trim() || name.length > 20) {
      res.status(400).json({ error: 'Enter a callsign of 1–20 characters.' }); return;
    }
    const date = challenge().date;
    for (const [token, run] of runs) if (run.date !== date || now() - run.startedAt > 3600000) {
      runs.delete(token); if (identity.get(run.id) === token) identity.delete(run.id);
    }
    const id = createHash('sha256').update(playerToken).digest('hex');
    const existing = runs.get(identity.get(id) ?? '');
    if (existing && !restart) { res.json(publicRun(existing)); return; }
    const ip = req.ip ?? 'unknown';
    const bucket = starts.get(ip);
    if (bucket && bucket.until > now() && bucket.count >= 15 || runs.size >= 1000) {
      res.status(429).json({ error: 'Too many new runs. Try again in a minute.' }); return;
    }
    if (starts.size > 5000) for (const [key, value] of starts) if (value.until <= now()) starts.delete(key);
    starts.set(ip, bucket && bucket.until > now() ? { ...bucket, count: bucket.count + 1 } : { count: 1, until: now() + 60000 });
    if (existing) runs.delete(existing.token);
    const run: DailyRun = { token: randomUUID(), id, name: name.trim(), date, state: spawnHuman(), readyAt: now(), escaped: false, startedAt: now() };
    runs.set(run.token, run); identity.set(id, run.token);
    res.json(publicRun(run));
  });
  router.post('/daily/move', async (req, res) => {
    const { runToken, dr, dc } = req.body ?? {};
    const run = typeof runToken === 'string' ? runs.get(runToken) : undefined;
    if (!run || run.date !== challenge().date) { res.status(409).json({ error: 'This daily run expired. Start today’s challenge again.' }); return; }
    if (run.escaped) { res.status(409).json({ error: 'This run is already complete. Start a new attempt to improve your score.' }); return; }
    if (now() < run.readyAt) { res.status(429).json({ error: 'Wait for the next movement.' }); return; }
    const result = moveHuman(challenge().grid, run.state, dr, dc);
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    run.state = result.state;
    run.escaped = result.escaped;
    run.readyAt = now() + (options.moveCooldownMs ?? (run.state.lastStep.event === 'GRAVITY_SLOW' ? 450 : 150));
    let saved = true;
    if (run.escaped) saved = await store.record({ date: run.date, id: run.id, name: run.name, moves: run.state.moves, completedAt: now() });
    res.json({ ...publicRun(run), leaderboard: store.list(run.date), rankingSaved: saved });
  });
  return router;
}
