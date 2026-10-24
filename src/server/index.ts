import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { validateBoard } from '../shared/validator';
import { MatchManager } from './matchManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'reverse-escape-server',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/validate', (req, res) => {
  const { grid } = req.body ?? {};
  const result = validateBoard(grid);
  res.json(result);
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const matchManager = new MatchManager(io);

io.on('connection', (socket) => {
  matchManager.registerSocket(socket);
});

// Serve static production frontend bundle if built
const distDir = path.resolve(__dirname, '../../dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('Reverse Escape Backend Server Running.');
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[REVERSE ESCAPE] Server listening on http://localhost:${PORT}`);
});
