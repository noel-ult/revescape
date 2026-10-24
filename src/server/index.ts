import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { existsSync } from 'fs';
import { Server } from 'socket.io';
import { validateBoard } from '../shared/validator';
import { MatchManager } from './matchManager';
import { createScoutRouter } from './scout';
import { createDailyRouter } from './daily';

const PORT = Number(process.env.PORT || 3001);
const origin = process.env.PUBLIC_ORIGIN?.replace(/\/$/, '');
const distDir = path.resolve(process.cwd(), 'dist');
if (process.env.NODE_ENV === 'production' && !existsSync(path.join(distDir, 'index.html'))) {
  throw new Error('Production assets are missing. Run npm run build before npm start.');
}
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: origin || false }));
app.use(express.json({ limit: '16kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
let shuttingDown = false;
app.get('/api/health', (_req, res) => {
  res.status(shuttingDown ? 503 : 200).json({ status: shuttingDown ? 'draining' : 'ok', service: 'reverse-escape-server' });
});
const requests = new Map<string, { count: number; resetAt: number }>();
app.post('/api/validate', (req, res) => {
  const now = Date.now(), key = req.ip ?? 'unknown';
  if (requests.size > 5000) for (const [ip, value] of requests) if (value.resetAt <= now) requests.delete(ip);
  const bucket = requests.get(key);
  if (bucket && bucket.resetAt > now && bucket.count >= 30) { res.status(429).json({ error: 'Too many validations. Try again in a minute.' }); return; }
  requests.set(key, bucket && bucket.resetAt > now ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + 60_000 });
  res.json(validateBoard(req.body?.grid));
});
app.use('/api', createScoutRouter({
  enabled: process.env.LUNA_ENABLED === 'true',
  apiKey: process.env.OPENAI_API_KEY,
}, origin));
app.use('/api', createDailyRouter({ dataDir: process.env.DATA_DIR || path.resolve('data'), publicOrigin: origin }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 16 * 1024,
  cors: { origin: origin || false, methods: ['GET', 'POST'] },
  allowRequest: (req, done) => done(null, !origin || !req.headers.origin || req.headers.origin === origin),
});
const manager = new MatchManager(io);
io.on('connection', socket => manager.registerSocket(socket));
app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(distDir, { maxAge: 0 }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) { res.status(404).json({ error: 'Not found.' }); return; }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(distDir, 'index.html'));
});
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error.status || 500).json({ error: error.status === 413 ? 'Request is too large.' : 'Request could not be processed.' });
});
httpServer.listen(PORT, '0.0.0.0', () => console.log(`[REVERSE ESCAPE] Listening on port ${PORT}`));
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true; manager.close();
  io.emit('server:restarting');
  io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
