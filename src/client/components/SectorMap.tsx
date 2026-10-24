import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lock, MapPin } from 'lucide-react';
import {
  EXPEDITION_SECTORS, EXPEDITION_STORAGE_KEY, ExpeditionProgress,
  isExpeditionUnlocked, restoreExpeditionProgress,
} from '../../shared/expedition';
import { Grid } from '../../shared/types';
import { solveBoardBFS } from '../../shared/solver';
import { runAutonomousAgent } from '../../shared/agent';
import { PuzzleGrid } from './PuzzleGrid';
import { HumanPlayModal } from './HumanPlayModal';

function loadProgress(): ExpeditionProgress {
  try { return restoreExpeditionProgress(JSON.parse(localStorage.getItem(EXPEDITION_STORAGE_KEY) ?? 'null')); }
  catch { return restoreExpeditionProgress(null); }
}

export function SectorMap({ onExit, onOpenStudio }: { onExit: () => void; onOpenStudio: (grid: Grid) => void }) {
  const [progress, setProgress] = useState(loadProgress);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const { completed, bestMoves } = progress;
  const selected = EXPEDITION_SECTORS.findIndex(entry => entry.id === progress.selectedSectorId);
  const sector = EXPEDITION_SECTORS[selected];
  const nextSector = EXPEDITION_SECTORS[selected + 1];
  const unlocked = (index: number) => isExpeditionUnlocked(completed, index);
  const metrics = useMemo(() => ({ optimal: solveBoardBFS(sector.grid).shortestPathLength, fog: runAutonomousAgent(sector.grid).totalSteps }), [sector]);

  useEffect(() => {
    try { localStorage.setItem(EXPEDITION_STORAGE_KEY, JSON.stringify(progress)); }
    catch { setMessage('Progress is available for this session. Browser storage is unavailable.'); }
  }, [progress]);

  const select = (id: string) => {
    const index = EXPEDITION_SECTORS.findIndex(entry => entry.id === id);
    if (index < 0) return;
    if (!unlocked(index)) { setMessage(`Complete ${EXPEDITION_SECTORS[index - 1].name} to unlock this platform.`); return; }
    setProgress(previous => ({ ...previous, selectedSectorId: id }));
    setMessage('');
  };
  const complete = (moves: number) => {
    setProgress(previous => ({
      ...previous,
      completed: Array.from(new Set([...previous.completed, sector.id])),
      bestMoves: { ...previous.bestMoves, [sector.id]: Math.min(previous.bestMoves[sector.id] ?? Infinity, moves) },
    }));
  };
  const continueToNext = () => {
    if (!nextSector || !unlocked(selected + 1)) return;
    select(nextSector.id);
    setPlaying(true);
  };

  return <div className="sector-page">
    <div className="sector-page-heading">
      <div><span className="architect-eyebrow">Solo expedition / {completed.length} of {EXPEDITION_SECTORS.length} complete</span><h1>Every platform is a destination.</h1><p>Eight dedicated solo levels, from the docking perimeter to blackout command. Escape each sector to unlock the next; your progress and best move counts stay on this device.</p></div>
      <button className="architect-btn" onClick={onExit}><ArrowLeft size={15} />Home</button>
    </div>
    <div className="sector-layout">
      <section className="sector-map-scene" aria-label="Interactive orbital sector map">
        <PuzzleGrid grid={sector.grid} sectorMap sectors={EXPEDITION_SECTORS} theme={sector.theme} selectedSectorId={sector.id} completedSectors={completed} onSectorSelect={select} />
        <p>Each platform previews its own level. Click a platform or choose a sector below. Use Plan for an overhead view.</p>
      </section>
      <aside className="architect-panel sector-detail">
        <span className="architect-eyebrow">Sector {String(selected + 1).padStart(2, '0')} / {sector.difficulty}</span>
        <h2>{sector.name}</h2><p>{sector.objective}</p>
        <div className="sector-detail-metrics"><span><small>OPTIMAL ROUTE</small>{metrics.optimal} moves</span><span><small>SCOUT BENCHMARK</small>{metrics.fog} moves</span></div>
        <button className="architect-btn architect-btn-primary" data-testid="enter-sector-btn" onClick={() => setPlaying(true)}>{completed.includes(sector.id) ? 'Replay sector' : 'Enter level'}<ArrowRight size={16} /></button>
        <button className="architect-btn" onClick={() => onOpenStudio(sector.grid)}>Remix in architect studio</button>
        <p className="sector-detail-note"><strong>{sector.mechanic}.</strong> {sector.hint}</p>
        {completed.includes(sector.id) && <p className="sector-complete"><Check size={16} />{bestMoves[sector.id] ? `Best: ${bestMoves[sector.id]} moves` : 'Sector complete'}{nextSector ? ' · next platform unlocked' : ' · expedition complete'}</p>}
      </aside>
    </div>
    {message && <p className="architect-message" role="status">{message}</p>}
    <div className="sector-list" aria-label="Solo expedition levels">
      {EXPEDITION_SECTORS.map((entry, index) => <button key={entry.id} data-testid={`sector-${entry.id}`} aria-pressed={selected === index} aria-disabled={!unlocked(index)} disabled={!unlocked(index)} className={`sector-card ${selected === index ? 'selected' : ''} ${unlocked(index) ? '' : 'locked'}`} onClick={() => select(entry.id)} style={{ '--sector-color': entry.color } as React.CSSProperties}>
        <span className="sector-card-index">{String(index + 1).padStart(2, '0')}{completed.includes(entry.id) ? <Check size={17} /> : unlocked(index) ? <MapPin size={17} /> : <Lock size={16} />}</span>
        <strong>{entry.name}</strong><small>{entry.mechanic}</small><span>{completed.includes(entry.id) ? `COMPLETED${bestMoves[entry.id] ? ` · BEST ${bestMoves[entry.id]} MOVES` : ''}` : unlocked(index) ? 'READY TO EXPLORE' : 'COMPLETE PREVIOUS SECTOR'}</span>
      </button>)}
    </div>
    <HumanPlayModal key={sector.id} open={playing} title={sector.name} grid={sector.grid} theme={sector.theme} sectors={EXPEDITION_SECTORS}
      aiOptimalMoves={metrics.optimal} aiFogMoves={metrics.fog} onEscape={complete} onClose={() => setPlaying(false)}
      expedition={{ stage: selected + 1, total: EXPEDITION_SECTORS.length, nextLevelName: nextSector?.name, onNextLevel: nextSector ? continueToNext : undefined }} />
  </div>;
}
