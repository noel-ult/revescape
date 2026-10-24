import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { MatchManager } from '../../src/server/matchManager';
import { PRESET_BOARDS, createEmptyGrid } from '../../src/shared/board';
import { MatchState } from '../../src/shared/types';

describe('Real-Time Multiplayer MatchManager (Socket.IO E2E)', () => {
  let httpServer: HttpServer;
  let ioServer: Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    httpServer = createServer(app);
    ioServer = new Server(httpServer);
    const manager = new MatchManager(ioServer);
    ioServer.on('connection', (sock) => manager.registerSocket(sock));

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4000;
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    httpServer.close();
  });

  it('runs a complete 2-player PvP match: Lobby -> Ready -> Build -> Submit -> AI Solve -> Results -> Rematch', async () => {
    const clientA: ClientSocket = Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
    });
    const clientB: ClientSocket = Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((res) => clientA.on('connect', () => res())),
      new Promise<void>((res) => clientB.on('connect', () => res())),
    ]);

    // 1. Player A creates lobby
    const createRes = await new Promise<{
      ok: boolean;
      roomCode?: string;
      state?: MatchState;
    }>((resolve) => {
      clientA.emit(
        'lobby:create',
        {
          playerName: 'AliceTrap',
          playerToken: 'tok_alice',
          buildDurationSec: 45,
        },
        resolve
      );
    });

    expect(createRes.ok).toBe(true);
    const roomCode = createRes.roomCode!;
    expect(roomCode).toHaveLength(6);

    // 2. Player B joins lobby
    const joinRes = await new Promise<{
      ok: boolean;
      roomCode?: string;
      state?: MatchState;
    }>((resolve) => {
      clientB.emit(
        'lobby:join',
        {
          roomCode,
          playerName: 'BobMaze',
          playerToken: 'tok_bob',
        },
        resolve
      );
    });

    expect(joinRes.ok).toBe(true);
    expect(joinRes.state?.players).toHaveLength(2);

    // 3. Both players Ready up -> transitions to BUILDING
    const buildingStatePromise = new Promise<MatchState>((resolve) => {
      clientA.on('match:state_update', (st: MatchState) => {
        if (st.phase === 'BUILDING') resolve(st);
      });
    });

    clientA.emit('lobby:ready', {
      roomCode,
      playerToken: 'tok_alice',
      ready: true,
    });
    clientB.emit('lobby:ready', {
      roomCode,
      playerToken: 'tok_bob',
      ready: true,
    });

    const buildingState = await buildingStatePromise;
    expect(buildingState.phase).toBe('BUILDING');
    expect(buildingState.remainingSeconds).toBe(45);

    // 4. Rejects an unsolvable board submission
    const badGrid = createEmptyGrid();
    badGrid[0][1] = 'WALL';
    badGrid[1][0] = 'WALL';

    const invalidSubmit = await new Promise<{ ok: boolean; errors?: string[] }>(
      (resolve) => {
        clientA.emit(
          'build:submit',
          {
            roomCode,
            playerToken: 'tok_alice',
            grid: badGrid,
          },
          resolve
        );
      }
    );
    expect(invalidSubmit.ok).toBe(false);

    // 5. Player A submits high-scoring preset, Player B submits empty baseline
    const solvingStatePromise = new Promise<MatchState>((resolve) => {
      clientA.on('match:state_update', (st: MatchState) => {
        if (st.phase === 'AI_SOLVING') resolve(st);
      });
    });

    const validSubmitA = await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit(
        'build:submit',
        {
          roomCode,
          playerToken: 'tok_alice',
          grid: PRESET_BOARDS[2].grid,
        },
        resolve
      );
    });
    expect(validSubmitA.ok).toBe(true);

    const validSubmitB = await new Promise<{ ok: boolean }>((resolve) => {
      clientB.emit(
        'build:submit',
        {
          roomCode,
          playerToken: 'tok_bob',
          grid: createEmptyGrid(),
        },
        resolve
      );
    });
    expect(validSubmitB.ok).toBe(true);

    const solvingState = await solvingStatePromise;
    expect(solvingState.phase).toBe('AI_SOLVING');
    expect(solvingState.winnerId).toBe('P1');
    expect(
      solvingState.players[0].scoreBreakdown!.totalScore
    ).toBeGreaterThan(solvingState.players[1].scoreBreakdown!.totalScore);

    // 6. Advance to RESULTS and trigger REMATCH
    const resultsPromise = new Promise<MatchState>((resolve) => {
      clientB.on('match:state_update', (st: MatchState) => {
        if (st.phase === 'RESULTS') resolve(st);
      });
    });
    clientA.emit('match:advance_to_results', { roomCode });
    const resultsState = await resultsPromise;
    expect(resultsState.phase).toBe('RESULTS');

    const rematchPromise = new Promise<MatchState>((resolve) => {
      clientB.on('match:state_update', (st: MatchState) => {
        if (st.phase === 'BUILDING' && st.roundNumber === 2) resolve(st);
      });
    });
    clientA.emit('match:rematch', { roomCode, playerToken: 'tok_alice' });
    const rematchState = await rematchPromise;
    expect(rematchState.roundNumber).toBe(2);
    expect(rematchState.phase).toBe('BUILDING');

    clientA.disconnect();
    clientB.disconnect();
  });
});
