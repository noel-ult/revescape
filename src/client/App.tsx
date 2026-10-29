import React, { useEffect, useRef, useState } from 'react';
import { cloneGrid, computeGridStats, createEmptyGrid } from '../shared/board';
import { Grid, MatchMode, MatchState, PlayerSlot, ValidationResult } from '../shared/types';
import { validateBoard } from '../shared/validator';
import { runAutonomousAgentAsync } from '../shared/agent';
import { SHOWCASE_FACILITY } from '../shared/facility';
import { decodeFacility } from '../shared/challenges';
import { OnlineExpeditionScreen } from './components/OnlineExpeditionScreen';
import { AdventureScreen } from './components/AdventureScreen';
import { DailyScreen } from './components/DailyScreen';
import { SharedFacilityScreen } from './components/SharedFacilityScreen';
import { SectorMap } from './components/SectorMap';
import { RaceScreen } from './components/RaceScreen';
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
  | 'ONLINE_EXPEDITION'
  | 'ADVENTURE'
  | 'ENDLESS'
  | 'DAILY'
  | 'SHARED'
  | 'SECTORS'
  | 'LANDING'
  | 'SOLO_BUILD'
  | 'SOLO_ARENA'
  | 'SOLO_RESULTS'
  | 'PVP';

export const App: React.FC = () => {
  const [sharedFacility] = useState<{ grid?: Grid; error?: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('blueprint');
    if (!code || params.has('room')) return null;
    try { return { grid: decodeFacility(code) }; } catch (error) { return { error: (error as Error).message }; }
  });
  const [view, setView] = useState<AppView>(new URLSearchParams(window.location.search).has('expedition') ? 'ONLINE_EXPEDITION' : sharedFacility ? 'SHARED' : 'LANDING');
  const [playerName, setPlayerName] = useState<string>(
    () => getSavedPlayerName() || 'Architect'
  );
  const [playerToken] = useState<string>(() => getPlayerToken());
  const [connected, setConnected] = useState<boolean>(false);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [landingError, setLandingError] = useState<string | null>(null);
  const [serverBuildErrors, setServerBuildErrors] = useState<string[]>([]);
  const [lobbyPending, setLobbyPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);

  // Solo Mode State
  const [soloGrid, setSoloGrid] = useState<Grid>(() => createEmptyGrid());
  const [soloPlayerSlot, setSoloPlayerSlot] = useState<PlayerSlot | null>(null);
  const [scoutMode, setScoutMode] = useState<'DETERMINISTIC' | 'LUNA'>('DETERMINISTIC');
  const [soloPending, setSoloPending] = useState(false);
  const scoutRequest = useRef<AbortController | null>(null);
  const [pvpReplayArena, setPvpReplayArena] = useState<boolean>(false);

  useEffect(() => {
    if (view !== 'SOLO_BUILD') scoutRequest.current?.abort();
    return () => scoutRequest.current?.abort();
  }, [view]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Check URL query param `?room=CODE` or saved session room
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');
      if ((params.has('blueprint') || params.has('expedition')) && !urlRoom) return;
      const targetRoom = (urlRoom || getSavedRoomCode()).trim().toUpperCase();

      if (targetRoom) {
        socket.emit(
          'lobby:join',
          {
            roomCode: targetRoom,
            playerName: getSavedPlayerName() || 'Architect',
            playerToken,
          },
          (res: { ok: boolean; state?: MatchState; error?: string }) => {
            if (res?.ok && res.state) {
              setMatchState(res.state);
              saveRoomCode(res.state.roomCode);
              setView('PVP');
            } else {
              saveRoomCode(''); setMatchState(null); setView('LANDING');
              setLandingError(res?.error ?? 'Your previous room is no longer available. Create a new lobby.');
              const url = new URL(window.location.href); url.searchParams.delete('room'); window.history.replaceState({}, '', url);
            }
          }
        );
      }
    };

    const onDisconnect = () => setConnected(false);
    const onReplaced = () => { saveRoomCode(''); setMatchState(null); setView('LANDING'); setLandingError('This player session was opened in another window.'); };
    const onRestart = () => setLandingError('The game server is restarting. Your room may need to be recreated.');

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
    socket.on('session:replaced', onReplaced);
    socket.on('server:restarting', onRestart);
    socket.on('disconnect', onDisconnect);
    socket.on('match:state_update', onStateUpdate);
    socket.on('match:timer_tick', onTimerTick);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('session:replaced', onReplaced);
      socket.off('server:restarting', onRestart);
      socket.off('disconnect', onDisconnect);
      socket.off('match:state_update', onStateUpdate);
      socket.off('match:timer_tick', onTimerTick);
    };
  }, [playerToken]);

  const handleChangeName = (name: string) => {
    setPlayerName(name);
    savePlayerName(name);
  };

  const handleCreateLobby = (duration: 45 | 90, mode: MatchMode = 'ARCHITECT') => {
    setLandingError(null);
    const socket = getSocket();
    setLobbyPending(true);
    socket.timeout(8000).emit(
      'lobby:create',
      {
        playerName: playerName.trim() || 'Architect-1',
        playerToken,
        buildDurationSec: duration,
        mode,
      },
      (error: Error | null, res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => {
        setLobbyPending(false);
        if (error) { setLandingError('The server did not respond. Check your connection and try again.'); return; }
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
    setLobbyPending(true);
    socket.timeout(8000).emit(
      'lobby:join',
      {
        roomCode,
        playerName: playerName.trim() || 'Architect-2',
        playerToken,
      },
      (error: Error | null, res: { ok: boolean; roomCode?: string; state?: MatchState; error?: string }) => {
        setLobbyPending(false);
        if (error) { setLandingError('The server did not respond. Check your connection and try again.'); return; }
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
    scoutRequest.current?.abort();
    getSocket().emit('lobby:leave');
    getSocket().emit('expedition:leave', {version:1}, () => {});
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

  const handleSoloSubmit = async (submittedGrid: Grid) => {
    if (scoutRequest.current) return;
    let validation = validateBoard(submittedGrid);
    if (!validation.valid || !validation.solverResult || !validation.scoreBreakdown) {
      return;
    }
    if (scoutMode === 'LUNA') {
      const controller = new AbortController();
      scoutRequest.current = controller;
      setSoloPending(true);
      try {
        const response = await fetch('/api/scout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid: submittedGrid }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!response.ok) throw new Error('Scout unavailable');
        const result = await response.json() as ValidationResult;
        if (!result.valid || !result.agentResult || !result.solverResult || !result.scoreBreakdown) throw new Error('Incomplete scout result');
        validation = result;
      } catch {
        if (controller.signal.aborted) return;
        // Run the shared engine locally so fallback counts/events reflect actual decisions.
        const fallback = async () => ({ source: 'fallback' as const, reason: 'Luna service unavailable' });
        validation.agentResult = await runAutonomousAgentAsync(submittedGrid, fallback);
        validation.adaptedAgentResult = await runAutonomousAgentAsync(submittedGrid, fallback, {
          priorMemory: validation.agentResult.updatedMemory,
        });
      } finally {
        scoutRequest.current = null;
        setSoloPending(false);
      }
      if (controller.signal.aborted) return;
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
    if (view === 'ONLINE_EXPEDITION') return <OnlineExpeditionScreen onExit={handleLeaveToHome} />;
    if (view === 'ADVENTURE' || view === 'ENDLESS') return <AdventureScreen key={view} mode={view === 'ENDLESS' ? 'ENDLESS' : 'CAMPAIGN'} onExit={handleLeaveToHome} />;
    if (view === 'DAILY') return <DailyScreen playerName={playerName} playerToken={playerToken} onChangeName={handleChangeName} onExit={handleLeaveToHome} />;
    if (view === 'SHARED' && sharedFacility) return <SharedFacilityScreen facility={sharedFacility} onExit={handleLeaveToHome} onRemix={grid => {
      setSoloGrid(cloneGrid(grid)); setView('SOLO_BUILD');
      window.history.replaceState({}, '', window.location.pathname);
    }} />;
    if (view === 'SECTORS') {
      return <SectorMap onExit={handleLeaveToHome} onOpenStudio={grid => {
        setSoloGrid(cloneGrid(grid)); setView('SOLO_BUILD');
      }} />;
    }
    if (view === 'SOLO_BUILD') {
      return (
        <BuilderScreen
          mode="SOLO"
          initialGrid={soloGrid}
          onSubmitRoom={handleSoloSubmit}
          onExit={handleLeaveToHome}
          scoutMode={scoutMode}
          onScoutModeChange={setScoutMode}
          isLaunching={soloPending}
          isSubmitted={soloPending}
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

      if (matchState.mode === 'RACE' || matchState.mode === 'COOP') {
        return <RaceScreen match={matchState} playerToken={playerToken} connected={connected}
          onMove={(dr, dc) => getSocket().emit('race:move', { roomCode: matchState.roomCode, dr, dc })}
          onRematch={handlePvpRematch} onExit={handleLeaveToHome} />;
      }
      if (matchState.phase === 'BUILDING'  || matchState.phase === 'VALIDATING') {
        const me = matchState.players.find((p) => p.token === playerToken);
        const opponent = matchState.players.find((p) => p.token !== playerToken);

        return (
          <BuilderScreen
            key={`round-${matchState.roundNumber}`}
            mode="PVP"
            initialGrid={me?.grid}
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
        onOpenOnlineExpedition={() => { handleLeaveToHome(); setView('ONLINE_EXPEDITION'); }}
        onOpenAdventure={() => setView('ADVENTURE')}
        onOpenEndless={() => setView('ENDLESS')}
        playerName={playerName}
        onChangePlayerName={handleChangeName}
        onCreateLobby={handleCreateLobby}
        onJoinLobby={handleJoinLobby}
        onStartSolo={handleStartSolo}
        onOpenSectors={() => setView('SECTORS')}
        onOpenDaily={() => setView('DAILY')}
        connected={connected}
        pending={lobbyPending}
        onOpenHelp={() => setHelpOpen(true)}
        errorMessage={landingError}
      />
    );
  };

  return (
    <div className="app-shell">
      <Navbar
        active={view.startsWith('SOLO_')?'SOLO_BUILD':view==='PVP'?'ONLINE_EXPEDITION':view}
        onNavigate={destination => {handleLeaveToHome(); if(destination==='SOLO_BUILD')handleStartSolo();else setView(destination as AppView);}}
        connected={connected}
        roomCode={view === 'PVP' ? matchState?.roomCode : undefined}
        onGoHome={handleLeaveToHome}
        onOpenHelp={() => setHelpOpen(true)}
      />
      {view === 'PVP' && !connected && <p className="connection-banner" role="status">Connection lost. Reconnecting to your multiplayer room…</p>}
      <main className="app-content">{renderContent()}</main>
      <HowToPlayModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
};
