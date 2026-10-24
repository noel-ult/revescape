import React, { useState } from 'react';
import { cloneGrid, isAnchorCell } from '../../shared/board';
import { runAutonomousAgent } from '../../shared/agent';
import { validateBoard } from '../../shared/validator';
import type { AutonomousAgentResult, Grid, SolverResult, TileType } from '../../shared/types';

export function DecisionRewind({ grid, agent, cursor, paused, branched, onBranch, onRestore }: {
  grid: Grid; agent: AutonomousAgentResult; cursor: number; paused: boolean; branched: boolean;
  onBranch: (grid: Grid, result: AutonomousAgentResult, bfs: SolverResult) => void; onRestore: () => void;
}) {
  const [row, setRow] = useState('0');
  const [col, setCol] = useState('1');
  const [tile, setTile] = useState<TileType>('WALL');
  const [message, setMessage] = useState('');
  const [comparison, setComparison] = useState('');
  const current = agent.steps[Math.min(cursor, agent.steps.length - 1)];
  const compare = () => {
    try {
      const r = Number(row), c = Number(col);
      if (!row.trim() || !col.trim() || !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 7 || c < 0 || c > 7) throw new Error('Choose a row and column from 0 to 7.');
      if (!current || current.event === 'EXIT') throw new Error('Rewind to a step before extraction.');
      if (isAnchorCell(r, c) || current.row === r && current.col === c) throw new Error('Keep deployment, extraction and the scout’s current cell unchanged.');
      if (grid[r][c].startsWith('ELEVATOR_')) throw new Error('Lift topology stays fixed during rewind. Redesign decks in Architect studio.');
      if (grid[r][c] === tile) throw new Error('Choose a component that changes this cell.');
      const edited = cloneGrid(grid); edited[r][c] = tile;
      const validation = validateBoard(edited);
      if (!validation.valid) throw new Error(validation.errors[0]);
      const prefix = agent.steps.slice(0, cursor + 1);
      const result = runAutonomousAgent(edited, { visibilityRadius: agent.visibilityRadius,
        resume: { sourceGrid: grid, steps: prefix, decisionEvents: agent.decisionEvents, attemptNumber: agent.attemptNumber } });
      if (!result.escaped) throw new Error('This edit leaves the scout unable to finish from the selected state. Try another cell.');
      setComparison(`Original: ${agent.totalSteps} moves. Branch: ${result.totalSteps} moves (${result.totalSteps - agent.totalSteps >= 0 ? '+' : ''}${result.totalSteps - agent.totalSteps}). Resumed after step ${current.stepIndex}.`);
      setMessage('The branch keeps the replay prefix, inventory, discovered map and remembered hazards. New or changed cells are learned only through observation.');
      onBranch(edited, result, validation.solverResult!);
    } catch (error) { setMessage((error as Error).message); }
  };
  return <section className="decision-rewind architect-panel" aria-label="Decision rewind laboratory">
    <div><h3>Decision rewind</h3><p>Pause or scrub the replay, inspect the scout’s fog-of-war knowledge, then change one component and compare the continuation. This local experiment uses deterministic frontier + A*; submitted scores stay unchanged.</p></div>
    <form noValidate onSubmit={event => { event.preventDefault(); if (paused && !branched) compare(); }}>
      <label>Row<input aria-label="Rewind edit row" type="number" min={0} max={7} step={1} value={row} onChange={e => setRow(e.target.value)} disabled={branched} /></label>
      <label>Column<input aria-label="Rewind edit column" type="number" min={0} max={7} step={1} value={col} onChange={e => setCol(e.target.value)} disabled={branched} /></label>
      <label>New component<select aria-label="Rewind component" value={tile} onChange={e => setTile(e.target.value as TileType)} disabled={branched}><option value="WALL">Plasma wall</option><option value="EMPTY">Clear floor</option><option value="GRAVITY_MUD">Cryo field</option><option value="EMP_SCRAMBLER">EMP jammer</option></select></label>
      <button className="architect-btn architect-btn-primary" data-testid="compare-rewind-btn" type="submit" disabled={!paused || branched || current?.event === 'EXIT'}>Compare continuation</button>
      {branched && <button className="architect-btn" type="button" onClick={() => { onRestore(); setMessage('Original replay restored.'); setComparison(''); }}>Restore original replay</button>}
    </form>
    {!paused && !branched && <p>Pause the replay to choose a decision point.</p>}
    {comparison && <p className="rewind-comparison" data-testid="rewind-comparison">{comparison}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
