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
import { findPortalDestination } from '../../shared/board';
import { canTraverseDeck, deckAt, getDeckTopology } from '../../shared/levels';
import {
  EXIT_POS,
  GRID_COLS,
  GRID_ROWS,
  KEY_BITS,
  START_POS,
} from '../../shared/constants';
import { canEnterTile } from '../../shared/solver';
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
}

export const HumanPlayModal: React.FC<HumanPlayModalProps> = ({
  open,
  title,
  grid,
  aiOptimalMoves,
  aiFogMoves,
  onClose,
}) => {
  const [pos, setPos] = useState<Coordinate>({ ...START_POS });
  const [keyMask, setKeyMask] = useState(0);
  const [switchMask, setSwitchMask] = useState(0);
  const [spentTraps, setSpentTraps] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<SolverStep[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Use WASD or Arrow Keys to infiltrate the arena!'
  );
  const [escaped, setEscaped] = useState(false);
  const lastMoveAt = useRef(0);

  const resetRun = useCallback(() => {
    setPos({ ...START_POS });
    setKeyMask(0);
    setSwitchMask(0);
    setSpentTraps(new Set());
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
      if (now - lastMoveAt.current < 190) return;
      lastMoveAt.current = now;
      const nr = pos.row + dr;
      const nc = pos.col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) return;
      const topology = getDeckTopology(grid);
      if (!canTraverseDeck(topology, pos, { row: nr, col: nc })) {
        soundFX.playError();
        setStatusMessage('The raised platform is inaccessible from here. Find its lift bridge.');
        return;
      }

      const targetTile = grid[nr][nc];
      if (!canEnterTile(targetTile, keyMask, switchMask)) {
        soundFX.playError();
        setStatusMessage(`Blocked by ${targetTile}! Collect the matching key or flip the phase switch.`);
        return;
      }

      let finalRow = nr;
      let finalCol = nc;
      let nextKeyMask = keyMask;
      let nextSwitchMask = switchMask;
      let event: SolverStep['event'] = 'MOVE';
      const nextSpent = new Set(spentTraps);
      const cKey = `${nr},${nc}`;

      const kBit = KEY_BITS[targetTile];
      if (kBit !== undefined && (keyMask & kBit) === 0) {
        nextKeyMask |= kBit;
        event = 'COLLECT_KEY';
        soundFX.playKeyPickup();
        setStatusMessage(`Collected ${targetTile}!`);
      } else if (targetTile === 'SWITCH_A') {
        nextSwitchMask ^= 1;
        event = 'TOGGLE_SWITCH';
        soundFX.playSwitchToggle();
        setStatusMessage(
          `Phase Inverter toggled ${nextSwitchMask === 1 ? 'ON' : 'OFF'}!`
        );
      } else if (targetTile === 'TRAP_RESET' && !spentTraps.has(cKey)) {
        nextSpent.add(cKey);
        event = 'TRAP_RESET_TRIGGERED';
        finalRow = START_POS.row;
        finalCol = START_POS.col;
        soundFX.playError();
        setStatusMessage('BOOM! Spring Ejector Mine blasted you back to Spawn (0,0)!');
      } else if (targetTile === 'PORTAL_A') {
        const dest = findPortalDestination(grid, nr, nc);
        if (dest) {
          event = 'PORTAL_WARP';
          finalRow = dest.row;
          finalCol = dest.col;
          soundFX.playSwitchToggle();
          setStatusMessage(
            `Warped through Quantum Wormhole to (${dest.row}, ${dest.col})!`
          );
        }
      } else if (targetTile === 'DECOY_EXIT') {
        soundFX.playErase();
        setStatusMessage('IT IS A HOLOGRAM! That was a Decoy Exit Beacon!');
      } else if (targetTile === 'EXIT') {
        soundFX.playSuccess();
        setEscaped(true);
        setStatusMessage('EXTRACTION COMPLETE! You escaped the trap!');
      } else {
        soundFX.playStep();
      }
      const oldLevel = deckAt(topology, pos.row, pos.col);
      const newLevel = deckAt(topology, finalRow, finalCol);
      if (oldLevel !== newLevel && event === 'MOVE') {
        event = 'CHANGE_LEVEL';
        setStatusMessage(`Crossed lift bridge to deck ${newLevel}.`);
      }

      setPos({ row: finalRow, col: finalCol });
      setKeyMask(nextKeyMask);
      setSwitchMask(nextSwitchMask);
      setSpentTraps(nextSpent);
      setHistory((prev) => [
        ...prev,
        {
          stepIndex: prev.length,
          row: finalRow,
          col: finalCol,
          level: newLevel,
          keyMask: nextKeyMask,
          switchMask: nextSwitchMask,
          event: finalRow === EXIT_POS.row && finalCol === EXIT_POS.col ? 'EXIT' : event,
          tile: targetTile,
          description: statusMessage,
        },
      ]);
    },
    [escaped, grid, keyMask, pos.col, pos.row, spentTraps, statusMessage, switchMask]
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

  const currentStep = history[history.length - 1] ?? null;
  const humanMoves = Math.max(0, history.length - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="cyber-card max-w-6xl w-full rounded-2xl p-6 border border-cyan-400/50 max-h-[92vh] overflow-y-auto">
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
              visitedSteps={history}
              viewMode="WORLD"
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

            {/* On-Screen Tactical D-Pad */}
            <div className="flex flex-col items-center gap-1.5 py-2">
              <button
                type="button"
                onClick={() => moveDelta(-1, 0)}
                className="w-12 h-10 rounded-xl bg-slate-800 hover:bg-cyan-500/20 border border-slate-600 hover:border-cyan-400 flex items-center justify-center text-white"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
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
                  onClick={() => moveDelta(0, 1)}
                  className="w-12 h-10 rounded-xl bg-slate-800 hover:bg-cyan-500/20 border border-slate-600 hover:border-cyan-400 flex items-center justify-center text-white"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <button
                type="button"
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
