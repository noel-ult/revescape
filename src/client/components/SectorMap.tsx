import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lock, MapPin } from 'lucide-react';
import { SECTORS } from '../../shared/sectors';
import { solveBoardBFS } from '../../shared/solver';
import { runAutonomousAgent } from '../../shared/agent';
import { PuzzleGrid } from './PuzzleGrid';
import { HumanPlayModal } from './HumanPlayModal';

const STORAGE_KEY = 'reverse-escape-expedition-v1';
export function SectorMap({ onExit, onOpenStudio }: { onExit: () => void; onOpenStudio: (index: number) => void }) {
  const [completed, setCompleted] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(id => SECTORS.some(sector => sector.id === id)) : []; } catch { return []; }
  });
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const sector = SECTORS[selected];
  const unlocked = (index: number) => index === 0 || completed.includes(SECTORS[index - 1].id);
  const metrics = useMemo(() => ({ optimal: solveBoardBFS(sector.grid).shortestPathLength, fog: runAutonomousAgent(sector.grid).totalSteps }), [sector]);
  const select = (id: string) => {
    const index = SECTORS.findIndex(entry => entry.id === id);
    if (index < 0) return;
    if (!unlocked(index)) { setMessage(`Complete ${SECTORS[index - 1].name} to unlock this platform.`); return; }
    setSelected(index); setMessage('');
  };
  const complete = () => {
    const next = Array.from(new Set([...completed, sector.id]));
    setCompleted(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { setMessage('Completed for this session. Browser storage is unavailable.'); }
  };
  return <div className="sector-page">
    <div className="sector-page-heading"><div><span className="architect-eyebrow">Orbital expedition / {completed.length} of {SECTORS.length} complete</span><h1>Every platform is a destination.</h1><p>Escape a sector to unlock the next. Your completed levels stay on this device.</p></div><button className="architect-btn" onClick={onExit}><ArrowLeft size={15} />Home</button></div>
    <div className="sector-layout">
      <section className="sector-map-scene" aria-label="Interactive orbital sector map">
        <PuzzleGrid grid={sector.grid} sectorMap selectedSectorId={sector.id} completedSectors={completed} onSectorSelect={select} />
        <p>Click an orbital platform or choose a level below. Right-drag to orbit; use Plan for an overhead view.</p>
      </section>
      <aside className="architect-panel sector-detail">
        <span className="architect-eyebrow">Sector {String(selected + 1).padStart(2, '0')} / {sector.mechanic}</span>
        <h2>{sector.name}</h2><p>{sector.objective}</p>
        <div className="sector-detail-metrics"><span><small>BFS BASELINE</small>{metrics.optimal} moves</span><span><small>SCOUT EXPLORATION</small>{metrics.fog} moves</span></div>
        <button className="architect-btn architect-btn-primary" data-testid="enter-sector-btn" onClick={() => setPlaying(true)}>Enter level <ArrowRight size={16} /></button>
        <button className="architect-btn" onClick={() => onOpenStudio(selected)}>Remix in architect studio</button>
        <p className="sector-detail-note">A* explores with limited knowledge. BFS validates the full room. Race through all eight with a friend using Live escape race on the home screen.</p>
        {completed.includes(sector.id) && <p className="sector-complete"><Check size={16} />Sector complete{selected < SECTORS.length - 1 ? ' · next platform unlocked' : ' · expedition complete'}</p>}
      </aside>
    </div>
    {message && <p className="architect-message" role="status">{message}</p>}
    <div className="sector-list" aria-label="Orbital levels">
      {SECTORS.map((entry, index) => <button key={entry.id} data-testid={`sector-${entry.id}`} aria-pressed={selected === index} aria-disabled={!unlocked(index)} disabled={!unlocked(index)} className={`sector-card ${selected === index ? 'selected' : ''} ${unlocked(index) ? '' : 'locked'}`} onClick={() => select(entry.id)} style={{ '--sector-color': entry.color } as React.CSSProperties}>
        <span className="sector-card-index">{String(index + 1).padStart(2, '0')}{completed.includes(entry.id) ? <Check size={17} /> : unlocked(index) ? <MapPin size={17} /> : <Lock size={16} />}</span>
        <strong>{entry.name}</strong><small>{entry.mechanic}</small><span>{completed.includes(entry.id) ? 'COMPLETED' : unlocked(index) ? 'READY TO EXPLORE' : 'COMPLETE PREVIOUS SECTOR'}</span>
      </button>)}
    </div>
    <HumanPlayModal open={playing} title={sector.name} grid={sector.grid} aiOptimalMoves={metrics.optimal} aiFogMoves={metrics.fog} onEscape={complete} onClose={() => setPlaying(false)} />
  </div>;
}
