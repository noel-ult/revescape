import React, { useState } from 'react';
import {
  AlertOctagon,
  Bot,
  Flag,
  KeyRound,
  Lock,
  Orbit,
  Power,
  Radio,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Unlock,
  Zap,
} from 'lucide-react';
import { findPortalDestination, isAnchorCell } from '../../shared/board';
import { TILE_CATALOG } from '../../shared/constants';
import type { Sector } from '../../shared/sectors';
import {
  AgentSimulationStep,
  Coordinate,
  ExploredCell,
  Grid,
  SolverStep,
  TileType,
} from '../../shared/types';

export interface PuzzleGridProps {
  grid: Grid;
  roomLabel?: string;
  sectorMap?: boolean;
  sectors?: readonly Sector[];
  initialCamera?: 'orbit' | 'top' | 'follow';
  followLabel?: string;
  selectedSectorId?: string;
  completedSectors?: string[];
  onSectorSelect?: (id: string) => void;
  opponentStep?: SolverStep | AgentSimulationStep | null;
  interactive?: boolean;
  onCellInteract?: (row: number, col: number, isErase?: boolean) => void;
  currentStep?: SolverStep | AgentSimulationStep | null;
  visitedSteps?: Array<SolverStep | AgentSimulationStep>;
  exploredCells?: ExploredCell[];
  showHeatmap?: boolean;
  viewMode?: 'WORLD' | 'AI_FOG';
  plannedRoute?: Coordinate[];
  compact?: boolean;
  sabotageMode?: boolean;
  theme?: 'ion' | 'ember' | 'void';
  stepDurationMs?: number;
  onCellHover?: (row: number, col: number) => void;
  ghostCells?: Array<Coordinate & { tile: TileType }>;
  ghostValid?: boolean;
  paintDrag?: boolean;
}

export const BlueprintGrid: React.FC<PuzzleGridProps> = ({
  grid,
  interactive = false,
  onCellInteract,
  currentStep = null,
  visitedSteps = [],
  exploredCells = [],
  showHeatmap = false,
  viewMode = 'WORLD',
  plannedRoute = [],
  compact = false,
  sabotageMode = false,
}) => {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [eraseDrag, setEraseDrag] = useState(false);

  const activeKeyMask = currentStep?.keyMask ?? 0;
  const activeSwitchMask = currentStep?.switchMask ?? 0;

  const isAgentStep = (
    step: SolverStep | AgentSimulationStep | null
  ): step is AgentSimulationStep => {
    return Boolean(step && 'visibleCells' in step);
  };

  const agentStep = isAgentStep(currentStep) ? currentStep : null;

  const visibleSet = new Set<string>(agentStep?.visibleCells ?? []);
  const discoveredSet = new Set<string>(agentStep?.discoveredCells ?? []);
  const knownHazardsSet = new Set<string>(agentStep?.knownHazards ?? []);
  const verifiedDecoysSet = new Set<string>(agentStep?.verifiedDecoys ?? []);
  const triggeredResetsSet = new Set<string>(
    agentStep?.triggeredResetPositions ?? []
  );

  const pathCoordSet = new Set<string>(
    visitedSteps.map((s) => `${s.row},${s.col}`)
  );

  const exploredMap = new Map<string, ExploredCell>();
  for (const ec of exploredCells) {
    exploredMap.set(`${ec.row},${ec.col}`, ec);
  }

  // Find portal pair if 2 portals exist on board for SVG tether line
  let portalPair: [Coordinate, Coordinate] | null = null;
  const portals: Coordinate[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (grid[r]?.[c] === 'PORTAL_A') {
        portals.push({ row: r, col: c });
      }
    }
  }
  if (portals.length === 2) {
    portalPair = [portals[0], portals[1]];
  }

  const handlePointerDown = (
    e: React.MouseEvent<HTMLButtonElement>,
    r: number,
    c: number
  ) => {
    if (!interactive || !onCellInteract) return;
    e.preventDefault();
    const shouldErase = e.button === 2;
    setIsMouseDown(true);
    setEraseDrag(shouldErase);
    onCellInteract(r, c, shouldErase);
  };

  const handlePointerEnter = (r: number, c: number) => {
    if (!interactive || !isMouseDown || !onCellInteract) return;
    onCellInteract(r, c, eraseDrag);
  };

  // Convert (row, col) to SVG percentage coordinates (0..800 viewBox)
  const cellCenter = (r: number, c: number) => ({
    x: c * 100 + 50,
    y: r * 100 + 50,
  });

  // Build continuous polyline points for visited steps (breaking on teleports > 1 Manhattan step)
  const buildVisitedSegments = (): string[] => {
    if (visitedSteps.length < 2) return [];
    const segments: string[] = [];
    let currentPoints: string[] = [];

    for (let i = 0; i < visitedSteps.length; i++) {
      const s = visitedSteps[i];
      const pt = cellCenter(s.row, s.col);
      if (i > 0) {
        const prev = visitedSteps[i - 1];
        const dist = Math.abs(s.row - prev.row) + Math.abs(s.col - prev.col);
        if (dist > 1) {
          if (currentPoints.length >= 2) {
            segments.push(currentPoints.join(' '));
          }
          currentPoints = [`${pt.x},${pt.y}`];
          continue;
        }
      }
      currentPoints.push(`${pt.x},${pt.y}`);
    }
    if (currentPoints.length >= 2) {
      segments.push(currentPoints.join(' '));
    }
    return segments;
  };

  const visitedPolylineSegments = buildVisitedSegments();

  // Build A* planned route polyline starting from currentStep
  const buildPlannedPolyline = (): string | null => {
    if (!currentStep || plannedRoute.length === 0) return null;
    const pts: string[] = [];
    const startPt = cellCenter(currentStep.row, currentStep.col);
    pts.push(`${startPt.x},${startPt.y}`);
    for (const coord of plannedRoute) {
      const p = cellCenter(coord.row, coord.col);
      pts.push(`${p.x},${p.y}`);
    }
    return pts.join(' ');
  };

  const plannedPolyline = buildPlannedPolyline();

  const renderTileHardware = (
    tile: TileType,
    r: number,
    c: number,
    coordKey: string,
    isCollectedKey: boolean,
    isDoorOpen: boolean,
    isGatePassable: boolean
  ) => {
    const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5 sm:w-6 sm:h-6';

    // In AI_FOG view, unremembered TRAP_RESET & EMP_SCRAMBLER are cloaked!
    if (
      viewMode === 'AI_FOG' &&
      (tile === 'TRAP_RESET' || tile === 'EMP_SCRAMBLER') &&
      !knownHazardsSet.has(coordKey) &&
      !triggeredResetsSet.has(coordKey)
    ) {
      return null;
    }

    switch (tile) {
      case 'START':
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            <div className="absolute inset-1.5 rounded-full border border-cyan-400/50 animate-pulse-ring pointer-events-none" />
            <Sparkles className={`${iconSize} text-cyan-300 drop-shadow-[0_0_8px_#00f0ff]`} />
            {!compact && (
              <span className="text-[8px] font-mono font-extrabold tracking-widest text-cyan-200 mt-0.5">
                DROP
              </span>
            )}
          </div>
        );

      case 'ELEVATOR_A':
      case 'ELEVATOR_B':
        return (
          <div className="flex flex-col items-center justify-center w-full h-full text-emerald-200">
            <Orbit className={`${iconSize} animate-radar`} />
            {!compact && <span className="text-[8px] font-mono">{tile === 'ELEVATOR_A' ? 'DECK 1' : 'DECK 2'}</span>}
          </div>
        );

      case 'EXIT':
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            <div className="absolute inset-1 rounded-full border-2 border-dashed border-emerald-400/60 animate-radar pointer-events-none" />
            <Flag className={`${iconSize} text-emerald-300 drop-shadow-[0_0_10px_#10b981]`} />
            {!compact && (
              <span className="text-[8px] font-mono font-extrabold tracking-widest text-emerald-200 mt-0.5">
                CORE
              </span>
            )}
          </div>
        );

      case 'WALL': {
        const up = r > 0 && grid[r - 1]?.[c] === 'WALL';
        const down = r < 7 && grid[r + 1]?.[c] === 'WALL';
        const left = c > 0 && grid[r]?.[c - 1] === 'WALL';
        const right = c < 7 && grid[r]?.[c + 1] === 'WALL';

        return (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Connected Laser Beams */}
            {up && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1/2 bg-cyan-400/80 shadow-[0_0_10px_#00f0ff]" />
            )}
            {down && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1/2 bg-cyan-400/80 shadow-[0_0_10px_#00f0ff]" />
            )}
            {left && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 w-1/2 bg-cyan-400/80 shadow-[0_0_10px_#00f0ff]" />
            )}
            {right && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-1.5 w-1/2 bg-cyan-400/80 shadow-[0_0_10px_#00f0ff]" />
            )}
            {/* Central Plasma Pylon */}
            <div className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-950 border-2 border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.75)] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse" />
            </div>
          </div>
        );
      }

      case 'DECOY_EXIT': {
        const isFakeKnown = verifiedDecoysSet.has(coordKey);
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            {!isFakeKnown && (
              <div className="absolute inset-1 rounded-full border border-pink-400/60 animate-pulse-ring pointer-events-none" />
            )}
            <Radio
              className={`${iconSize} ${
                isFakeKnown
                  ? 'text-pink-400/35'
                  : 'text-pink-300 drop-shadow-[0_0_10px_#ec4899]'
              }`}
            />
            {!compact && (
              <span className="text-[8px] font-mono font-bold tracking-wider text-pink-200">
                {isFakeKnown ? 'EXPOSED' : 'MIRAGE'}
              </span>
            )}
          </div>
        );
      }

      case 'TRAP_RESET': {
        const isSpent = triggeredResetsSet.has(coordKey);
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            {!isSpent && (
              <div className="absolute inset-1.5 rounded-full border border-dashed border-orange-400/70 animate-radar pointer-events-none" />
            )}
            <AlertOctagon
              className={`${iconSize} ${
                isSpent
                  ? 'text-orange-400/35'
                  : 'text-orange-400 drop-shadow-[0_0_10px_#f97316]'
              }`}
            />
            {!compact && (
              <span className="text-[8px] font-mono font-bold tracking-wider text-orange-200">
                {isSpent ? 'SPENT' : 'WARP MINE'}
              </span>
            )}
          </div>
        );
      }

      case 'EMP_SCRAMBLER': {
        const isSpent = triggeredResetsSet.has(coordKey);
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            <Zap
              className={`${iconSize} ${
                isSpent
                  ? 'text-yellow-400/35'
                  : 'text-yellow-300 drop-shadow-[0_0_10px_#eab308] animate-pulse'
              }`}
            />
            {!compact && (
              <span className="text-[8px] font-mono font-bold tracking-wider text-yellow-200">
                {isSpent ? 'JAMMED' : 'EMP'}
              </span>
            )}
          </div>
        );
      }

      case 'PORTAL_A': {
        const linked = findPortalDestination(grid, r, c);
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            <div className="absolute inset-1 rounded-full border-2 border-indigo-400/60 animate-radar pointer-events-none" />
            <Orbit
              className={`${iconSize} text-indigo-300 drop-shadow-[0_0_10px_#818cf8]`}
            />
            {!compact && (
              <span className="text-[8px] font-mono font-bold text-indigo-200">
                {linked ? 'LINKED' : 'PORTAL'}
              </span>
            )}
          </div>
        );
      }

      case 'GRAVITY_MUD':
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-full bg-sky-500/10 rounded-md">
            <Snowflake
              className={`${iconSize} text-sky-300/90 animate-spin`}
              style={{ animationDuration: '8s' }}
            />
            {!compact && (
              <span className="text-[8px] font-mono font-bold text-sky-200">
                3x SLOW
              </span>
            )}
          </div>
        );

      case 'KEY_RED':
        return (
          <div className="flex flex-col items-center animate-float">
            <KeyRound
              className={`${iconSize} text-rose-400 transition-all ${
                isCollectedKey
                  ? 'opacity-20 scale-75'
                  : 'drop-shadow-[0_0_10px_rgba(244,63,94,0.95)]'
              }`}
            />
            {!compact && !isCollectedKey && (
              <span className="text-[7px] font-mono font-bold text-rose-200">
                CIPHER-R
              </span>
            )}
          </div>
        );

      case 'KEY_CYAN':
        return (
          <div className="flex flex-col items-center animate-float">
            <KeyRound
              className={`${iconSize} text-cyan-300 transition-all ${
                isCollectedKey
                  ? 'opacity-20 scale-75'
                  : 'drop-shadow-[0_0_10px_rgba(34,211,238,0.95)]'
              }`}
            />
            {!compact && !isCollectedKey && (
              <span className="text-[7px] font-mono font-bold text-cyan-200">
                CIPHER-C
              </span>
            )}
          </div>
        );

      case 'KEY_GOLD':
        return (
          <div className="flex flex-col items-center animate-float">
            <KeyRound
              className={`${iconSize} text-amber-300 transition-all ${
                isCollectedKey
                  ? 'opacity-20 scale-75'
                  : 'drop-shadow-[0_0_10px_rgba(251,191,36,0.95)]'
              }`}
            />
            {!compact && !isCollectedKey && (
              <span className="text-[7px] font-mono font-bold text-amber-200">
                CIPHER-G
              </span>
            )}
          </div>
        );

      case 'DOOR_RED':
        return (
          <div className="flex flex-col items-center">
            {isDoorOpen ? (
              <Unlock className={`${iconSize} text-rose-300/45`} />
            ) : (
              <Lock className={`${iconSize} text-rose-400 drop-shadow-[0_0_8px_#f43f5e]`} />
            )}
            {!compact && (
              <span className="text-[7px] font-mono font-bold text-rose-200">
                {isDoorOpen ? 'OPEN' : 'LOCK-R'}
              </span>
            )}
          </div>
        );

      case 'DOOR_CYAN':
        return (
          <div className="flex flex-col items-center">
            {isDoorOpen ? (
              <Unlock className={`${iconSize} text-cyan-300/45`} />
            ) : (
              <Lock className={`${iconSize} text-cyan-400 drop-shadow-[0_0_8px_#06b6d4]`} />
            )}
            {!compact && (
              <span className="text-[7px] font-mono font-bold text-cyan-200">
                {isDoorOpen ? 'OPEN' : 'LOCK-C'}
              </span>
            )}
          </div>
        );

      case 'DOOR_GOLD':
        return (
          <div className="flex flex-col items-center">
            {isDoorOpen ? (
              <Unlock className={`${iconSize} text-amber-300/45`} />
            ) : (
              <Lock className={`${iconSize} text-amber-400 drop-shadow-[0_0_8px_#f59e0b]`} />
            )}
            {!compact && (
              <span className="text-[7px] font-mono font-bold text-amber-200">
                {isDoorOpen ? 'OPEN' : 'LOCK-G'}
              </span>
            )}
          </div>
        );

      case 'SWITCH_A':
        return (
          <div className="flex flex-col items-center">
            <Power
              className={`${iconSize} ${
                activeSwitchMask === 1
                  ? 'text-purple-200 drop-shadow-[0_0_10px_#c084fc] animate-spin'
                  : 'text-purple-400'
              }`}
              style={{ animationDuration: '4s' }}
            />
            {!compact && (
              <span className="text-[7px] font-mono font-bold text-purple-200">
                PHASE {activeSwitchMask === 1 ? 'ON' : 'OFF'}
              </span>
            )}
          </div>
        );

      case 'GATE_A_CLOSED':
      case 'GATE_A_OPEN':
        return (
          <div className="flex flex-col items-center">
            <ShieldAlert
              className={`${iconSize} ${
                isGatePassable
                  ? 'text-purple-300/35'
                  : 'text-purple-400 drop-shadow-[0_0_8px_#a855f7]'
              }`}
            />
            {!compact && (
              <span className="text-[8px] font-mono font-bold uppercase text-purple-200">
                {isGatePassable ? 'OPEN' : 'BARRIER'}
              </span>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`select-none relative inline-block p-3 sm:p-4 rounded-2xl arena-chassis border-2 ${
        sabotageMode
          ? 'border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.45)]'
          : 'border-cyan-500/40'
      }`}
      onMouseLeave={() => setIsMouseDown(false)}
      onMouseUp={() => setIsMouseDown(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Corner Tactical HUD Brackets */}
      <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-cyan-400/70 pointer-events-none" />
      <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-cyan-400/70 pointer-events-none" />
      <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-cyan-400/70 pointer-events-none" />
      <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-cyan-400/70 pointer-events-none" />

      <div className="relative">
        {/* Continuous SVG Tactical Laser & Trajectory Overlay */}
        <svg
          viewBox="0 0 800 800"
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        >
          <defs>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Linked Quantum Wormhole Tether Line */}
          {portalPair && (
            <line
              x1={cellCenter(portalPair[0].row, portalPair[0].col).x}
              y1={cellCenter(portalPair[0].row, portalPair[0].col).y}
              x2={cellCenter(portalPair[1].row, portalPair[1].col).x}
              y2={cellCenter(portalPair[1].row, portalPair[1].col).y}
              stroke="#818cf8"
              strokeWidth="4"
              strokeDasharray="10 10"
              strokeOpacity="0.55"
              className="animate-dash-flow"
            />
          )}

          {/* Visited AI Escape Trajectory Spline */}
          {visitedPolylineSegments.map((pts, idx) => (
            <g key={idx}>
              <polyline
                fill="none"
                stroke="#00f0ff"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.22"
                points={pts}
              />
              <polyline
                fill="none"
                stroke="#00f0ff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#neonGlow)"
                points={pts}
              />
            </g>
          ))}

          {/* Planned A* Future Trajectory Dashed Line */}
          {plannedPolyline && (
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="5"
              strokeDasharray="12 8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-dash-flow"
              points={plannedPolyline}
            />
          )}

          {/* Active AI Lidar Scanner Ring */}
          {currentStep && (
            <circle
              cx={cellCenter(currentStep.row, currentStep.col).x}
              cy={cellCenter(currentStep.row, currentStep.col).y}
              r={
                agentStep && agentStep.empRemainingTurns > 0
                  ? 110
                  : 195
              }
              fill="rgba(0, 240, 255, 0.03)"
              stroke={
                agentStep && agentStep.empRemainingTurns > 0
                  ? '#eab308'
                  : '#00f0ff'
              }
              strokeWidth="2.5"
              strokeDasharray="14 10"
              strokeOpacity="0.45"
            />
          )}
        </svg>

        <div
          className={`grid grid-cols-8 ${
            compact ? 'gap-1' : 'gap-1.5 sm:gap-2'
          }`}
          data-testid="puzzle-grid"
        >
          {grid.map((row, r) =>
            row.map((tile, c) => {
              const coordKey = `${r},${c}`;
              const isAiHere =
                currentStep !== null &&
                currentStep.row === r &&
                currentStep.col === c;
              const isOnVisitedPath = pathCoordSet.has(coordKey);
              const exploredInfo = exploredMap.get(coordKey);
              const anchor = isAnchorCell(r, c);

              const isCurrentlyVisible =
                !agentStep || visibleSet.has(coordKey);
              const isDiscovered =
                !agentStep ||
                discoveredSet.has(coordKey) ||
                isCurrentlyVisible;
              const isHiddenByFog = viewMode === 'AI_FOG' && !isDiscovered;

              const isCollectedKey =
                (tile === 'KEY_RED' && (activeKeyMask & 1) !== 0) ||
                (tile === 'KEY_CYAN' && (activeKeyMask & 2) !== 0) ||
                (tile === 'KEY_GOLD' && (activeKeyMask & 4) !== 0);

              const isDoorOpen =
                (tile === 'DOOR_RED' && (activeKeyMask & 1) !== 0) ||
                (tile === 'DOOR_CYAN' && (activeKeyMask & 2) !== 0) ||
                (tile === 'DOOR_GOLD' && (activeKeyMask & 4) !== 0);

              const isGatePassable =
                currentStep !== null
                  ? (tile === 'GATE_A_CLOSED' && (activeSwitchMask & 1) === 1) ||
                    (tile === 'GATE_A_OPEN' && (activeSwitchMask & 1) === 0)
                  : tile === 'GATE_A_OPEN';

              const effectiveTile: TileType =
                isHiddenByFog ||
                (viewMode === 'AI_FOG' &&
                  (tile === 'TRAP_RESET' || tile === 'EMP_SCRAMBLER') &&
                  !knownHazardsSet.has(coordKey) &&
                  !triggeredResetsSet.has(coordKey))
                  ? 'EMPTY'
                  : tile;

              const meta = TILE_CATALOG[effectiveTile] ?? TILE_CATALOG.EMPTY;

              const sizeClasses = compact
                ? 'w-8 h-8 sm:w-9 sm:h-9'
                : 'w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14';

              return (
                <button
                  key={coordKey}
                  type="button"
                  data-testid={`grid-cell-${r}-${c}`}
                  data-tile={tile}
                  disabled={!interactive}
                  onMouseDown={(e) => handlePointerDown(e, r, c)}
                  onMouseEnter={() => handlePointerEnter(r, c)}
                  onClick={(event) => {
                    // Native keyboard/touch activation; mouse placement is handled above.
                    if (event.detail === 0 && interactive) onCellInteract?.(r, c);
                  }}
                  title={`(${r}, ${c}) — ${
                    isHiddenByFog ? 'Unexplored Fog of War' : meta.label
                  }`}
                  className={`relative ${sizeClasses} rounded-lg border flex items-center justify-center transition-all duration-150 overflow-hidden ${
                    isHiddenByFog
                      ? 'bg-[#03060f] border-slate-800/60 text-slate-700'
                      : meta.colorClass
                  } ${
                    interactive && !anchor
                      ? sabotageMode
                        ? 'hover:border-rose-400 hover:bg-rose-500/20 cursor-crosshair'
                        : 'hover:border-cyan-400 hover:scale-[1.03] cursor-pointer'
                      : 'cursor-default'
                  } ${
                    isOnVisitedPath && !isHiddenByFog
                      ? 'border-cyan-400/60 bg-cyan-500/10'
                      : ''
                  } ${
                    agentStep && isCurrentlyVisible && !isHiddenByFog
                      ? 'shadow-[inset_0_0_12px_rgba(0,240,255,0.25)]'
                      : ''
                  }`}
                >
                  {/* Subtle Cybernetic Grid Crosshair in Floor Cells */}
                  {!isHiddenByFog && effectiveTile === 'EMPTY' && (
                    <div className="w-1 h-1 rounded-full bg-slate-700/60 pointer-events-none" />
                  )}

                  {/* Unexplored Fog-of-War Hatching */}
                  {isHiddenByFog && (
                    <div
                      data-testid={`fog-cell-${r}-${c}`}
                      className="w-full h-full flex items-center justify-center bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:6px_6px] opacity-60"
                    >
                      <span className="text-[9px] font-mono text-slate-600">
                        ?
                      </span>
                    </div>
                  )}

                  {/* World View Dimmed Fog Indicator for Undiscovered Cells */}
                  {viewMode === 'WORLD' && agentStep && !isDiscovered && (
                    <div className="absolute inset-0 rounded-lg bg-slate-950/55 pointer-events-none border border-dashed border-slate-700/40" />
                  )}

                  {/* Optional BFS Search Heatmap Overlay */}
                  {showHeatmap &&
                    !isHiddenByFog &&
                    exploredInfo &&
                    !isOnVisitedPath && (
                      <div className="absolute inset-0 rounded-lg bg-purple-500/25 pointer-events-none flex items-end justify-end p-0.5">
                        <span className="text-[8px] font-mono text-purple-200/80 leading-none">
                          {exploredInfo.visitOrder}
                        </span>
                      </div>
                    )}

                  {!isHiddenByFog &&
                    renderTileHardware(
                      tile,
                      r,
                      c,
                      coordKey,
                      isCollectedKey,
                      isDoorOpen,
                      isGatePassable
                    )}

                  {/* Animated AI Cyber-Drone Avatar */}
                  {isAiHere && (
                    <div
                      data-testid="ai-agent-avatar"
                      className={`absolute inset-0.5 rounded-lg flex items-center justify-center z-20 transition-transform ${
                        currentStep?.event === 'TRAP_RESET_TRIGGERED'
                          ? 'bg-orange-500 text-slate-950 shadow-[0_0_20px_#f97316] scale-110'
                          : currentStep?.event === 'EMP_JAMMED'
                          ? 'bg-yellow-400 text-slate-950 shadow-[0_0_20px_#eab308]'
                          : currentStep?.event === 'PORTAL_WARP'
                          ? 'bg-indigo-400 text-slate-950 shadow-[0_0_20px_#818cf8] scale-110'
                          : 'bg-cyan-400 text-slate-950 shadow-[0_0_18px_#00f0ff]'
                      }`}
                    >
                      <Bot
                        className={
                          compact ? 'w-5 h-5' : 'w-6 h-6 stroke-[2.5]'
                        }
                      />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
