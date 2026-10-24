import { Server, Socket } from 'socket.io';
import { runAutonomousAgent } from '../shared/agent';
import { cloneGrid, computeGridStats, createEmptyGrid } from '../shared/board';
import { calculateScore } from '../shared/scoring';
import { solveBoardBFS } from '../shared/solver';
import { Grid, MatchPhase, MatchState, PlayerSlot } from '../shared/types';
import { validateBoard } from '../shared/validator';

interface InternalPlayer extends PlayerSlot {
  socketId: string;
  lastValidGrid: Grid;
}

interface InternalMatch {
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

  constructor(io: Server) {
    this.io = io;
  }

  public registerSocket(socket: Socket): void {
    socket.on(
      'lobby:create',
      (
        payload: {
          playerName?: string;
          playerToken?: string;
          buildDurationSec?: 45 | 90;
        },
        callback?: (res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => void
      ) => {
        try {
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
            id: match.players.length === 0 ? 'P1' : 'P2',
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
        if (!match || match.phase !== 'LOBBY') return;
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

        const player = match.players.find(
          (p) => p.token === payload.playerToken || p.socketId === socket.id
        );
        if (!player) {
          callback?.({ ok: false, error: 'You are not an active player in this lobby.' });
          return;
        }

        player.ready = Boolean(payload.ready);
        callback?.({ ok: true });
        this.broadcastState(match);

        if (match.players.length === 2 && match.players.every((p) => p.ready)) {
          this.startBuildingPhase(match);
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

        const player = match.players.find(
          (p) => p.token === payload.playerToken || p.socketId === socket.id
        );
        if (!player || player.submitted) return;

        if (payload.grid) {
          const stats = computeGridStats(payload.grid);
          const validation = validateBoard(payload.grid);
          player.budgetUsed = stats.budgetUsed;
          player.tilesPlaced = stats.tilesPlaced;
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

        const player = match.players.find(
          (p) => p.token === payload.playerToken || p.socketId === socket.id
        );
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
        if (!match || match.phase !== 'AI_SOLVING') return;
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
        if (!match) {
          callback?.({ ok: false });
          return;
        }

        const player = match.players.find(
          (p) => p.token === payload.playerToken || p.socketId === socket.id
        );
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
    if (prev && prev.roomCode !== roomCode) {
      socket.leave(prev.roomCode);
    }
    socket.join(roomCode);
    this.socketToRoom.set(socket.id, { roomCode, token });
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
    this.startBuildingPhase(match);
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
      phase: match.phase,
      roundNumber: match.roundNumber,
      buildDurationSec: match.buildDurationSec,
      remainingSeconds: match.remainingSeconds,
      hostToken: match.hostToken,
      spectatorCount: match.spectators.size,
      winnerId: match.winnerId,
      rematchVotes: Array.from(match.rematchVotes),
      createdAt: match.createdAt,
      players: match.players.map((p) => {
        const isSelf = viewerToken && p.token === viewerToken;
        return {
          id: p.id,
          token: p.token,
          name: p.name,
          connected: p.connected,
          ready: p.ready,
          submitted: p.submitted,
          budgetUsed: p.budgetUsed,
          tilesPlaced: p.tilesPlaced,
          isValidDraft: p.isValidDraft,
          grid: revealAllGrids || isSelf ? p.grid : undefined,
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
