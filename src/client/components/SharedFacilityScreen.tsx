import React, { useMemo, useState } from 'react';
import { validateBoard } from '../../shared/validator';
import type { Grid } from '../../shared/types';
import { HumanPlayModal } from './HumanPlayModal';
import { PuzzleGrid } from './PuzzleGrid';
import { FacilityShare } from './FacilityShare';

export function SharedFacilityScreen({ facility, onExit, onRemix }: { facility: { grid?: Grid; error?: string }; onExit: () => void; onRemix: (grid: Grid) => void }) {
  const [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState(false);
  const validation = useMemo(() => facility.grid ? validateBoard(facility.grid) : undefined, [facility.grid]);
  if (!facility.grid || !validation?.valid) return <div className="sector-page"><h1>Facility link unavailable</h1><p role="alert">{facility.error ?? 'This facility is invalid.'}</p><button className="architect-btn" onClick={onExit}>Return home</button></div>;
  const grid = facility.grid;
  return <div className="sector-page">
    <div className="sector-page-heading"><div><span className="architect-eyebrow">Community challenge / validated blueprint</span><h1>Can you escape this facility?</h1><p>Play a friend’s design yourself, race the deterministic scout, or remix it into your own challenge.</p></div><button className="architect-btn" onClick={onExit}>Home</button></div>
    <div className="sector-layout"><PuzzleGrid grid={grid} roomLabel="Shared facility" /><aside className="architect-panel sector-detail"><h2>Shared facility</h2><p>{validation.budgetUsed}/30 energy · {validation.solverResult!.shortestPathLength} optimal moves · {validation.agentResult!.totalSteps} scout moves</p>
      <button className="architect-btn architect-btn-primary" onClick={() => { setGhost(false); setPlaying(true); }}>Play shared facility</button>
      <button className="architect-btn" onClick={() => { setGhost(true); setPlaying(true); }}>Race the AI ghost</button>
      <button className="architect-btn" onClick={() => onRemix(grid)}>Remix in architect studio</button><FacilityShare grid={grid} valid /></aside></div>
    <HumanPlayModal open={playing} title="Shared facility" grid={grid} ghostRace={ghost} aiOptimalMoves={validation.solverResult!.shortestPathLength} aiFogMoves={validation.agentResult!.totalSteps} onClose={() => setPlaying(false)} />
  </div>;
}
