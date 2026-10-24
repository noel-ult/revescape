import React, { useEffect, useState } from 'react';
import { cloneGrid, computeGridStats, createEmptyGrid } from '../shared/board';
import { Grid, MatchState, PlayerSlot } from '../shared/types';
import { validateBoard } from '../shared/validator';
import { SHOWCASE_FACILITY } from '../shared/facility';
import { ArenaScreen } from './components/ArenaScreen';
import { BuilderScreen } from './components/BuilderScreen';
import { HowToPlayModal } from './components/HowToPlayModal';
import { LandingPage } from './components/LandingPage';
import { LobbyScreen } from './components/LobbyScreen';
import { Navbar } from './components/Navbar';
import { ResultsScreen } from './components/ResultsScreen';
import {
  getPlayerToken,
  getSavedPlayerName,
  getSavedRoomCode,
  getSocket,
  savePlayerName,
  saveRoomCode,
} from './lib/socket';

type AppView =
  | 'LANDING'
  | 'SOLO_BUILD'
  | 'SOLO_ARENA'
  | 'SOLO_RESULTS'
  | 'PVP';

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('LANDING');
  const [playerName, setPlayerName] = useState<string>(
    () => getSavedPlayerName() || 'Architect'
  );
  const [playerToken] = useState<string>(() => getPlayerToken());
  const [connected, setConnected] = useState<boolean>(false);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [landingError, setLandingError] = useState<string | null>(null);
  const [serverBuildErrors, setServerBuildErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);

  // Solo Mode State
  const [soloGrid, setSoloGrid] = useState<Grid>(() => createEmptyGrid());
  const [soloPlayerSlot, setSoloPlayerSlot] = useState<PlayerSlot | null>(null);
  const [pvpReplayArena, setPvpReplayArena] = useState<boolean>(false);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Check URL query param `?room=CODE` or saved session room
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');
      const targetRoom = (urlRoom || getSavedRoomCode()).trim().toUpperCase();

      if (targetRoom) {
        socket.emit(
          'lobby:join',
          {
            roomCode: targetRoom,
            playerName: getSavedPlayerName() || 'Architect',
            playerToken,
          },
          (res: { ok: boolean; state?: MatchState }) => {
            if (res?.ok && res.state) {
              setMatchState(res.state);
              saveRoomCode(res.state.roomCode);
              setView('PVP');
            } else {
              saveRoomCode('');
            }
          }
        );
      }
    };

    const onDisconnect = () => setConnected(false);

    const onStateUpdate = (nextState: MatchState) => {
      setMatchState(nextState);
      setPvpReplayArena(false);
      setView('PVP');
    };

    const onTimerTick = (payload: { remainingSeconds: number }) => {
      setMatchState((prev) =>
        prev ? { ...prev, remainingSeconds: payload.remainingSeconds } : prev
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('match:state_update', onStateUpdate);
    socket.on('match:timer_tick', onTimerTick);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('match:state_update', onStateUpdate);
      socket.off('match:timer_tick', onTimerTick);
    };
  }, [playerToken]);

  const handleChangeName = (name: string) => {
    setPlayerName(name);
    savePlayerName(name);
  };

  const handleCreateLobby = (duration: 45 | 90) => {
    setLandingError(null);
    const socket = getSocket();
    socket.emit(
      'lobby:create',
      {
        playerName: playerName.trim() || 'Architect-1',
        playerToken,
        buildDurationSec: duration,
      },
      (res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => {
        if (res?.ok && res.state) {
          saveRoomCode(res.state.roomCode);
          setMatchState(res.state);
          setView('PVP');
        } else {
          setLandingError(res?.error || 'Could not create multiplayer lobby.');
        }
      }
    );
  };

  const handleJoinLobby = (roomCode: string) => {
    setLandingError(null);
    const socket = getSocket();
    socket.emit(
      'lobby:join',
      {
        roomCode,
        playerName: playerName.trim() || 'Architect-2',
        playerToken,
      },
      (res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => {
        if (res?.ok && res.state) {
          saveRoomCode(res.state.roomCode);
          setMatchState(res.state);
          setView('PVP');
        } else {
          setLandingError(res?.error || `Could not join room ${roomCode}.`);
        }
      }
    );
  };

  const handleLeaveToHome = () => {
    saveRoomCode('');
    setMatchState(null);
    setPvpReplayArena(false);
    setView('LANDING');
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // Solo Mode Handlers
  const handleStartSolo = () => {
    setLandingError(null);
    setSoloGrid(cloneGrid(SHOWCASE_FACILITY));
    setView('SOLO_BUILD');
  };

  const handleSoloSubmit = (submittedGrid: Grid) => {
    const validation = validateBoard(submittedGrid);
    if (!validation.valid || !validation.solverResult || !validation.scoreBreakdown) {
      return;
    }
    const stats = computeGridStats(submittedGrid);
    const slot: PlayerSlot = {
      id: 'SOLO',
      token: playerToken,
      name: playerName.trim() || 'Solo Architect',
      connected: true,
      ready: true,
      submitted: true,
      budgetUsed: stats.budgetUsed,
      tilesPlaced: stats.tilesPlaced,
      isValidDraft: true,
      grid: cloneGrid(submittedGrid),
      solverResult: validation.solverResult,
      agentResult: validation.agentResult,
      adaptedAgentResult: validation.adaptedAgentResult,
      scoreBreakdown: validation.scoreBreakdown,
    };
    setSoloGrid(cloneGrid(submittedGrid));
    setSoloPlayerSlot(slot);
    setView('SOLO_ARENA');
  };

  // PvP Handlers
  const handlePvpToggleReady = (ready: boolean) => {
    if (!matchState) return;
    getSocket().emit('lobby:ready', {
      roomCode: matchState.roomCode,
      playerToken,
      ready,
    });
  };

  const handlePvpChangeDuration = (duration: 45 | 90) => {
    if (!matchState) return;
    getSocket().emit('lobby:config', {
      roomCode: matchState.roomCode,
      buildDurationSec: duration,
    });
  };

  const handlePvpGridProgress = (grid: Grid) => {
    if (!matchState) return;
    getSocket().emit('build:progress', {
      roomCode: matchState.roomCode,
      playerToken,
      grid,
    });
  };

  const handlePvpSubmitRoom = (grid: Grid) => {
    if (!matchState) return;
    setServerBuildErrors([]);
    getSocket().emit(
      'build:submit',
      {
        roomCode: matchState.roomCode,
        playerToken,
        grid,
      },
      (res: { ok: boolean; errors?: string[]; state?: MatchState }) => {
        if (!res?.ok && res?.errors) {
          setServerBuildErrors(res.errors);
        } else if (res?.state) {
          setMatchState(res.state);
        }
      }
    );
  };

  const handlePvpAdvanceToResults = () => {
    setPvpReplayArena(false);
    if (!matchState) return;
    if (matchState.phase === 'AI_SOLVING') {
      getSocket().emit('match:advance_to_results', {
        roomCode: matchState.roomCode,
      });
    }
  };

  const handlePvpRematch = () => {
    if (!matchState) return;
    getSocket().emit('match:rematch', {
      roomCode: matchState.roomCode,
      playerToken,
    });
  };

  const renderContent = () => {
    if (view === 'SOLO_BUILD') {
      return (
        <BuilderScreen
          mode="SOLO"
          initialGrid={soloGrid}
          onSubmitRoom={handleSoloSubmit}
          onExit={handleLeaveToHome}
        />
      );
    }

    if (view === 'SOLO_ARENA' && soloPlayerSlot) {
      return (
        <ArenaScreen
          mode="SOLO"
          players={[soloPlayerSlot]}
          onFinishToResults={() => setView('SOLO_RESULTS')}
        />
      );
    }

    if (view === 'SOLO_RESULTS' && soloPlayerSlot) {
      return (
        <ResultsScreen
          mode="SOLO"
          players={[soloPlayerSlot]}
          winnerId="SOLO"
          onReplayArena={() => setView('SOLO_ARENA')}
          onRematch={() => setView('SOLO_BUILD')}
          onGoHome={handleLeaveToHome}
        />
      );
    }

    if (view === 'PVP' && matchState) {
      if (matchState.phase === 'LOBBY') {
        return (
          <LobbyScreen
            matchState={matchState}
            playerToken={playerToken}
            onToggleReady={handlePvpToggleReady}
            onChangeDuration={handlePvpChangeDuration}
            onLeaveLobby={handleLeaveToHome}
          />
        );
      }

      if (matchState.phase === 'BUILDING' || matchState.phase === 'VALIDATING') {
        const me = matchState.players.find((p) => p.token === playerToken);
        const opponent = matchState.players.find((p) => p.token !== playerToken);

        return (
          <BuilderScreen
            key={`round-${matchState.roundNumber}`}
            mode="PVP"
            remainingSeconds={matchState.remainingSeconds}
            isSubmitted={Boolean(me?.submitted)}
            opponent={opponent}
            serverErrors={serverBuildErrors}
            onGridChange={handlePvpGridProgress}
            onSubmitRoom={handlePvpSubmitRoom}
            onExit={handleLeaveToHome}
          />
        );
      }

      if (matchState.phase === 'AI_SOLVING' || pvpReplayArena) {
        return (
          <ArenaScreen
            mode="PVP"
            players={matchState.players}
            onFinishToResults={handlePvpAdvanceToResults}
          />
        );
      }

      if (matchState.phase === 'RESULTS') {
        return (
          <ResultsScreen
            mode="PVP"
            players={matchState.players}
            winnerId={matchState.winnerId}
            onReplayArena={() => setPvpReplayArena(true)}
            onRematch={handlePvpRematch}
            onGoHome={handleLeaveToHome}
          />
        );
      }
    }

    return (
      <LandingPage
        playerName={playerName}
        onChangePlayerName={handleChangeName}
        onCreateLobby={handleCreateLobby}
        onJoinLobby={handleJoinLobby}
        onStartSolo={handleStartSolo}
        onOpenHelp={() => setHelpOpen(true)}
        errorMessage={landingError}
      />
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        connected={connected}
        roomCode={view === 'PVP' ? matchState?.roomCode : undefined}
        onGoHome={handleLeaveToHome}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <main className="flex-1">{renderContent()}</main>
      <HowToPlayModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
};
