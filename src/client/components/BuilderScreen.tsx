import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Box, CheckCircle2, Clock, Eraser, Gamepad2, Pause, Play, Redo2, RotateCw, Save, Trash2, Undo2 } from 'lucide-react';
import { cloneGrid, createEmptyGrid, isAnchorCell, PRESET_BOARDS } from '../../shared/board';
import { BUILDER_PALETTE_ORDER, MAX_BUDGET, TILE_CATALOG } from '../../shared/constants';
import { FACILITY_MODULES, FacilityModule, moduleFootprint, placeFacilityModule, SHOWCASE_FACILITY } from '../../shared/facility';
import { AgentSimulationStep, Grid, PlayerSlot, TileType } from '../../shared/types';
import { validateBoard } from '../../shared/validator';
import { soundFX } from '../lib/sound';
import { HumanPlayModal } from './HumanPlayModal';
import { PuzzleGrid } from './PuzzleGrid';
import { AIExplainer } from './AIExplainer';
import { getDeckTopology, validDeckAccess } from '../../shared/levels';

interface BuilderScreenProps {
  mode: 'SOLO' | 'PVP';
  initialGrid?: Grid;
  remainingSeconds?: number;
  isSubmitted?: boolean;
  opponent?: PlayerSlot;
  serverErrors?: string[];
  onGridChange?: (grid: Grid) => void;
  onSubmitRoom: (grid: Grid) => void;
  onExit: () => void;
}

function ModuleSketch({ module, rotation = 0 }: { module: FacilityModule; rotation?: number }) {
  const cells = moduleFootprint(module, 1, 1, rotation).sort((a, b) => a.row + a.col - b.row - b.col);
  return <svg viewBox="0 0 80 66" aria-hidden="true">
    <path d="M40 24 72 42 40 60 8 42Z" fill="#263944" stroke="#52717b" strokeWidth=".7" />
    {cells.map(({ row, col, tile }) => {
      const x = 40 + (col - row) * 10, y = 30 + (col + row) * 5;
      const h = tile === 'WALL' ? 14 : tile.startsWith('DOOR') || tile === 'GATE_A_CLOSED' ? 18 : 7;
      return <g key={`${row},${col}`}>
        <path d={`M${x-8} ${y}l8 4 8-4v${-h}l-8-4-8 4Z`} fill={tile === 'WALL' ? '#648392' : module.color} opacity=".8" />
        <path d={`M${x-8} ${y-h}l8 4 8-4-8-4Z`} fill={tile === 'WALL' ? '#a3bac3' : module.color} />
        <path d={`M${x} ${y+4}v${-h}`} stroke="#0c2637" strokeWidth=".7" />
      </g>;
    })}
  </svg>;
}

export const BuilderScreen: React.FC<BuilderScreenProps> = ({
  mode, initialGrid, remainingSeconds = 90, isSubmitted = false, opponent,
  serverErrors = [], onGridChange, onSubmitRoom, onExit,
}) => {
  const [grid, setGrid] = useState<Grid>(() => cloneGrid(initialGrid ?? createEmptyGrid()));
  const [history, setHistory] = useState<Grid[]>([]);
  const [redoStack, setRedoStack] = useState<Grid[]>([]);
  const [tab, setTab] = useState<'modules' | 'details'>('modules');
  const [selectedModule, setSelectedModule] = useState(FACILITY_MODULES[0]);
  const [selectedTool, setSelectedTool] = useState<TileType>('WALL');
  const [rotation, setRotation] = useState(0);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [theme, setTheme] = useState<'ion' | 'ember' | 'void'>(() => {
    try {
      const saved = localStorage.getItem('facility-theme');
      return saved === 'ember' || saved === 'void' ? saved : 'ion';
    } catch { return 'ion'; }
  });
  const [message, setMessage] = useState('');
  const [testSteps, setTestSteps] = useState<AgentSimulationStep[] | null>(null);
  const [testIndex, setTestIndex] = useState(0);
  const [testPlaying, setTestPlaying] = useState(false);
  const [humanPlayOpen, setHumanPlayOpen] = useState(false);
  const validation = useMemo(() => validateBoard(grid), [grid]);
  const deckTopology = useMemo(() => getDeckTopology(grid), [grid]);
  const activeStep = testSteps?.[testIndex] ?? null;
  const preview = hover && tab === 'modules' && !testSteps && !isSubmitted
    ? placeFacilityModule(grid, selectedModule, hover.row, hover.col, rotation) : null;
  const ghostCells = hover && !testSteps && !isSubmitted
    ? tab === 'modules' ? moduleFootprint(selectedModule, hover.row, hover.col, rotation)
      : [{ ...hover, tile: selectedTool }]
    : [];

  useEffect(() => {
    if (!testSteps || !testPlaying) return;
    if (testIndex >= testSteps.length - 1) { setTestPlaying(false); return; }
    const timer = setTimeout(() => {
      setTestIndex(i => i + 1);
      const event = testSteps[testIndex + 1].event;
      if (event === 'EXIT') soundFX.playSuccess();
      else if (event === 'COLLECT_KEY') soundFX.playKeyPickup();
      else if (event === 'PORTAL_WARP') soundFX.playSwitchToggle();
      else soundFX.playStep();
    }, 520);
    return () => clearTimeout(timer);
  }, [testSteps, testPlaying, testIndex]);

  const stopPreview = () => { setTestSteps(null); setTestPlaying(false); };
  const commit = (next: Grid) => {
    setHistory(previous => [...previous.slice(-29), cloneGrid(grid)]);
    setRedoStack([]);
    stopPreview();
    setGrid(next);
    onGridChange?.(next);
    setMessage('');
  };
  const interact = (row: number, col: number, erase = false) => {
    if (isSubmitted) return;
    if (isAnchorCell(row, col)) { setMessage('Deployment and extraction platforms are fixed. Build around them.'); return; }
    if (tab === 'modules' && !erase) {
      const result = placeFacilityModule(grid, selectedModule, row, col, rotation);
      if (result.error) { setMessage(result.error); soundFX.playError(); return; }
      commit(result.grid);
      soundFX.playPlace();
      return;
    }
    const tile = erase ? 'EMPTY' : selectedTool;
    const existing = grid[row][col];
    if (tile === existing) return;
    const meta = TILE_CATALOG[tile];
    if (tile !== 'EMPTY' && validation.tileCounts[tile] >= meta.maxCount) {
      setMessage(`${meta.label} capacity reached.`); return;
    }
    if (!validDeckAccess(tile, row, col)) {
      setMessage('A lift must sit on the main deck beside its corresponding raised platform.');
      soundFX.playError();
      return;
    }
    if (validation.budgetUsed - TILE_CATALOG[existing].cost + meta.cost > MAX_BUDGET) {
      setMessage('Not enough energy. Remove another structure first.'); return;
    }
    const next = cloneGrid(grid);
    next[row][col] = tile;
    commit(next);
    soundFX.playPlace();
  };
  const undo = () => {
    if (isSubmitted || !history.length) return;
    const next = history[history.length - 1];
    setRedoStack([cloneGrid(grid), ...redoStack]);
    setHistory(history.slice(0, -1));
    stopPreview(); setGrid(next); onGridChange?.(next);
  };
  const redo = () => {
    if (isSubmitted || !redoStack.length) return;
    const [next, ...rest] = redoStack;
    setHistory([...history, cloneGrid(grid)]);
    setRedoStack(rest);
    stopPreview(); setGrid(next); onGridChange?.(next);
  };
  const simulate = () => {
    if (testSteps && testIndex < testSteps.length - 1) { setTestPlaying(!testPlaying); return; }
    if (!validation.valid || !validation.agentResult) return;
    setTestSteps(validation.agentResult.steps); setTestIndex(0); setTestPlaying(true);
  };
  const save = () => {
    try {
      localStorage.setItem('facility-design', JSON.stringify(grid));
      setMessage('Facility saved on this device. Restore it from the setup library.');
    } catch { setMessage('Your browser could not save this design. Keep this tab open.'); }
  };
  const restore = () => {
    try {
      const raw = localStorage.getItem('facility-design');
      if (!raw) { setMessage('No saved facility yet. Use Save design first.'); return; }
      const candidate = JSON.parse(raw);
      const known = candidate?.length === 8 && candidate.every((r: unknown) => Array.isArray(r) && r.length === 8 && r.every(t => t in TILE_CATALOG));
      if (!known || candidate[0][0] !== 'START' || candidate[7][7] !== 'EXIT') throw new Error();
      commit(candidate);
    } catch { setMessage('The saved design could not be loaded. Your current facility is unchanged.'); }
  };
  const chooseTheme = (next: typeof theme) => {
    setTheme(next);
    try { localStorage.setItem('facility-theme', next); } catch { /* Cosmetic preference is optional. */ }
  };

  return (
    <div className="architect-shell">
      <div className="architect-heading">
        <div>
          <div className="architect-eyebrow">Reverse Escape / Architect studio</div>
          <h1>Build a world worth escaping.</h1>
          <p>Compose the facility. Shape its routes. Watch an intelligence find its way out.</p>
        </div>
        <div className="architect-badge">
          {mode === 'PVP' ? <><Clock size={15} /><span data-testid="build-timer">{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</span></> : <><Box size={16} /><span>FACILITY DESIGN / SANDBOX</span></>}
        </div>
      </div>

      <div className="architect-layout">
        <aside>
          <div className="architect-panel">
            <div className="architect-panel-header"><h2>Construction library</h2><p>Build entire spaces, then refine the details.</p></div>
            <div className="architect-tabs">
              <button className={tab === 'modules' ? 'active' : ''} onClick={() => setTab('modules')}>Room modules</button>
              <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Components</button>
            </div>
            {tab === 'modules' ? <div className="architect-module-list">
              {FACILITY_MODULES.map(module => (
                <button key={module.id} data-testid={`module-${module.id}`} disabled={isSubmitted}
                  className={`architect-module ${selectedModule.id === module.id ? 'active' : ''}`}
                  onClick={() => { setSelectedModule(module); stopPreview(); }}>
                  <ModuleSketch module={module} rotation={selectedModule.id === module.id ? rotation : 0} />
                  <span><strong>{module.name}</strong><small>{module.cells.reduce((n, c) => n + TILE_CATALOG[c.tile].cost, 0)} ENERGY · 3 × 3</small></span>
                </button>
              ))}
            </div> : <div className="architect-tool-grid">
              {BUILDER_PALETTE_ORDER.map(tile => <button key={tile} data-testid={`tool-${tile}`} disabled={isSubmitted}
                className={selectedTool === tile ? 'active' : ''} onClick={() => { setSelectedTool(tile); stopPreview(); }}>
                {TILE_CATALOG[tile].shortLabel}<small>{TILE_CATALOG[tile].cost} ENERGY · {validation.tileCounts[tile] ?? 0}/{TILE_CATALOG[tile].maxCount}</small>
              </button>)}
            </div>}
            <div className="architect-selection">
              <p>{tab === 'modules' ? selectedModule.description : TILE_CATALOG[selectedTool].description}</p>
              {tab === 'modules' && <button className="architect-btn" disabled={isSubmitted} onClick={() => setRotation((rotation + 1) % 4)}><RotateCw size={13} />Rotate module · {rotation * 90}°</button>}
            </div>
          </div>
          <div className="architect-panel architect-presets">
            <h3>SETUP LIBRARY</h3>
            <button disabled={isSubmitted} data-testid="preset-showcase" onClick={() => commit(cloneGrid(SHOWCASE_FACILITY))}>Orbital research station <ArrowRight size={13} /></button>
            {PRESET_BOARDS.map(preset => <button key={preset.id} disabled={isSubmitted} data-testid={`preset-${preset.id}`} onClick={() => commit(cloneGrid(preset.grid))}>{preset.name}<ArrowRight size={13} /></button>)}
            <button disabled={isSubmitted} onClick={restore}>Restore saved facility <Save size={12} /></button>
          </div>
          <AIExplainer step={activeStep} optimalMoves={validation.solverResult?.shortestPathLength}
            actualMoves={validation.agentResult?.totalSteps} compact />
        </aside>

        <main className="architect-workspace">
          <div className="architect-topbar">
            <div className="architect-themes">
              {([{ id: 'ion', name: 'Ion station', color: '#88d8ca' }, { id: 'ember', name: 'Ember foundry', color: '#e8ac7e' }, { id: 'void', name: 'Void laboratory', color: '#b7a0e8' }] as const).map(item =>
                <button key={item.id} className={theme === item.id ? 'active' : ''} onClick={() => chooseTheme(item.id)}><i style={{ background: item.color }} />{item.name}</button>)}
            </div>
            <div className="architect-energy">POWER <b data-testid="budget-indicator">{validation.budgetUsed}/{MAX_BUDGET}</b></div>
          </div>
          <PuzzleGrid grid={grid} interactive={!isSubmitted && !testSteps} onCellInteract={interact}
            paintDrag={tab === 'details'}
            onCellHover={(row, col) => setHover({ row, col })} ghostCells={ghostCells} ghostValid={!preview?.error}
            currentStep={activeStep} visitedSteps={testSteps?.slice(0, testIndex + 1) ?? []}
            plannedRoute={activeStep?.plannedRoute ?? []} theme={theme} stepDurationMs={480} />
          <div className="deck-status" data-testid="deck-status">
            <strong>VERTICAL TRANSIT</strong>
            <span>00 / MAIN COMPLEX</span>
            <span className={deckTopology.accessA ? 'online' : ''}>01 / AERIAL ANNEX {deckTopology.accessA ? 'CONNECTED' : 'OFFLINE'}</span>
            <span className={deckTopology.accessB ? 'online' : ''}>02 / SKY OBSERVATORY {deckTopology.accessB ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
          <div className="architect-actions">
            <div>
              <button className="architect-btn" aria-label="Undo" disabled={isSubmitted || !history.length} onClick={undo}><Undo2 size={14} /></button>
              <button className="architect-btn" aria-label="Redo" disabled={isSubmitted || !redoStack.length} onClick={redo}><Redo2 size={14} /></button>
              <button className="architect-btn" disabled={isSubmitted} onClick={() => { setTab('details'); setSelectedTool('EMPTY'); stopPreview(); }}><Eraser size={13} />Erase</button>
              <button className="architect-btn" disabled={isSubmitted} onClick={() => commit(createEmptyGrid())}><Trash2 size={13} />Clear</button>
              <button className="architect-btn" onClick={save}><Save size={13} />Save design</button>
            </div>
            <div>
              {testSteps && <button className="architect-btn" onClick={stopPreview}>Back to building</button>}
              <button className="architect-btn" disabled={!validation.valid} onClick={() => setHumanPlayOpen(true)}><Gamepad2 size={14} />Explore yourself</button>
              <button className="architect-btn" data-testid="test-room-btn" disabled={!validation.valid} onClick={simulate}>
                {testPlaying ? <Pause size={13} /> : <Play size={13} />}{testPlaying ? 'Pause scout' : 'Simulate AI'}
              </button>
            </div>
          </div>
          {(message || serverErrors.length > 0) && <p className="architect-message" role="status">{message || serverErrors.join(' ')}</p>}
          {activeStep && <div className="architect-status" role="status"><span>SCOUT 01 / STEP {testIndex}</span><small>{activeStep.decisionLog}</small></div>}
          {!activeStep && <div className={`architect-status ${validation.valid ? '' : 'invalid'}`} data-testid="validation-status-box">
            <span>{validation.valid ? <><CheckCircle2 size={13} className="inline mr-2" />ROOM VALID & SOLVABLE</> : validation.errors[0]}</span>
            <small>{validation.valid ? 'Extraction route confirmed. Ready for the scout.' : 'Keep designing — simulation unlocks when a route is possible.'}</small>
          </div>}
          <div className="architect-metrics">
            <div><span>Optimal route</span><strong>{validation.solverResult?.shortestPathLength ?? '—'}</strong><small>navigation steps</small></div>
            <div><span>Scout exploration</span><strong>{validation.agentResult?.totalSteps ?? '—'}</strong><small>with limited vision</small></div>
            <div><span>Adapted attempt</span><strong>{validation.adaptedAgentResult?.totalSteps ?? '—'}</strong><small>with trap memory</small></div>
            <div><span>Design score</span><strong data-testid="live-score-preview">{validation.scoreBreakdown?.totalScore ?? 0}</strong><small>out of 1,000</small></div>
          </div>
          <div className="architect-actions">
            <button className="architect-btn" onClick={onExit}>Leave studio</button>
            <div>
              {opponent && <span className="architect-energy self-center" data-testid="opponent-status-pill">{opponent.name}: {opponent.submitted ? 'LOCKED & SUBMITTED!' : `Building · ${opponent.budgetUsed}/30`}</span>}
              <button className="architect-btn architect-btn-primary" data-testid="submit-room-btn" disabled={!validation.valid || isSubmitted}
                onClick={() => { stopPreview(); onSubmitRoom(grid); }}>
                {isSubmitted ? 'Facility locked · waiting for opponent' : mode === 'PVP' ? 'Lock facility for battle' : 'Launch expedition'}<ArrowRight size={15} />
              </button>
            </div>
          </div>
        </main>
      </div>
      <HumanPlayModal open={humanPlayOpen} title="Explore your facility" grid={grid}
        aiOptimalMoves={validation.solverResult?.shortestPathLength ?? 0}
        aiFogMoves={validation.agentResult?.totalSteps ?? 0} onClose={() => setHumanPlayOpen(false)} />
    </div>
  );
};
