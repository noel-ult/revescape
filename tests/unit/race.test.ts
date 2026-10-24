import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { io as client, Socket } from 'socket.io-client';
import { MatchManager } from '../../src/server/matchManager';
import { MatchState } from '../../src/shared/types';
import { SECTORS } from '../../src/shared/sectors';
import { createEmptyGrid } from '../../src/shared/board';

let http: HTTPServer, io: Server, manager: MatchManager;
let a: Socket, b: Socket, visitor: Socket;
let room: string;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ack = (socket: Socket, event: string, payload: unknown) => socket.timeout(1500).emitWithAck(event, payload);
const nextState = (socket: Socket, predicate: (state: MatchState) => boolean) => new Promise<MatchState>((resolve, reject) => {
  const timer = setTimeout(() => { socket.off('match:state_update', listener); reject(new Error('Expected server state did not arrive')); }, 2000);
  function listener(state: MatchState) { if (predicate(state)) { clearTimeout(timer); socket.off('match:state_update', listener); resolve(state); } }
  socket.on('match:state_update', listener);
});
beforeEach(async () => {
  http = createServer(); io = new Server(http);
  manager = new MatchManager(io, { raceCountdownMs: 0, moveCooldownMs: 0, sectors: [SECTORS[0], { ...SECTORS[0], id: 'arrival-2' }] });
  io.on('connection', socket => manager.registerSocket(socket));
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address() as { port: number };
  const connect = async () => { const socket = client(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] }); await new Promise<void>(resolve => socket.on('connect', resolve)); return socket; };
  a = await connect(); b = await connect(); visitor = await connect();
  const created = await ack(a, 'lobby:create', { playerToken: 'private-a', playerName: 'Alice', mode: 'RACE' }); room = created.roomCode;
  await ack(b, 'lobby:join', { roomCode: room, playerToken: 'private-b', playerName: 'Bob' });
});
afterEach(async () => { a.disconnect(); b.disconnect(); visitor.disconnect(); manager.close(); await new Promise<void>(resolve => io.close(() => resolve())); });

describe('Server-authoritative live race and public-room permissions', () => {
  it('runs checkpoints, synchronized positions, winner, reconnect and rematch', async () => {
    const started = nextState(a, s => s.phase === 'RACING');
    await ack(a, 'lobby:ready', { roomCode: room, ready: true });
    await ack(b, 'lobby:ready', { roomCode: room, ready: true });
    const initial = await started;
    expect(initial.players[1].token).toBe('');
    expect(initial.sectorIds).toEqual(['arrival', 'arrival-2']);
    for (let stage = 0; stage < 2; stage++) {
      for (let i = 0; i < 14; i++) {
        const updated = nextState(b, s => (s.players[0].racer?.moves ?? 0) === stage * 14 + i + 1);
        a.emit('race:move', { roomCode: room, dr: i < 7 ? 0 : 1, dc: i < 7 ? 1 : 0 });
        const state = await updated;
        if (stage === 0 && i === 13) { expect(state.players[0].racer?.stageIndex).toBe(1); expect(state.players[0].racer?.row).toBe(0); }
        if (stage === 1 && i === 13) { expect(state.phase).toBe('RESULTS'); expect(state.winnerId).toBe('P1'); expect(state.players[0].racer?.finishedAtMs).toBeGreaterThanOrEqual(0); }
      }
    }
    a.disconnect(); a.connect(); await new Promise<void>(resolve => a.once('connect', resolve));
    const rejoined = await ack(a, 'lobby:join', { roomCode: room, playerToken: 'private-a' });
    expect(rejoined.state.players[0].racer.moves).toBe(28);
    const restarted = nextState(b, s => s.phase === 'RACING' && s.roundNumber === 2);
    expect((await ack(a, 'match:rematch', { roomCode: room })).ok).toBe(true);
    expect((await restarted).players[0].racer?.moves).toBe(0);
  });
  it('ignores forged identity, spectator actions, malformed grids and non-host configuration', async () => {
    const spectator = await ack(visitor, 'lobby:join', { roomCode: room, playerToken: 'visitor' });
    expect(spectator.state.players.every((p: { token: string }) => !p.token)).toBe(true);
    expect(spectator.state.hostToken).toBe('');
    expect((await ack(visitor, 'lobby:ready', { roomCode: room, playerToken: 'private-a', ready: true })).ok).toBe(false);
    b.emit('lobby:config', { roomCode: room, buildDurationSec: 45 });
    const refreshed = await ack(b, 'lobby:join', { roomCode: room, playerToken: 'private-b' });
    expect(refreshed.state.buildDurationSec).toBe(90);
    expect((await ack(visitor, 'match:rematch', { roomCode: room, playerToken: 'private-a' })).ok).toBe(false);
    expect((await ack(visitor, 'lobby:join', { roomCode: {}, playerToken: [] })).ok).toBe(false);
    const started = nextState(a, s => s.phase === 'RACING');
    await ack(a, 'lobby:ready', { roomCode: room, ready: true }); await ack(b, 'lobby:ready', { roomCode: room, ready: true }); await started;
    visitor.emit('race:move', { roomCode: room, playerToken: 'private-a', dr: 0, dc: 1 });
    a.emit('race:move', { roomCode: room, dr: 4, dc: 4 });
    await wait(30);
    const unchanged = await ack(a, 'lobby:join', { roomCode: room, playerToken: 'private-a' });
    expect(unchanged.state.players[0].racer.moves).toBe(0);
  });
  it('leaving a lobby frees the seat, transfers host ownership and preserves unique player IDs', async () => {
    const freed = nextState(b, s => s.players.length === 1);
    a.emit('lobby:leave');
    expect((await freed).hostToken).toBe('private-b');
    const replacement = await ack(visitor, 'lobby:join', { roomCode: room, playerToken: 'newcomer' });
    expect(new Set(replacement.state.players.map((p: { id: string }) => p.id)).size).toBe(2);
  });
});
