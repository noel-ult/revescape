import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { soundFX } from '../lib/sound';
import { PuzzleGrid } from './PuzzleGrid';

interface HumanPlayModalProps {
  open: boolean;
  title: string;
  grid: Grid;
  aiOptimalMoves: number;
  aiFogMoves: number;
  onClose: () => void;
  onEscape?: () => void;
}

export const HumanPlayModal: React.FC<HumanPlayModalProps> = ({
  open,
  title,
  grid,
  aiOptimalMoves,
  aiFogMoves,
  onClose,
  onEscape,
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', trap); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [open]);

  const resetRun = useCallback(() => {
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

  const moveDelta = useCallback(
    (dr: number, dc: number) => {
      if (escaped) return;
      const now = performance.now();
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
      if (result.escaped) { setEscaped(true); soundFX.playSuccess(); onEscape?.(); }
      else if (next.lastStep.event === 'COLLECT_KEY') soundFX.playKeyPickup();
      else soundFX.playStep();
    },
    [escaped, grid, keyMask, pos.col, pos.row, spentTraps, switchMask, history, onEscape, empTurns]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="cyber-card max-w-6xl w-full rounded-2xl p-6 border border-cyan-400/50 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                HUMAN INFILTRATION TEST — {title}
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
              interactive={false}
              currentStep={currentStep}
              followLabel="Follow you"
              viewMode={empTurns > 0 ? 'AI_FOG' : 'WORLD'}
              visitedSteps={history}
              stepDurationMs={170}
            />
          </div>

          <div className="md:col-span-4 space-y-4">
            {/* Score Comparison Box */}
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Your Human Moves:</span>
                <span className="text-cyan-300 font-bold text-base">
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

            {/* Live Status Banner */}
            <div
              className={`p-3 rounded-xl border text-xs font-mono ${
                escaped
                  ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              {escaped && <Trophy className="w-4 h-4 text-amber-400 inline mr-1.5" />}
              {statusMessage}
            </div>

            {escaped && onEscape && <button className="architect-btn architect-btn-primary w-full" onClick={onClose}>Continue to sector map</button>}
            {/* On-Screen Tactical D-Pad */}
            <div className="flex flex-col items-center gap-1.5 py-2">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
