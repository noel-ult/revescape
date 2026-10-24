import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const target = new URL(process.argv[2] || 'http://localhost:3001');
if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Use an http:// or https:// game URL.');
const origin = target.origin;
const clients = [];
const deadline = setTimeout(() => { console.error('Multiplayer smoke check timed out.'); process.exit(1); }, 20000);
function waitState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('match:state_update', listener); reject(new Error('Expected multiplayer state did not arrive.')); }, 8000);
    const listener = state => { if (predicate(state)) { clearTimeout(timer); socket.off('match:state_update', listener); resolve(state); } };
    socket.on('match:state_update', listener);
  });
}
async function connect() {
  const socket = io(origin, { autoConnect: false, transports: ['websocket'], extraHeaders: { Origin: origin }, reconnection: false });
  clients.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  return socket;
}
try {
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200); assert.equal((await health.json()).status, 'ok');
  const html = await fetch(origin).then(response => response.text());
  assert.match(html, /REVERSE ESCAPE/);
  const a = await connect(), b = await connect();
  const created = await a.timeout(5000).emitWithAck('lobby:create', { playerName: 'Deployment check A', playerToken: randomUUID(), mode: 'RACE' });
  assert.equal(created.ok, true); const roomCode = created.roomCode;
  const joined = await b.timeout(5000).emitWithAck('lobby:join', { roomCode, playerName: 'Deployment check B', playerToken: randomUUID() });
  assert.equal(joined.ok, true); assert.equal(joined.state.players.length, 2);
  const racing = waitState(a, state => state.phase === 'RACING');
  await a.timeout(5000).emitWithAck('lobby:ready', { roomCode, ready: true });
  await b.timeout(5000).emitWithAck('lobby:ready', { roomCode, ready: true });
  const state = await racing; assert.equal(state.sectorIds.length, 8);
  await new Promise(resolve => setTimeout(resolve, 3200));
  const moved = waitState(b, next => next.players.find(player => player.id === 'P1')?.racer?.moves === 1);
  a.emit('race:move', { roomCode, dr: 0, dc: 1 });
  await moved;
  console.log(`PASS: ${origin} serves the game; two WebSocket clients joined, started a race, and received authoritative rival movement.`);
} finally {
  for (const client of clients) { client.emit('lobby:leave'); client.disconnect(); }
  clearTimeout(deadline);
}
