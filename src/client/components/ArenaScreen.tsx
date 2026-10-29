import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Bot,
  Brain,
  Crosshair,
  Eye,
  EyeOff,
  FastForward,
  Flame,
  KeyRound,
  Pause,
  Play,
  Power,
  Radio,
  RotateCcw,
  Trash2,
  Trophy,
} from 'lucide-react';
import { runAutonomousAgent } from '../../shared/agent';
import { cloneGrid, isAnchorCell } from '../../shared/board';
import { solveBoardBFS } from '../../shared/solver';
import { PlayerSlot } from '../../shared/types';
import { soundFX } from '../lib/sound';
import { PuzzleGrid } from './PuzzleGrid';
import { AIExplainer } from './AIExplainer';
import { DecisionRewind } from './DecisionRewind';

interface ArenaScreenProps {
  mode: 'SOLO' | 'PVP';
  players: PlayerSlot[];
  onFinishToResults: () => void;
  onClearMemory?: () => void;
}

export const ArenaScreen: React.FC<ArenaScreenProps> = ({
  mode,
  players: initialPlayers,
  onFinishToResults,
  onClearMemory,
}) => {
  const [players, setPlayers] = useState<PlayerSlot[]>(initialPlayers);
  const [viewMode, setViewMode] = useState<'AI_FOG' | 'WORLD'>('WORLD');
  const [attemptMode, setAttemptMode] = useState<'ATTEMPT_1' | 'ATTEMPT_2'>(
    'ATTEMPT_1'
  );
  const [stepCursor, setStepCursor] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<0.5 | 1 | 2>(1);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [rewindOriginal, setRewindOriginal] = useState<{ players: PlayerSlot[]; cursor: number } | null>(null);

  // Live Mid-Escape Firewall Sabotage state
  const [sabotageArmed, setSabotageArmed] = useState(false);
  const [sabotageCharges, setSabotageCharges] = useState(1);
  const [sabotageBanner, setSabotageBanner] = useState<string | null>(null);

  useEffect(() => {
    setPlayers(initialPlayers);
    setStepCursor(0);
    setIsPlaying(true);
    setRewindOriginal(null);
  }, [initialPlayers]);

  const getActiveAgentResult = (player: PlayerSlot) => {
    if (attemptMode === 'ATTEMPT_2' && player.adaptedAgentResult) {
      return player.adaptedAgentResult;
    }
    return player.agentResult;
  };

  const maxSteps = Math.max(
    1,
    ...players.map((p) => {
      const agentRes = getActiveAgentResult(p);
      if (agentRes && agentRes.steps.length > 0) {
        return agentRes.steps.length - 1;
      }
      return (p.solverResult?.steps.length ?? 1) - 1;
    })
  );

  useEffect(() => {
    if (!isPlaying) return;
    if (stepCursor >= maxSteps) {
      setIsPlaying(false);
      soundFX.playSuccess();
      return;
    }

    const intervalMs = Math.round(520 / speedMultiplier);
    const handle = setTimeout(() => {
      const next = stepCursor + 1;
      setStepCursor(next);

      const p1Agent = getActiveAgentResult(players[0]);
      const p1Step =
        p1Agent?.steps[next] ?? players[0]?.solverResult?.steps[next];
      if (p1Step) {
        if (p1Step.event === 'COLLECT_KEY') soundFX.playKeyPickup();
        else if (p1Step.event === 'UNLOCK_DOOR') soundFX.playDoorUnlock();
        else if (p1Step.event === 'TOGGLE_SWITCH') soundFX.playSwitchToggle();
        else if (p1Step.event === 'TRAP_RESET_TRIGGERED') soundFX.playError();
        else if (p1Step.event === 'EMP_JAMMED') soundFX.playError();
        else if (p1Step.event === 'PORTAL_WARP') soundFX.playSwitchToggle();
        else if (p1Step.event === 'DECOY_DISCOVERED') soundFX.playErase();
        else soundFX.playStep();
      }
    }, intervalMs);

    return () => clearTimeout(handle);
  }, [isPlaying, stepCursor, maxSteps, speedMultiplier, players, attemptMode]);

  const handleRestart = () => {
    setStepCursor(rewindOriginal?.cursor ?? 0);
    setIsPlaying(true);
  };

  const handleSwitchAttempt = (nextMode: 'ATTEMPT_1' | 'ATTEMPT_2') => {
    setAttemptMode(nextMode);
    setStepCursor(0);
    setIsPlaying(true);
  };

  const handleLiveSabotageClick = (
    playerIdx: number,
    row: number,
    col: number
  ) => {
    if (!sabotageArmed || sabotageCharges <= 0) return;
    const targetPlayer = players[playerIdx];
    if (!targetPlayer?.grid || isAnchorCell(row, col)) return;

    const activeAgent = getActiveAgentResult(targetPlayer);
    const currStep = activeAgent?.steps[Math.min(stepCursor, (activeAgent?.steps.length ?? 1) - 1)];
    if (currStep && currStep.row === row && currStep.col === col) {
      soundFX.playError();
      setSabotageBanner('Cannot drop firewall directly on top of the AI Agent!');
      return;
    }

    if (targetPlayer.grid[row][col] !== 'EMPTY') {
      soundFX.playError();
      setSabotageBanner('Live Firewall can only be deployed on an empty floor sector!');
      return;
    }

    const candidateGrid = cloneGrid(targetPlayer.grid);
    candidateGrid[row][col] = 'WALL';

    // Verify the modified arena remains solvable
    const bfsCheck = solveBoardBFS(candidateGrid);
    const newAgentRun = runAutonomousAgent(candidateGrid);
    if (!bfsCheck.solvable || !newAgentRun.escaped) {
      soundFX.playError();
      setSabotageBanner(
        `ILLEGAL SABOTAGE at (${row},${col})! You cannot seal off all valid escape routes!`
      );
      return;
    }

    const newAdaptedRun = runAutonomousAgent(candidateGrid, {
      priorMemory: newAgentRun.updatedMemory,
    });

    soundFX.playDoorUnlock();
    setSabotageCharges((c) => c - 1);
    setSabotageArmed(false);
    setSabotageBanner(
      `SANDBOX RE-RUN: new firewall at (${row},${col}). Restarting the scout in the modified facility.`
    );

    setPlayers((prev) =>
      prev.map((p, idx) =>
        idx === playerIdx
          ? {
              ...p,
              grid: candidateGrid,
              solverResult: bfsCheck,
              agentResult: newAgentRun,
              adaptedAgentResult: newAdaptedRun,
            }
          : p
      )
    );
    setStepCursor(0);
    setIsPlaying(true);
  };

  return (
    <div className="game-screen arena-screen max-w-[1600px] mx-auto px-4 py-6">
      {/* Arena Header & Controls */}
      <div className="interface-panel rounded-2xl p-4 sm:p-5 mb-5 flex flex-wrap items-center justify-between gap-4 border border-cyan-400/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center">
            <Bot className="w-6 h-6 text-cyan-300 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-cyan-400">
              EXPEDITION CONTROL / SCOUT 01
            </div>
            <h2
              data-testid="arena-heading"
              className="font-display text-xl sm:text-2xl font-extrabold text-white"
            >
              MIND WARS: AI ESCAPE ARENA
            </h2>
          </div>
        </div>

        {/* View Perspective & Adaptation Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* World View vs AI View Toggle */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-cyan-500/40 p-1">
            <button
              type="button"
              data-testid="view-mode-ai-btn"
              aria-pressed={viewMode === 'AI_FOG'}
              onClick={() => setViewMode('AI_FOG')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition ${
                viewMode === 'AI_FOG'
                  ? 'bg-cyan-400 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>AI View (Fog of War)</span>
            </button>
            <button
              type="button"
              data-testid="view-mode-world-btn"
              aria-pressed={viewMode === 'WORLD'}
              onClick={() => setViewMode('WORLD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition ${
                viewMode === 'WORLD'
                  ? 'bg-purple-500 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>World View (Full Map)</span>
            </button>
          </div>

          {/* Attempt 1 (Fresh) vs Attempt 2 (Adapted Memory) Toggle */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-purple-500/40 p-1">
            <button
              type="button"
              data-testid="attempt-1-btn"
              disabled={Boolean(rewindOriginal)}
              aria-pressed={attemptMode === 'ATTEMPT_1'}
              onClick={() => handleSwitchAttempt('ATTEMPT_1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                attemptMode === 'ATTEMPT_1'
                  ? 'bg-purple-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Attempt 1 (Fresh Mind)
            </button>
            <button
              type="button"
              data-testid="attempt-2-btn"
              disabled={Boolean(rewindOriginal)}
              aria-pressed={attemptMode === 'ATTEMPT_2'}
              onClick={() => handleSwitchAttempt('ATTEMPT_2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition ${
                attemptMode === 'ATTEMPT_2'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Attempt 2 (Adapted Memory)</span>
            </button>
          </div>

          {/* Live Sabotage Charge Button */}
          {mode === 'SOLO' && <button
            type="button"
            disabled={sabotageCharges <= 0 || Boolean(rewindOriginal)}
            onClick={() => {
              setSabotageArmed((v) => !v);
              setSabotageBanner(
                !sabotageArmed
                  ? 'SANDBOX: Click an empty floor sector to add a wall and restart the simulation. The submitted score stays unchanged.'
                  : null
              );
            }}
            className={`px-3 py-2 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition ${
              sabotageArmed
                ? 'bg-rose-500 text-slate-950 font-bold border-rose-300 animate-pulse'
                : sabotageCharges > 0
                ? 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-500/50 text-rose-200'
                : 'bg-slate-900 border-slate-800 text-slate-600 opacity-50'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>
              {sabotageCharges > 0
                ? `Remodel & re-run (${sabotageCharges})`
                : 'Remodel used'}
            </span>
          </button>}

          {attemptMode === 'ATTEMPT_2' && (
            <button
              type="button"
              data-testid="clear-memory-btn"
              disabled={Boolean(rewindOriginal)}
              onClick={() => {
                handleSwitchAttempt('ATTEMPT_1');
                onClearMemory?.();
              }}
              className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-xs font-mono text-rose-200 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Memory</span>
            </button>
          )}
        </div>
      </div>

      {sabotageBanner && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/60 text-xs font-mono text-rose-200 flex items-center justify-between">
          <span>⚡ {sabotageBanner}</span>
          <button
            type="button"
            onClick={() => setSabotageBanner(null)}
            className="text-rose-400 hover:text-white ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Playback Scrubber & Speed Bar */}
      <div className="mb-6 px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-white flex items-center gap-1.5"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-400" /> Play
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-slate-200 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Replay
          </button>

          <div className="flex items-center rounded-lg bg-slate-950 border border-slate-700 p-0.5">
            {([0.5, 1, 2] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeedMultiplier(spd)}
                className={`px-2 py-1 rounded text-xs font-mono transition ${
                  speedMultiplier === spd
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowHeatmap((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 ${
              showHeatmap
                ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                : 'bg-slate-950 border-slate-700 text-slate-400'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">BFS Wavefront</span>
          </button>
        </div>

        <div className="flex-1 min-w-[180px] flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            STEP {stepCursor} / {maxSteps}
          </span>
          <input
            type="range"
            aria-label="Replay step"
            min={rewindOriginal?.cursor ?? 0}
            max={maxSteps}
            value={stepCursor}
            onChange={(e) => {
              setIsPlaying(false);
              setStepCursor(Number(e.target.value));
            }}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        <button
          type="button"
          data-testid="view-results-btn"
          onClick={onFinishToResults}
          className="architect-btn architect-btn-primary px-5 py-2 rounded-xl font-display font-bold text-xs flex items-center gap-1.5"
        >
          <Trophy className="w-4 h-4" />
          <span>
            {stepCursor >= maxSteps ? 'VIEW FINAL RESULTS' : 'SKIP TO RESULTS'}
          </span>
          <FastForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {mode === 'SOLO' && players[0]?.grid && getActiveAgentResult(players[0]) && <DecisionRewind grid={players[0].grid!} agent={getActiveAgentResult(players[0])!} cursor={stepCursor} paused={!isPlaying} branched={Boolean(rewindOriginal)}
        onBranch={(grid, agentResult, solverResult) => {
          setRewindOriginal({ players, cursor: stepCursor }); setIsPlaying(false); setSabotageArmed(false);
          setPlayers(players.map((player, index) => index ? player : { ...player, grid, solverResult,
            ...(attemptMode === 'ATTEMPT_2' ? { adaptedAgentResult: agentResult } : { agentResult }) }));
        }} onRestore={() => {
          if (rewindOriginal) { setPlayers(rewindOriginal.players); setStepCursor(rewindOriginal.cursor); setIsPlaying(false); setRewindOriginal(null); }
        }} />}

      {/* Side-by-Side Escape Boards + Decision Logs */}
      <div
        className={`grid gap-6 ${
          mode === 'PVP' && players.length > 1
            ? 'lg:grid-cols-2'
            : 'w-full'
        }`}
      >
        {players.map((player, playerIdx) => {
          const agentRes = getActiveAgentResult(player);
          const steps =
            agentRes && agentRes.steps.length > 0
              ? agentRes.steps
              : player.solverResult?.steps ?? [];

          const totalPlayerSteps = Math.max(0, steps.length - 1);
          const clampedIdx = Math.min(stepCursor, totalPlayerSteps);
          const currentStep = steps[clampedIdx] ?? null;
          const visitedSteps = steps.slice(0, clampedIdx + 1);
          const plannedRoute =
            currentStep && 'plannedRoute' in currentStep
              ? currentStep.plannedRoute
              : [];

          const keyMask = currentStep?.keyMask ?? 0;
          const switchMask = currentStep?.switchMask ?? 0;
          const escaped = clampedIdx >= totalPlayerSteps && totalPlayerSteps > 0;

          const attempt1Steps = player.agentResult?.totalSteps ?? 0;
          const attempt2Steps = player.adaptedAgentResult?.totalSteps ?? 0;
          const stepsSavedByMemory = Math.max(0, attempt1Steps - attempt2Steps);

          const visibleDecisions = (agentRes?.decisionEvents ?? []).filter(
            (ev) => ev.stepIndex <= (currentStep?.stepIndex ?? clampedIdx)
          );

          return (
            <div
              key={player.id}
              data-testid={`arena-player-card-${player.id}`}
              className="interface-panel rounded-2xl p-5 flex flex-col border border-slate-700/80"
            >
              {/* Player Header & Adaptation Comparison Pill */}
              <div className="w-full flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-cyan-400 uppercase">
                      ARCHITECT {player.id}
                    </span>
                    {attemptMode === 'ATTEMPT_2' && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-mono text-[10px] font-bold">
                        MEMORY ADAPTED{' '}
                        {stepsSavedByMemory > 0
                          ? `(-${stepsSavedByMemory} STEPS!)`
                          : ''}
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    {player.name}&apos;s Mind Trap
                  </h3>
                </div>

                <div className="text-right font-mono">
                  <div className="text-[10px] text-slate-400">
                    AI MOVES vs OPTIMAL (
                    {player.solverResult?.shortestPathLength ?? 14})
                  </div>
                  <div className="text-lg font-bold text-cyan-300">
                    {clampedIdx} / {totalPlayerSteps}
                  </div>
                </div>
              </div>

              <div className={`arena-world-layout ${mode === 'PVP' ? 'multiplayer' : ''}`}>
                {player.grid && (
                  <div>
                    <PuzzleGrid
                      grid={player.grid}
                      interactive={sabotageArmed}
                      onCellInteract={(r, c) =>
                        handleLiveSabotageClick(playerIdx, r, c)
                      }
                      currentStep={currentStep}
                      visitedSteps={visitedSteps}
                      exploredCells={player.solverResult?.exploredCells ?? []}
                      showHeatmap={showHeatmap}
                      viewMode={viewMode}
                      plannedRoute={plannedRoute}
                      compact={mode === 'PVP' && players.length > 1}
                      sabotageMode={sabotageArmed}
                      stepDurationMs={480 / speedMultiplier}
                    />
                  </div>
                )}

                {/* AI Knowledge State & Observable Decision Feed */}
                <div className="flex-1 w-full space-y-3">
                  <AIExplainer step={currentStep} optimalMoves={player.solverResult?.shortestPathLength}
                    continuationFrom={rewindOriginal ? getActiveAgentResult(rewindOriginal.players[playerIdx])?.steps[rewindOriginal.cursor]?.stepIndex : undefined}
                    actualMoves={agentRes?.totalSteps} planner={agentRes?.planner} compact />
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                      <div className="text-[10px] text-slate-400 mb-1">
                        MAP DISCOVERED
                      </div>
                      <div className="text-cyan-300 font-bold">
                        {currentStep && 'discoveredCells' in currentStep
                          ? `${Math.round(
                              (currentStep.discoveredCells.length / 64) * 100
                            )}% (${currentStep.discoveredCells.length}/64)`
                          : '100%'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                      <div className="text-[10px] text-slate-400 mb-1">
                        {rewindOriginal ? 'CONTINUATION REPLANS' : 'A* REPLANS'}
                      </div>
                      <div className="text-purple-300 font-bold">
                        {agentRes?.replanCount ?? 0} replans
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                      <div className="text-[10px] text-slate-400 mb-1">
                        KNOWN HAZARDS
                      </div>
                      <div className="flex items-center gap-1.5 text-orange-300 font-bold">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        <span>
                          {currentStep && 'knownHazards' in currentStep
                            ? currentStep.knownHazards.length
                            : 0}{' '}
                          traps
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                      <div className="text-[10px] text-slate-400 mb-1">
                        EXPOSED DECOYS
                      </div>
                      <div className="flex items-center gap-1.5 text-pink-300 font-bold">
                        <Radio className="w-3.5 h-3.5" />
                        <span>
                          {currentStep && 'verifiedDecoys' in currentStep
                            ? currentStep.verifiedDecoys.length
                            : 0}{' '}
                          decoys
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Inventory & Switch State */}
                  <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">KEYS:</span>
                      <KeyRound
                        className={`w-4 h-4 ${
                          keyMask & 1 ? 'text-rose-400' : 'text-slate-700'
                        }`}
                      />
                      <KeyRound
                        className={`w-4 h-4 ${
                          keyMask & 2 ? 'text-cyan-300' : 'text-slate-700'
                        }`}
                      />
                      <KeyRound
                        className={`w-4 h-4 ${
                          keyMask & 4 ? 'text-amber-300' : 'text-slate-700'
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-purple-300">
                      <Power className="w-3.5 h-3.5" />
                      <span>SW: {switchMask & 1 ? 'ON' : 'OFF'}</span>
                    </div>
                  </div>

                  {/* Live Observable AI Decision Log */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/25">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-2 flex items-center justify-between">
                      <span>OBSERVABLE AI DECISION LOG</span>
                      {escaped && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          ESCAPED!
                        </span>
                      )}
                    </div>
                    <div
                      data-testid={`ai-decision-log-${player.id}`}
                      className="space-y-1.5 max-h-36 overflow-y-auto text-[11px] font-mono"
                    >
                      {visibleDecisions
                        .slice(-5)
                        .reverse()
                        .map((ev, idx) => (
                          <div
                            key={`${ev.stepIndex}-${idx}`}
                            className={`p-1.5 rounded border ${
                              ev.type === 'TRAP_TRIGGERED' ||
                              ev.type === 'EMP_JAMMED'
                                ? 'bg-orange-950/60 border-orange-500/50 text-orange-200'
                                : ev.type === 'DECOY_EXPOSED'
                                ? 'bg-pink-950/60 border-pink-500/50 text-pink-200'
                                : ev.type === 'MEMORY_ADAPT'
                                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                                : 'bg-slate-900/90 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="text-cyan-400 font-bold mr-1.5">
                              [T+{ev.stepIndex}]
                            </span>
                            <span>{ev.message}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
