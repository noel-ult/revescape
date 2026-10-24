import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, Socket } from 'socket.io-client';
import { MatchManager } from '../../src/server/matchManager';
import { COOP_SECTORS } from '../../src/shared/coop';
import { SECTORS } from '../../src/shared/sectors';
import type { MatchState } from '../../src/shared/types';

let io: Server, manager: MatchManager, a: Socket, b: Socket, observer: Socket, room: string;
const ack = (socket: Socket, event: string, payload: unknown) => new Promise<any>(resolve => socket.emit(event, payload, resolve));
function state(socket: Socket, condition: (state: MatchState) => boolean) {
  return new Promise<MatchState>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('match:state_update', listen); reject(new Error('Co-op state timed out')); }, 1500);
    const listen = (next: MatchState) => { if (condition(next)) { clearTimeout(timer); socket.off('match:state_update', listen); resolve(next); } };
    socket.on('match:state_update', listen);
  });
}
beforeEach(async () => {
  const http = createServer(); io = new Server(http);
  manager = new MatchManager(io, { moveCooldownMs: 0, raceCountdownMs: 0, coopSectors: [COOP_SECTORS[0], SECTORS[0]] });
  io.on('connection', socket => manager.registerSocket(socket));
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as any).port}`;
  [a, b, observer] = [connect(url), connect(url), connect(url)];
  await Promise.all([a, b, observer].map(socket => new Promise<void>(resolve => socket.on('connect', resolve))));
  room = (await ack(a, 'lobby:create', { playerName: 'Alice', playerToken: 'private-coop-a', mode: 'COOP' })).roomCode;
  await ack(b, 'lobby:join', { roomCode: room, playerName: 'Bob', playerToken: 'private-coop-b' });
});
afterEach(async () => { a.disconnect(); b.disconnect(); observer.disconnect(); manager.close(); await new Promise<void>(resolve => io.close(() => resolve())); });

it('shares keys, waits for both extractions, advances the team once and supports reconnect/rematch', async () => {
  const beginning = state(a, next => next.phase === 'RACING');
  await ack(a, 'lobby:ready', { roomCode: room, ready: true }); await ack(b, 'lobby:ready', { roomCode: room, ready: true });
  let latest = await beginning;
  expect(latest.mode).toBe('COOP');
  const go = async (socket: Socket, index: number, dr: number, dc: number) => {
    const moves = latest.players[index].racer!.moves;
    const next = state(a, s => s.players[index].racer!.moves === moves + 1);
    socket.emit('race:move', { roomCode: room, dr, dc }); latest = await next;
  };
  await go(a, 0, 1, 0); await go(a, 0, 1, 0); await go(a, 0, 0, 1); // Hold the pad.
  for (let i = 0; i < 3; i++) await go(b, 1, 0, 1);
  for (let i = 0; i < 5; i++) await go(b, 1, 1, 0);
  await go(b, 1, 0, 1); await go(b, 1, 0, 1); // Shared red core.
  expect(latest.players.every(p => p.racer!.keyMask === 1)).toBe(true);
  for (let i = 0; i < 2; i++) await go(b, 1, 0, 1);
  await go(b, 1, 1, 0); await go(b, 1, 1, 0);
  expect(latest.players[1].racer!.finishedAtMs).toBeDefined();
  expect(latest.phase).toBe('RACING'); expect(latest.players[0].racer!.stageIndex).toBe(0);
  b.disconnect(); b.connect(); await new Promise<void>(resolve => b.once('connect', resolve));
  const joined = await ack(b, 'lobby:join', { roomCode: room, playerToken: 'private-coop-b' });
  expect(joined.state.players[1].racer.keyMask).toBe(1);
  for (let i = 0; i < 5; i++) await go(a, 0, 0, 1); // Red bypass on col 6.
  for (let i = 0; i < 5; i++) await go(a, 0, 1, 0);
  await go(a, 0, 0, 1);
  expect(latest.players.every(p => p.racer!.stageIndex === 1 && p.racer!.keyMask === 0)).toBe(true);
  for (const [socket, index] of [[a, 0], [b, 1]] as const) {
    for (let i = 0; i < 7; i++) await go(socket, index, 0, 1);
    for (let i = 0; i < 7; i++) await go(socket, index, 1, 0);
  }
  expect(latest.phase).toBe('RESULTS'); expect(latest.winnerId).toBe('TEAM');
  const restarted = state(a, s => s.roundNumber === 2 && s.phase === 'RACING');
  await ack(a, 'match:rematch', { roomCode: room });
  expect((await restarted).players.every(p => p.racer!.stageIndex === 0 && p.racer!.moves === 0)).toBe(true);
});

it('does not allow a spectator to control a teammate or readiness', async () => {
  await ack(observer, 'lobby:join', { roomCode: room, playerToken: 'spectator' });
  expect((await ack(observer, 'lobby:ready', { roomCode: room, playerToken: 'private-coop-a', ready: true })).ok).toBe(false);
  const start = state(a, s => s.phase === 'RACING');
  await ack(a, 'lobby:ready', { roomCode: room, ready: true }); await ack(b, 'lobby:ready', { roomCode: room, ready: true }); await start;
  observer.emit('race:move', { roomCode: room, playerToken: 'private-coop-a', dr: 0, dc: 1 });
  const current = await ack(observer, 'lobby:join', { roomCode: room, playerToken: 'spectator' });
  expect(current.state.players.every((p: any) => !p.token && p.racer.moves === 0)).toBe(true);
});
