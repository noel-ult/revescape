import { Server, Socket } from 'socket.io';
import { runAutonomousAgent } from '../shared/agent';
import { cloneGrid, computeGridStats, createEmptyGrid } from '../shared/board';
import { calculateScore } from '../shared/scoring';
import { solveBoardBFS } from '../shared/solver';
import { SECTORS, Sector } from '../shared/sectors';
import { COOP_SECTORS, moveCoop } from '../shared/coop';
import { moveHuman, spawnHuman } from '../shared/movement';
import { TILE_CATALOG } from '../shared/constants';
import { Grid, MatchMode, MatchPhase, MatchState, PlayerSlot, TileType } from '../shared/types';
import { validateBoard } from '../shared/validator';

interface InternalPlayer extends PlayerSlot {
  socketId: string;
  lastValidGrid: Grid;
  lastMoveAt?: number;
  lastProgressAt?: number;
}

interface InternalMatch {
  mode: MatchMode;
  raceStartedAt?: number;
  roomCode: string;
  phase: MatchPhase;
  roundNumber: number;
  buildDurationSec: 45 | 90;
  remainingSeconds: number;
  hostToken: string;
  players: InternalPlayer[];
  spectators: Set<string>;
  winnerId: string | 'TIE' | null;
  rematchVotes: Set<string>;
  createdAt: number;
  timerHandle?: NodeJS.Timeout;
  phaseTimeoutHandle?: NodeJS.Timeout;
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(existing: Map<string, InternalMatch>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    if (!existing.has(code)) return code;
  }
  return `RM${Date.now().toString().slice(-4)}`;
}

export class MatchManager {
  private io: Server;
  private matches = new Map<string, InternalMatch>();
  private socketToRoom = new Map<string, { roomCode: string; token: string }>();

  private cleanupTimer: NodeJS.Timeout;
  constructor(io: Server, private options: { moveCooldownMs?: number; raceCountdownMs?: number; sectors?: Sector[]; coopSectors?: Sector[] } = {}) {
    this.io = io;
    this.cleanupTimer = setInterval(() => {
      for (const [code, match] of this.matches) {
        const sockets = this.io.sockets.adapter.rooms.get(code);
        if ((!sockets?.size && Date.now() - match.createdAt > 120_000) || Date.now() - match.createdAt > 7_200_000) {
          this.clearTimers(match); this.matches.delete(code);
          for (const [id, mapping] of this.socketToRoom) if (mapping.roomCode === code) { this.io.sockets.sockets.get(id)?.leave(code); this.socketToRoom.delete(id); }
        }
      }
    }, 30_000);
    this.cleanupTimer.unref();
  }

  public close(): void {
    clearInterval(this.cleanupTimer);
    for (const match of this.matches.values()) this.clearTimers(match);
  }

  private playerFor(socket: Socket, match: InternalMatch): InternalPlayer | undefined {
    const binding = this.socketToRoom.get(socket.id);
    if (binding?.roomCode !== match.roomCode) return undefined;
    return match.players.find(player => player.socketId === socket.id && player.token === binding.token);
  }

  private leave(socket: Socket): void {
    const mapping = this.socketToRoom.get(socket.id);
    if (!mapping) return;
    const match = this.matches.get(mapping.roomCode);
    socket.leave(mapping.roomCode); this.socketToRoom.delete(socket.id);
    if (!match) return;
    match.spectators.delete(socket.id);
    const player = match.players.find(p => p.socketId === socket.id);
    if (player) {
      player.connected = false; player.ready = false;
      if (match.phase === 'LOBBY') {
        match.players = match.players.filter(p => p !== player);
        if (match.hostToken === player.token) match.hostToken = match.players[0]?.token ?? '';
      }
    }
    this.broadcastState(match);
  }

  public registerSocket(socket: Socket): void {
    let allowance = 80, updatedAt = Date.now();
    socket.use((packet, next) => {
      const now = Date.now(); allowance = Math.min(80, allowance + (now - updatedAt) * 0.04); updatedAt = now;
      const payload = packet[1];
      const malformed = payload !== undefined && typeof payload !== 'function' &&
        (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          ['roomCode', 'playerName', 'playerToken'].some(key => payload[key] !== undefined &&
            (typeof payload[key] !== 'string' || payload[key].length > 200)));
      if (malformed || allowance < 1) {
        const ack = packet.at(-1); if (typeof ack === 'function') ack({ ok: false, error: 'Invalid or too frequent request.', errors: ['Invalid or too frequent request.'] });
        return;
      }
      allowance--; next();
    });
    socket.on('lobby:leave', () => this.leave(socket));
    socket.on('race:move', (payload: { roomCode?: string; dr?: number; dc?: number }) => {
      const match = this.matches.get(payload?.roomCode?.toUpperCase() ?? '');
      if (!match || match.phase !== 'RACING' || !['RACE', 'COOP'].includes(match.mode) || Date.now() < (match.raceStartedAt ?? 0)) return;
      const player = this.playerFor(socket, match);
      if (!player?.racer || player.racer.finishedAtMs !== undefined || Date.now() < (player.racer.moveReadyAt ?? 0)) return;
      const sectors = match.mode === 'COOP' ? this.options.coopSectors ?? COOP_SECTORS : this.options.sectors ?? SECTORS;
      const sector = sectors[player.racer.stageIndex];
      if (!sector) return;
      const teamMove = match.mode === 'COOP' ? moveCoop(sector.grid, match.players.map(p => p.racer!), match.players.indexOf(player), payload.dr!, payload.dc!) : undefined;
      const result = teamMove ?? moveHuman(sector.grid, player.racer, payload.dr!, payload.dc!);
      if (result.error) { socket.emit('race:blocked', { message: result.error }); return; }
      if (teamMove) match.players.forEach((p, index) => { p.racer = { ...p.racer!, ...teamMove.players[index] }; });
      player.lastMoveAt = Date.now();
      player.racer = { ...player.racer, ...result.state, moveReadyAt: Date.now() + (this.options.moveCooldownMs ?? (result.state.lastStep.event === 'GRAVITY_SLOW' ? 450 : 150)) };
      if (result.escaped) {
        if (match.mode === 'COOP') {
          player.racer.finishedAtMs = Date.now() - match.raceStartedAt!;
          if (match.players.every(p => p.racer?.finishedAtMs !== undefined)) {
            if (player.racer.stageIndex === sectors.length - 1) {
              match.winnerId = 'TEAM'; this.transitionToResults(match); return;
            }
            const nextStage = player.racer.stageIndex + 1;
            for (const member of match.players) member.racer = { ...spawnHuman(), moves: member.racer!.moves,
              lastStep: { ...spawnHuman().lastStep, stepIndex: member.racer!.moves }, stageIndex: nextStage };
          }
          this.broadcastState(match); return;
        }
        const moves = player.racer.moves;
        if (player.racer.stageIndex === sectors.length - 1) {
          player.racer.finishedAtMs = Date.now() - match.raceStartedAt!;
          match.winnerId = player.id; this.transitionToResults(match); return;
        }
        const spawned = spawnHuman();
        player.racer = { ...spawned, moves, lastStep: { ...spawned.lastStep, stepIndex: moves }, stageIndex: player.racer.stageIndex + 1 };
      }
      this.broadcastState(match);
    });
    socket.on(
      'lobby:create',
      (
        payload: {
          playerName?: string;
          playerToken?: string;
          buildDurationSec?: 45 | 90;
          mode?: MatchMode;
        },
        callback?: (res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => void
      ) => {
        try {
          if (this.socketToRoom.has(socket.id) || this.matches.size >= 200) { callback?.({ ok: false, error: 'Leave your current room before creating another, or try again shortly.' }); return; }
          const name = (payload?.playerName || 'Architect-1').trim().slice(0, 20) || 'Architect-1';
          const token = payload?.playerToken || `tok_${socket.id}`;
          const duration: 45 | 90 = payload?.buildDurationSec === 45 ? 45 : 90;

          const roomCode = generateRoomCode(this.matches);
          const emptyGrid = createEmptyGrid();

          const hostPlayer: InternalPlayer = {
            id: 'P1',
            token,
            socketId: socket.id,
            name,
            connected: true,
            ready: false,
            submitted: false,
            budgetUsed: 0,
            tilesPlaced: 0,
            isValidDraft: true,
            lastValidGrid: cloneGrid(emptyGrid),
          };

          const match: InternalMatch = {
            mode: payload?.mode === 'COOP' ? 'COOP' : payload?.mode === 'RACE' ? 'RACE' : 'ARCHITECT',
            roomCode,
            phase: 'LOBBY',
            roundNumber: 1,
            buildDurationSec: duration,
            remainingSeconds: duration,
            hostToken: token,
            players: [hostPlayer],
            spectators: new Set(),
            winnerId: null,
            rematchVotes: new Set(),
            createdAt: Date.now(),
          };

          this.matches.set(roomCode, match);
          this.bindSocketToRoom(socket, roomCode, token);

          const state = this.serializeMatchState(match, token);
          callback?.({ ok: true, roomCode, state });
          this.broadcastState(match);
        } catch (err) {
          callback?.({ ok: false, error: (err as Error).message });
        }
      }
    );

    socket.on(
      'lobby:join',
      (
        payload: {
          roomCode?: string;
          playerName?: string;
          playerToken?: string;
        },
        callback?: (res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => void
      ) => {
        const code = (payload?.roomCode || '').trim().toUpperCase();
        const match = this.matches.get(code);
        if (!match) {
          callback?.({ ok: false, error: `Room "${code}" not found. Check the 6-character code.` });
          return;
        }

        const token = payload?.playerToken || `tok_${socket.id}`;
        const name = (payload?.playerName || `Architect-${match.players.length + 1}`)
          .trim()
          .slice(0, 20);

        // Check if reconnecting player
        const existingPlayer = match.players.find((p) => p.token === token);
        if (existingPlayer) {
          if (existingPlayer.socketId !== socket.id) {
            const previous = this.io.sockets.sockets.get(existingPlayer.socketId);
            previous?.leave(code); this.socketToRoom.delete(existingPlayer.socketId);
            previous?.emit('session:replaced');
          }
          existingPlayer.socketId = socket.id;
          existingPlayer.connected = true;
          if (payload?.playerName?.trim()) {
            existingPlayer.name = name;
          }
          this.bindSocketToRoom(socket, code, token);
          const state = this.serializeMatchState(match, token);
          callback?.({ ok: true, roomCode: code, state });
          this.broadcastState(match);
          return;
        }

        // If room has < 2 players and is in LOBBY, add as Player 2
        if (match.players.length < 2 && match.phase === 'LOBBY') {
          const emptyGrid = createEmptyGrid();
          const newPlayer: InternalPlayer = {
            id: match.players.some(p => p.id === 'P1') ? 'P2' : 'P1',
            token,
            socketId: socket.id,
            name: name || 'Architect-2',
            connected: true,
            ready: false,
            submitted: false,
            budgetUsed: 0,
            tilesPlaced: 0,
            isValidDraft: true,
            lastValidGrid: cloneGrid(emptyGrid),
          };
          match.players.push(newPlayer);
          this.bindSocketToRoom(socket, code, token);
          const state = this.serializeMatchState(match, token);
          callback?.({ ok: true, roomCode: code, state });
          this.broadcastState(match);
          return;
        }

        if (match.spectators.size >= 32) { callback?.({ ok: false, error: 'This room has reached its spectator limit.' }); return; }
        // Otherwise join as spectator
        match.spectators.add(socket.id);
        this.bindSocketToRoom(socket, code, token);
        const state = this.serializeMatchState(match, token);
        callback?.({ ok: true, roomCode: code, state });
        this.broadcastState(match);
      }
    );

    socket.on(
      'lobby:config',
      (payload: { roomCode: string; buildDurationSec: 45 | 90 }) => {
        const match = this.matches.get((payload?.roomCode || '').toUpperCase());
        if (!match || match.phase !== 'LOBBY' || this.playerFor(socket, match)?.token !== match.hostToken) return;
        const duration: 45 | 90 = payload.buildDurationSec === 45 ? 45 : 90;
        match.buildDurationSec = duration;
        match.remainingSeconds = duration;
        this.broadcastState(match);
      }
    );

    socket.on(
      'lobby:ready',
      (
        payload: { roomCode: string; playerToken: string; ready: boolean },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const match = this.matches.get((payload?.roomCode || '').toUpperCase());
        if (!match || match.phase !== 'LOBBY') {
          callback?.({ ok: false, error: 'Match is not in Lobby phase.' });
          return;
        }

        const player = this.playerFor(socket, match);
        if (!player) {
          callback?.({ ok: false, error: 'You are not an active player in this lobby.' });
          return;
        }

        player.ready = Boolean(payload.ready);
        callback?.({ ok: true });
        this.broadcastState(match);

        if (match.players.length === 2 && match.players.every((p) => p.ready)) {
          if (match.players.every(p => p.connected)) {
            if (match.mode === 'RACE' || match.mode === 'COOP') this.startRace(match); else this.startBuildingPhase(match);
          }
        }
      }
    );

    socket.on(
      'build:progress',
      (payload: {
        roomCode: string;
        playerToken: string;
        grid: Grid;
      }) => {
        const match = this.matches.get((payload?.roomCode || '').toUpperCase());
        if (!match || match.phase !== 'BUILDING') return;

        const player = this.playerFor(socket, match);
        if (!player || player.submitted) return;

        if (payload.grid) {
          if (Date.now() - (player.lastProgressAt ?? 0) < 200) return;
          player.lastProgressAt = Date.now();
          const validation = validateBoard(payload.grid);
          player.budgetUsed = validation.budgetUsed;
          player.tilesPlaced = Object.entries(validation.tileCounts).reduce((total, [tile, count]) => total + (TILE_CATALOG[tile as TileType].cost > 0 ? count : 0), 0);
          player.isValidDraft = validation.valid;
          if (validation.valid) {
            player.lastValidGrid = cloneGrid(payload.grid);
          }
          this.broadcastState(match);
        }
      }
    );

    socket.on(
      'build:submit',
      (
        payload: {
          roomCode: string;
          playerToken: string;
          grid: Grid;
        },
        callback?: (res: { ok: boolean; errors?: string[]; state?: MatchState }) => void
      ) => {
        const match = this.matches.get((payload?.roomCode || '').toUpperCase());
        if (!match || match.phase !== 'BUILDING') {
          callback?.({ ok: false, errors: ['Building phase is no longer active.'] });
          return;
        }

        const player = this.playerFor(socket, match);
        if (!player) {
          callback?.({ ok: false, errors: ['Player not found in match.'] });
          return;
        }

        if (player.submitted) {
          callback?.({ ok: false, errors: ['Room already submitted and locked.'] });
          return;
        }

        const validation = validateBoard(payload.grid);
        if (!validation.valid || !validation.solverResult || !validation.scoreBreakdown) {
          callback?.({
            ok: false,
            errors: validation.errors.length > 0 ? validation.errors : ['Invalid room configuration.'],
          });
          return;
        }

        const stats = computeGridStats(payload.grid);
        player.grid = cloneGrid(payload.grid);
        player.lastValidGrid = cloneGrid(payload.grid);
        player.budgetUsed = stats.budgetUsed;
        player.tilesPlaced = stats.tilesPlaced;
        player.isValidDraft = true;
        player.submitted = true;
        player.solverResult = validation.solverResult;
        player.agentResult = validation.agentResult;
        player.adaptedAgentResult = validation.adaptedAgentResult;
        player.scoreBreakdown = validation.scoreBreakdown;

        callback?.({ ok: true, state: this.serializeMatchState(match, player.token) });
        this.broadcastState(match);

        if (match.players.length === 2 && match.players.every((p) => p.submitted)) {
          this.finalizeBuildingAndSolve(match);
        }
      }
    );

    socket.on(
      'match:advance_to_results',
      (payload: { roomCode: string }) => {
        const match = this.matches.get((payload?.roomCode || '').toUpperCase());
        if (!match || match.phase !== 'AI_SOLVING' || !this.playerFor(socket, match)) return;
        this.transitionToResults(match);
      }
    );

    socket.on(
      'match:rematch',
      (
        payload: { roomCode: string; playerToken: string },
        callback?: (res: { ok: boolean }) => void
      ) => {
        const match = this.matches.get((payload?.roomCode || '').toUpperCase());
        if (!match || match.phase !== 'RESULTS') {
          callback?.({ ok: false });
          return;
        }

        const player = this.playerFor(socket, match);
        if (!player) {
          callback?.({ ok: false });
          return;
        }

        match.rematchVotes.add(player.token);
        this.broadcastState(match);
        callback?.({ ok: true });

        // Start new round immediately when either both vote or in quick demo flow
        if (match.rematchVotes.size >= 1 && match.players.length === 2) {
          this.resetForRematch(match);
        }
      }
    );

    socket.on('disconnect', () => {
      const mapping = this.socketToRoom.get(socket.id);
      if (!mapping) return;
      this.socketToRoom.delete(socket.id);

      const match = this.matches.get(mapping.roomCode);
      if (!match) return;

      match.spectators.delete(socket.id);
      const player = match.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        if (match.phase === 'LOBBY') {
          player.ready = false;
        }
      }
      this.broadcastState(match);
    });
  }

  private bindSocketToRoom(socket: Socket, roomCode: string, token: string): void {
    const prev = this.socketToRoom.get(socket.id);
    if (prev && prev.roomCode !== roomCode) this.leave(socket);
    socket.join(roomCode);
    this.socketToRoom.set(socket.id, { roomCode, token });
  }

  private startRace(match: InternalMatch): void {
    this.clearTimers(match);
    match.phase = 'RACING'; match.winnerId = null; match.rematchVotes.clear();
    match.raceStartedAt = Date.now() + (this.options.raceCountdownMs ?? 3000);
    for (const player of match.players) { player.racer = { ...spawnHuman(), stageIndex: 0 }; player.lastMoveAt = 0; }
    this.broadcastState(match);
  }

  private startBuildingPhase(match: InternalMatch): void {
    this.clearTimers(match);
    match.phase = 'BUILDING';
    match.remainingSeconds = match.buildDurationSec;
    match.winnerId = null;
    match.rematchVotes.clear();

    const emptyGrid = createEmptyGrid();
    for (const p of match.players) {
      p.submitted = false;
      p.budgetUsed = 0;
      p.tilesPlaced = 0;
      p.isValidDraft = true;
      p.grid = undefined;
      p.solverResult = undefined;
      p.agentResult = undefined;
      p.adaptedAgentResult = undefined;
      p.scoreBreakdown = undefined;
      p.lastValidGrid = cloneGrid(emptyGrid);
    }

    this.broadcastState(match);

    match.timerHandle = setInterval(() => {
      if (match.phase !== 'BUILDING') {
        this.clearTimers(match);
        return;
      }
      match.remainingSeconds = Math.max(0, match.remainingSeconds - 1);
      this.io.to(match.roomCode).emit('match:timer_tick', {
        remainingSeconds: match.remainingSeconds,
        phase: match.phase,
      });

      if (match.remainingSeconds <= 0) {
        this.clearTimers(match);
        this.finalizeBuildingAndSolve(match);
      }
    }, 1000);
  }

  private finalizeBuildingAndSolve(match: InternalMatch): void {
    if (match.phase !== 'BUILDING') return;
    this.clearTimers(match);

    match.phase = 'VALIDATING';
    this.broadcastState(match);

    // Ensure every player has a validated grid & solver result (fallback to lastValidGrid on timeout)
    for (const p of match.players) {
      if (!p.submitted || !p.grid || !p.solverResult || !p.scoreBreakdown) {
        const candidateGrid = p.lastValidGrid || createEmptyGrid();
        const validation = validateBoard(candidateGrid);
        const finalGrid = validation.valid ? candidateGrid : createEmptyGrid();
        const solved = solveBoardBFS(finalGrid);
        const agentRes = runAutonomousAgent(finalGrid);
        const adaptedRes = runAutonomousAgent(finalGrid, {
          priorMemory: agentRes.updatedMemory,
        });
        const score = calculateScore(solved, agentRes);
        const stats = computeGridStats(finalGrid);

        p.grid = cloneGrid(finalGrid);
        p.budgetUsed = stats.budgetUsed;
        p.tilesPlaced = stats.tilesPlaced;
        p.submitted = true;
        p.solverResult = solved;
        p.agentResult = agentRes;
        p.adaptedAgentResult = adaptedRes;
        p.scoreBreakdown = score;
      }
    }

    // Compute winner deterministically
    if (match.players.length === 2) {
      const [p1, p2] = match.players;
      const s1 = p1.scoreBreakdown?.totalScore ?? 0;
      const s2 = p2.scoreBreakdown?.totalScore ?? 0;
      if (s1 > s2) {
        match.winnerId = p1.id;
      } else if (s2 > s1) {
        match.winnerId = p2.id;
      } else {
        // Tie-breaker: optimal path length, then states explored
        const l1 = p1.solverResult?.shortestPathLength ?? 0;
        const l2 = p2.solverResult?.shortestPathLength ?? 0;
        if (l1 > l2) match.winnerId = p1.id;
        else if (l2 > l1) match.winnerId = p2.id;
        else match.winnerId = 'TIE';
      }
    }

    match.phase = 'AI_SOLVING';
    this.broadcastState(match);
  }

  private transitionToResults(match: InternalMatch): void {
    if (match.phase === 'RESULTS') return;
    this.clearTimers(match);
    match.phase = 'RESULTS';
    this.broadcastState(match);
  }

  private resetForRematch(match: InternalMatch): void {
    match.roundNumber += 1;
    if (match.mode === 'RACE' || match.mode === 'COOP') this.startRace(match); else this.startBuildingPhase(match);
  }

  private clearTimers(match: InternalMatch): void {
    if (match.timerHandle) {
      clearInterval(match.timerHandle);
      match.timerHandle = undefined;
    }
    if (match.phaseTimeoutHandle) {
      clearTimeout(match.phaseTimeoutHandle);
      match.phaseTimeoutHandle = undefined;
    }
  }

  private serializeMatchState(match: InternalMatch, viewerToken?: string): MatchState {
    const revealAllGrids = match.phase === 'AI_SOLVING' || match.phase === 'RESULTS';

    return {
      roomCode: match.roomCode,
      serverTime: Date.now(),
      mode: match.mode,
      raceStartedAt: match.raceStartedAt,
      sectorIds: match.mode === 'COOP' ? (this.options.coopSectors ?? COOP_SECTORS).map(s => s.id) : match.mode === 'RACE' ? (this.options.sectors ?? SECTORS).map(sector => sector.id) : undefined,
      phase: match.phase,
      roundNumber: match.roundNumber,
      buildDurationSec: match.buildDurationSec,
      remainingSeconds: match.remainingSeconds,
      hostToken: viewerToken === match.hostToken ? match.hostToken : '',
      spectatorCount: match.spectators.size,
      winnerId: match.winnerId,
      rematchVotes: Array.from(match.rematchVotes),
      createdAt: match.createdAt,
      players: match.players.map((p) => {
        const isSelf = viewerToken && p.token === viewerToken;
        return {
          id: p.id,
          token: isSelf ? p.token : '',
          racer: p.racer,
          name: p.name,
          connected: p.connected,
          ready: p.ready,
          submitted: p.submitted,
          budgetUsed: p.budgetUsed,
          tilesPlaced: p.tilesPlaced,
          isValidDraft: p.isValidDraft,
          grid: revealAllGrids ? p.grid : isSelf ? (p.grid ?? p.lastValidGrid) : undefined,
          solverResult: revealAllGrids ? p.solverResult : undefined,
          agentResult: revealAllGrids ? p.agentResult : undefined,
          adaptedAgentResult: revealAllGrids ? p.adaptedAgentResult : undefined,
          scoreBreakdown: revealAllGrids ? p.scoreBreakdown : undefined,
        };
      }),
    };
  }

  private broadcastState(match: InternalMatch): void {
    const roomSockets = this.io.sockets.adapter.rooms.get(match.roomCode);
    if (!roomSockets) return;

    for (const sockId of roomSockets) {
      const sock = this.io.sockets.sockets.get(sockId);
      if (!sock) continue;
      const mapping = this.socketToRoom.get(sockId);
      const state = this.serializeMatchState(match, mapping?.token);
      sock.emit('match:state_update', state);
    }
  }
}
