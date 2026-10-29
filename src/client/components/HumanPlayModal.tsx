import { createPortal } from 'react-dom';
import { useGameDialog } from '../lib/useGameDialog';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Flag,
  Gamepad2,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react';
import { humanViewStep, moveHuman } from '../../shared/movement';
import { START_POS } from '../../shared/constants';
import { Coordinate, Grid, SolverStep } from '../../shared/types';
import type { Sector } from '../../shared/sectors';
import { soundFX } from '../lib/sound';
import { PuzzleGrid } from './PuzzleGrid';
import { AccessInventory } from './AccessInventory';
import { runAutonomousAgent } from '../../shared/agent';
import { ExpeditionRunReport, GHOST_MOVE_MS, ghostTimeline } from '../../shared/challenges';

interface HumanPlayModalProps {
  open: boolean;
  title: string;
  grid: Grid;
  aiOptimalMoves: number;
  aiFogMoves: number;
  onClose: () => void;
  onEscape?: (moves: number) => void;
  onRunComplete?: (report: ExpeditionRunReport) => void;
  ghostRace?: boolean;
  theme?: 'ion' | 'ember' | 'void';
  sectors?: readonly Sector[];
  expedition?: { stage: number; total: number; nextLevelName?: string; onNextLevel?: () => void };
}

export const HumanPlayModal: React.FC<HumanPlayModalProps> = ({
  open,
  title,
  grid,
  aiOptimalMoves,
  aiFogMoves,
  onClose,
  onEscape,
  theme,
  sectors,
  expedition,
  onRunComplete,
  ghostRace = false,
}) => {
  const [pos, setPos] = useState<Coordinate>({ ...START_POS });
  const [keyMask, setKeyMask] = useState(0);
  const [switchMask, setSwitchMask] = useState(0);
  const [spentTraps, setSpentTraps] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<SolverStep[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Use WASD or Arrow Keys to infiltrate the arena!'
  );
  const [empTurns, setEmpTurns] = useState(0);
  const [escaped, setEscaped] = useState(false);
  const lastMoveAt = useRef(0);
  const ghostStartedAt = useRef(0);
  const [ghostNow, setGhostNow] = useState(0);
  const [finishMs, setFinishMs] = useState<number | null>(null);
  const ghost = useMemo(() => ghostRace ? runAutonomousAgent(grid) : undefined, [grid, ghostRace]);
  const ghostTimes = useMemo(() => ghost ? ghostTimeline(ghost.steps) : [], [ghost]);
  const ghostElapsed = Math.max(0, ghostNow - ghostStartedAt.current);
  const ghostCountdown = ghostRace ? Math.max(0, Math.ceil((ghostStartedAt.current - ghostNow) / 1000)) : 0;
  const ghostIndex = ghostTimes.reduce((index, time, i) => time <= (finishMs ?? ghostElapsed) ? i : index, 0);
  const ghostDuration = ghostTimes.at(-1) ?? 0;
  const dialogRef = useGameDialog(open, onClose);

  const resetRun = useCallback(() => {
    lastMoveAt.current = 0;
    const now = performance.now();
    ghostStartedAt.current = now + 3000;
    setGhostNow(now);
    setFinishMs(null);
    setPos({ ...START_POS });
    setKeyMask(0);
    setSwitchMask(0);
    setSpentTraps(new Set());
    setEmpTurns(0);
    setEscaped(false);
    setStatusMessage('Use WASD or Arrow Keys to infiltrate the arena!');
    setHistory([
      {
        stepIndex: 0,
        row: START_POS.row,
        col: START_POS.col,
        level: 0,
        keyMask: 0,
        switchMask: 0,
        event: 'START',
        tile: 'START',
        description: 'Deployed at Drop Pod (0,0)',
      },
    ]);
  }, []);

  useEffect(() => {
    if (open) {
      resetRun();
    }
  }, [open, resetRun]);

  useEffect(() => {
    if (!open || !ghostRace || escaped) return;
    const timer = setInterval(() => setGhostNow(performance.now()), 50);
    return () => clearInterval(timer);
  }, [open, ghostRace, escaped]);

  const moveDelta = useCallback(
    (dr: number, dc: number) => {
      if (escaped) return;
      const now = performance.now();
      if (ghostRace && now < ghostStartedAt.current) { setStatusMessage('Get ready — you and the scout start together.'); return; }
      if (now - lastMoveAt.current < (history.at(-1)?.event === 'GRAVITY_SLOW' ? 450 : 190)) return;
      lastMoveAt.current = now;
      const result = moveHuman(grid, {
        ...pos, keyMask, switchMask, empRemainingTurns: empTurns, spentTraps: [...spentTraps],
        moves: Math.max(0, history.length - 1), lastStep: history.at(-1)!,
      }, dr, dc);
      if (result.error) { soundFX.playError(); setStatusMessage(result.error); return; }
      const next = result.state;
      setPos({ row: next.row, col: next.col });
      setKeyMask(next.keyMask);
      setSwitchMask(next.switchMask);
      setSpentTraps(new Set(next.spentTraps));
      setEmpTurns(next.empRemainingTurns ?? 0);
      setHistory(previous => [...previous, next.lastStep]);
      setStatusMessage(next.lastStep.description);
      if (result.escaped) {
        const elapsed = Math.max(0, now - ghostStartedAt.current);
        setFinishMs(elapsed); setGhostNow(now); setEscaped(true); soundFX.playSuccess(); onEscape?.(next.moves);
        onRunComplete?.({ moves: next.moves, history: [...history, next.lastStep], ghostWon: ghostRace && elapsed < ghostDuration });
      }
      else if (next.lastStep.event === 'COLLECT_KEY') soundFX.playKeyPickup();
      else soundFX.playStep();
    },
    [escaped, grid, keyMask, pos.col, pos.row, spentTraps, switchMask, history, onEscape, empTurns, ghostRace, ghostDuration, onRunComplete]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        moveDelta(-1, 0);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        moveDelta(1, 0);
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        moveDelta(0, -1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        moveDelta(0, 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, moveDelta, onClose]);

  if (!open) return null;

  const latestStep = history[history.length - 1] ?? null;
  const currentStep = latestStep ? humanViewStep(grid, { ...pos, keyMask, switchMask, spentTraps: [...spentTraps], moves: history.length - 1, empRemainingTurns: empTurns, lastStep: latestStep }) : null;
  const humanMoves = Math.max(0, history.length - 1);

  return createPortal(
    <div className="human-exploration-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className={`interface-panel human-playable max-w-6xl w-full rounded-2xl p-6 border border-cyan-400/50 max-h-[92vh] overflow-y-auto ${expedition ? 'human-expedition' : ''} ${ghostRace ? 'human-ghost-race' : ''}`}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                {expedition ? `SOLO EXPEDITION ${expedition.stage}/${expedition.total}` : 'HUMAN INFILTRATION TEST'} — {title}
              </h2>
              <p className="text-xs font-mono text-cyan-300">
                Use WASD / Arrow Keys or D-Pad to beat the AI&apos;s move count!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close exploration"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-8 flex justify-center min-w-0">
            <PuzzleGrid
              grid={grid}
              roomLabel={title}
              theme={theme}
              sectors={sectors}
              interactive={false}
              currentStep={currentStep}
              opponentStep={ghostRace && empTurns === 0 ? ghost?.steps[ghostIndex] : null}
              followLabel="Follow you"
              viewMode={empTurns > 0 ? 'AI_FOG' : 'WORLD'}
              visitedSteps={history}
              stepDurationMs={170}
            />
          </div>

          <div className="md:col-span-4 space-y-4 human-play-info">
            {ghostRace && <p className="ghost-race-status" role="status" data-testid="ghost-status">{ghostCountdown > 0 ? `Race starts in ${ghostCountdown}…` : escaped ? finishMs! < ghostDuration ? 'You beat the scout!' : finishMs === ghostDuration ? 'Photo finish — draw.' : 'The scout finished first. Try again!' : ghostIndex === (ghost?.steps.length ?? 0) - 1 ? 'Scout extracted — finish your escape.' : `AI ghost: ${ghostIndex}/${ghost?.totalSteps} moves`}<small>Amber is the deterministic frontier + A* scout · {GHOST_MOVE_MS} ms/move · Independent keys and switches</small></p>}
            {/* Score Comparison Box */}
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Your Human Moves:</span>
                <span className="text-cyan-300 font-bold text-base" data-testid="human-moves">
                  {humanMoves}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-purple-400" /> AI Fog-of-War Moves:
                </span>
                <span className="text-purple-300 font-bold">{aiFogMoves}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-emerald-400" /> Omniscient Optimal:
                </span>
                <span className="text-emerald-300 font-bold">
                  {aiOptimalMoves}
                </span>
              </div>
            </div>

            <AccessInventory keyMask={keyMask} switchMask={switchMask} empTurns={empTurns} />

            {/* Live Status Banner */}
            <div
              className={`human-play-status p-3 rounded-xl border text-xs font-mono ${
                escaped
                  ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              {escaped && <Trophy className="w-4 h-4 text-amber-400 inline mr-1.5" />}
              {statusMessage}
            </div>

            {escaped && expedition?.onNextLevel && <button className="architect-btn architect-btn-primary w-full human-next-sector" data-testid="next-sector-btn" onClick={expedition.onNextLevel}>Next sector: {expedition.nextLevelName}<ArrowRight size={16} /></button>}
            {escaped && ghostRace && <button className="architect-btn w-full human-next-sector" onClick={resetRun}>Race this ghost again</button>}
            {escaped && expedition && !expedition.onNextLevel && <p className="sector-complete" role="status"><Trophy size={16} />All {expedition.total} expedition sectors complete.</p>}
            {escaped && (onEscape || onRunComplete) && <button className={`architect-btn w-full ${expedition?.onNextLevel ? '' : 'architect-btn-primary'}`} onClick={onClose}>Continue to sector map</button>}
            {/* On-Screen Tactical D-Pad */}
            {!(escaped && ghostRace) && <div className="flex flex-col items-center gap-1.5 py-2 human-play-dpad">
              <button
                type="button"
                aria-label="Move up"
                onClick={() => moveDelta(-1, 0)}
                className="w-12 h-10 rounded-xl bg-slate-800 hover:bg-cyan-500/20 border border-slate-600 hover:border-cyan-400 flex items-center justify-center text-white"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label="Move left"
                onClick={() => moveDelta(0, -1)}
                  className="w-12 h-10 rounded-xl bg-slate-800 hover:bg-cyan-500/20 border border-slate-600 hover:border-cyan-400 flex items-center justify-center text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={resetRun}
                  title="Restart Run"
                  className="w-12 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-rose-300"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move right"
                onClick={() => moveDelta(0, 1)}
                  className="w-12 h-10 rounded-xl bg-slate-800 hover:bg-cyan-500/20 border border-slate-600 hover:border-cyan-400 flex items-center justify-center text-white"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <button
                type="button"
                aria-label="Move down"
                onClick={() => moveDelta(1, 0)}
                className="w-12 h-10 rounded-xl bg-slate-800 hover:bg-cyan-500/20 border border-slate-600 hover:border-cyan-400 flex items-center justify-center text-white"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            </div>}
          </div>
        </div>
      </div>
    </div>, document.body
  );
};
