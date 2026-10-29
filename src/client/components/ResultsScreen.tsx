import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Award,
  Brain,
  Gamepad2,
  Home,
  Play,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { PlayerSlot } from '../../shared/types';
import { HumanPlayModal } from './HumanPlayModal';

interface ResultsScreenProps {
  mode: 'SOLO' | 'PVP';
  players: PlayerSlot[];
  winnerId: string | 'TIE' | null;
  onReplayArena: () => void;
  onRematch: () => void;
  onGoHome: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  mode,
  players,
  winnerId,
  onReplayArena,
  onRematch,
  onGoHome,
}) => {
  const [selectedHumanPlaySlot, setSelectedHumanPlaySlot] =
    useState<PlayerSlot | null>(null);

  useEffect(() => {
    try {
      confetti({
        particleCount: 70,
        disableForReducedMotion: true,
        colors: ['#9ef6d8', '#ffb47f', '#99bcff'],
        spread: 65,
        origin: { y: 0.6 },
      });
    } catch {
      // Animation is optional when the canvas is unavailable.
    }
    return () => { confetti.reset(); };
  }, []);

  const winnerPlayer =
    winnerId && winnerId !== 'TIE'
      ? players.find((p) => p.id === winnerId)
      : null;

  return (
    <div className="game-screen results-screen max-w-6xl mx-auto px-4 py-8">
      {/* Winner Banner */}
      <div
        data-testid="results-banner"
        className="result-verdict"
      >
        <div className="verdict-emblem">
          <Trophy className="w-8 h-8 stroke-[2.2]" />
        </div>

        <div className="text-xs font-mono uppercase tracking-widest text-cyan-300 mb-1">
          {mode === 'PVP'
            ? 'OFFICIAL MIND WARS SERVER VERDICT'
            : 'SOLO MIND WARS BENCHMARK COMPLETE'}
        </div>

        <h2
          data-testid="winner-headline"
          className="font-display font-black text-3xl sm:text-5xl text-white"
        >
          {mode === 'SOLO'
            ? `TRAP SCORE: ${players[0]?.scoreBreakdown?.totalScore ?? 0} PTS`
            : winnerId === 'TIE'
            ? 'DEADLOCK TIE!'
            : `${winnerPlayer?.name ?? 'ARCHITECT'} WINS!`}
        </h2>

        <p className="result-verdict-summary">
          {mode === 'SOLO'
            ? `The autonomous AI required ${
                players[0]?.scoreBreakdown?.actualAgentSteps ?? 0
              } moves under fog-of-war (vs ${
                players[0]?.solverResult?.shortestPathLength ?? 0
              } omniscient optimal moves) with ${
                players[0]?.scoreBreakdown?.replanCount ?? 0
              } dynamic A* replans.`
            : winnerId === 'TIE'
            ? 'Both architects engineered identically challenging escape rooms!'
            : `${winnerPlayer?.name} constructed the most deceptive valid trap against the autonomous planning AI!`}
        </p>

        {/* Action Buttons */}
        <div className="result-verdict-actions">
          <button
            type="button"
            data-testid="replay-arena-btn"
            onClick={onReplayArena}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-400/40 text-xs font-display font-bold text-cyan-200 flex items-center gap-2 transition"
          >
            <Play className="w-4 h-4" />
            <span>REPLAY & COMPARE AI ADAPTATION</span>
          </button>

          <button
            type="button"
            data-testid="rematch-btn"
            onClick={onRematch}
            className="architect-btn architect-btn-primary px-6 py-3 rounded-xl font-display font-bold text-xs sm:text-sm flex items-center gap-2 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>
              {mode === 'PVP' ? 'PLAY REMATCH ROUND' : 'BUILD ANOTHER ROOM'}
            </span>
          </button>

          <button
            type="button"
            onClick={onGoHome}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 flex items-center gap-1.5"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
        </div>
      </div>

      {/* Player Score Comparison Cards */}
      <div
        className={`grid gap-6 ${
          players.length > 1 ? 'md:grid-cols-2' : 'max-w-xl mx-auto'
        }`}
      >
        {players.map((p) => {
          const score = p.scoreBreakdown;
          const solver = p.solverResult;
          const agent1 = p.agentResult;
          const agent2 = p.adaptedAgentResult;
          const isWinner = mode === 'PVP' && winnerId === p.id;

          return (
            <div
              key={p.id}
              data-testid={`result-card-${p.id}`}
              className={`rounded-2xl p-6 border ${
                isWinner
                  ? 'interface-panel border-amber-400/70 shadow-[0_0_25px_rgba(245,158,11,0.2)]'
                  : 'interface-panel border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xl font-bold text-white">
                      {p.name}
                    </span>
                    {isWinner && (
                      <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/50 text-amber-300 font-mono text-[10px] font-bold flex items-center gap-1">
                        <Award className="w-3 h-3" /> WINNER
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-0.5">
                    Rating:{' '}
                    <strong className="text-cyan-300">
                      {score?.difficultyRating ?? 'TRIVIAL'}
                    </strong>{' '}
                    • Budget Used: {p.budgetUsed}/30
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">
                    TOTAL SCORE
                  </div>
                  <div
                    data-testid={`player-total-score-${p.id}`}
                    className="font-display font-black text-3xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300"
                  >
                    {score?.totalScore ?? 0}
                  </div>
                </div>
              </div>

              {/* Transparent Formula Breakdown Bars */}
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">
                      35% Optimal BFS Path ({solver?.shortestPathLength ?? 0}{' '}
                      moves)
                    </span>
                    <span className="text-cyan-300 font-bold">
                      {score?.lengthScore ?? 0} / 350
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400"
                      style={{
                        width: `${Math.min(
                          100,
                          ((score?.lengthScore ?? 0) / 350) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">
                      30% Search & A* Replanning ({score?.replanCount ?? 0}{' '}
                      replans)
                    </span>
                    <span className="text-purple-300 font-bold">
                      {score?.searchScore ?? 0} / 300
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-purple-400"
                      style={{
                        width: `${Math.min(
                          100,
                          ((score?.searchScore ?? 0) / 300) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">
                      20% Deception Overhead (+
                      {score?.explorationOverhead ?? 0} fog steps)
                    </span>
                    <span className="text-pink-300 font-bold">
                      {score?.deceptionScore ?? 0} / 200
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-pink-400"
                      style={{
                        width: `${Math.min(
                          100,
                          ((score?.deceptionScore ?? 0) / 200) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">
                      15% Lock/Switch Interactions (
                      {solver?.meaningfulInteractions ?? 0} active)
                    </span>
                    <span className="text-emerald-300 font-bold">
                      {score?.interactionScore ?? 0} / 150
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{
                        width: `${Math.min(
                          100,
                          ((score?.interactionScore ?? 0) / 150) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* AI Adaptation Summary Box */}
              {agent1 && agent2 && (
                <div className="mt-4 p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-slate-300">
                      Memory Adaptation (Attempt 1 → 2):
                    </span>
                  </div>
                  <span className="text-emerald-300 font-bold">
                    {agent1.totalSteps} steps → {agent2.totalSteps} steps
                  </span>
                </div>
              )}

              {/* Extra Solver Telemetry */}
              <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center font-mono text-xs">
                <div className="p-2 rounded-lg bg-slate-950/70">
                  <div className="text-[10px] text-slate-400">
                    ACTUAL AI MOVES
                  </div>
                  <div className="font-bold text-cyan-300 mt-0.5">
                    {score?.actualAgentSteps ?? 0}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/70">
                  <div className="text-[10px] text-slate-400">
                    TRAPS / DECOYS
                  </div>
                  <div className="font-bold text-orange-300 mt-0.5">
                    {(score?.trapsTriggeredCount ?? 0) +
                      (score?.decoysInvestigatedCount ?? 0)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/70">
                  <div className="text-[10px] text-slate-400">
                    OPTIMAL MOVES
                  </div>
                  <div className="font-bold text-emerald-300 mt-0.5">
                    {score?.shortestPathLength ?? 0}
                  </div>
                </div>
              </div>

              {p.grid && (
                <button
                  type="button"
                  onClick={() => setSelectedHumanPlaySlot(p)}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/50 text-xs font-display font-bold text-purple-200 flex items-center justify-center gap-2 transition"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>TRY ESCAPING {p.name.toUpperCase()}&apos;S TRAP YOURSELF</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedHumanPlaySlot?.grid && (
        <HumanPlayModal
          open={Boolean(selectedHumanPlaySlot)}
          title={`${selectedHumanPlaySlot.name}'s Trap`}
          grid={selectedHumanPlaySlot.grid}
          aiOptimalMoves={
            selectedHumanPlaySlot.solverResult?.shortestPathLength ?? 14
          }
          aiFogMoves={selectedHumanPlaySlot.agentResult?.totalSteps ?? 14}
          onClose={() => setSelectedHumanPlaySlot(null)}
        />
      )}

      {/* Scoring Transparency Note */}
      <div className="mt-6 p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center gap-3 text-xs font-mono text-slate-400">
        <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>
          {mode === 'PVP' ? <><strong>Mind Wars Fair Evaluation:</strong> Both rooms use the same deterministic frontier + A* scout, memory rules, and vision radius 2. Full-map BFS verifies solvability.</>
            : <><strong>Solo evaluation:</strong> Full-map BFS validates the room. The replay identifies the selected scout and any Luna fallbacks. Luna-assisted scores are sandbox results and do not affect multiplayer scoring.</>}
        </span>
      </div>
    </div>
  );
};
