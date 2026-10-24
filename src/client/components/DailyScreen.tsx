import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import { dailyChallenge } from '../../shared/challenges';
import { HumanState, humanViewStep } from '../../shared/movement';
import { PuzzleGrid } from './PuzzleGrid';
import { AccessInventory } from './AccessInventory';

type Ranking = { name: string; moves: number; completedAt: number };
type Daily = ReturnType<typeof dailyChallenge> & { leaderboard: Ranking[]; resetsAt: number };
type Run = { runToken: string; name: string; state: HumanState; escaped: boolean; date: string; leaderboard?: Ranking[]; rankingSaved?: boolean };
export function DailyScreen({ playerName, playerToken, onChangeName, onExit }: { playerName: string; playerToken: string; onChangeName: (name: string) => void; onExit: () => void }) {
  const [daily, setDaily] = useState<Daily>();
  const [run, setRun] = useState<Run>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const abort = useRef(new AbortController());
  const request = useCallback(async (url: string, body?: unknown) => {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([abort.current.signal, AbortSignal.timeout(10000)]) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Daily challenge unavailable. Please try again.');
    return result;
  }, []);
  const load = useCallback(async () => {
    const controller = abort.current;
    setPending(true);
    try { setDaily(await request('/api/daily')); setMessage(''); }
    catch (error) { if (!controller.signal.aborted) setMessage((error as Error).message); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }, [request]);
  useEffect(() => { abort.current = new AbortController(); void load(); return () => abort.current.abort(); }, [load]);
  const start = async (restart = false) => {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try { const result: Run = await request('/api/daily/start', { playerToken, name: playerName.trim() || 'Architect', restart });
      if (daily && result.date !== daily.date) setDaily(await request('/api/daily'));
      setRun(result); setMessage(result.escaped ? 'This run is complete. Retry to improve your verified score.' : 'Run started. The server verifies every move.'); }
    catch (error) { if (!abort.current.signal.aborted) setMessage((error as Error).message); }
    finally { busy.current = false; if (!abort.current.signal.aborted) setPending(false); }
  };
  const move = async (dr: number, dc: number) => {
    if (!run || run.escaped || busy.current) return;
    busy.current = true; setPending(true);
    try {
      const next: Run = await request('/api/daily/move', { runToken: run.runToken, dr, dc });
      setRun(next); if (next.leaderboard) setDaily(previous => previous ? { ...previous, leaderboard: next.leaderboard! } : previous);
      setMessage(next.escaped ? next.rankingSaved ? 'Daily extraction complete — your verified score is saved.' : 'Extraction complete. Rankings could not be saved; please retry later.' : next.state.lastStep.description);
    } catch (error) { if (!abort.current.signal.aborted) setMessage((error as Error).message); }
    finally { busy.current = false; if (!abort.current.signal.aborted) setPending(false); }
  };
  const moveRef = useRef(move); moveRef.current = move;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.getElementById('root')?.inert) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      const deltas: Record<string, [number, number]> = { ArrowUp: [-1, 0], w: [-1, 0], ArrowDown: [1, 0], s: [1, 0], ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1] };
      const delta = deltas[event.key] ?? deltas[event.key.toLowerCase()];
      if (delta) { event.preventDefault(); void moveRef.current(...delta); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  return <div className="sector-page daily-page">
    <div className="sector-page-heading"><div><span className="architect-eyebrow">Daily challenge / {daily?.date ?? 'Loading…'} / UTC</span><h1>One station. Everyone’s challenge.</h1><p>A seeded, validated room shared by all players today. Rankings use server-verified moves, with one best score per browser identity.</p></div><button className="architect-btn" onClick={onExit}>Home</button></div>
    {daily ? <div className="sector-layout"><main><PuzzleGrid grid={daily.grid} roomLabel={`Daily ${daily.date}`} theme={daily.theme} currentStep={run ? humanViewStep(daily.grid, run.state) : null} viewMode={(run?.state.empRemainingTurns ?? 0) > 0 ? 'AI_FOG' : 'WORLD'} followLabel="Follow you" />
      <div className="daily-controls"><div className="daily-dpad">{[{ label: 'Move up', dr: -1, dc: 0, icon: ArrowUp }, { label: 'Move left', dr: 0, dc: -1, icon: ArrowLeft }, { label: 'Move down', dr: 1, dc: 0, icon: ArrowDown }, { label: 'Move right', dr: 0, dc: 1, icon: ArrowRight }].map(({ label, dr, dc, icon: Icon }) => <button key={label} className="architect-btn" aria-label={label} disabled={!run || run.escaped || pending} onClick={() => void move(dr, dc)}><Icon size={19} /></button>)}</div><p role="status">{message || 'Start a run, then use WASD, arrows or the movement buttons.'}</p></div>
    </main><aside className="architect-panel sector-detail"><h2>Today’s extraction</h2><p>{daily.optimalMoves} optimal · {daily.scoutMoves} scout moves</p><p data-testid="daily-moves">Your moves: {run?.state.moves ?? 0}</p>
      <label className="daily-name">Your callsign<input aria-label="Daily callsign" maxLength={20} value={run && !run.escaped ? run.name ?? playerName : playerName} onChange={e => onChangeName(e.target.value)} disabled={!!run && !run.escaped} /></label>
      <button className="architect-btn architect-btn-primary" data-testid="daily-start-btn" disabled={pending} onClick={() => void start(!!run)}>{pending ? 'Contacting station…' : run ? 'Restart daily run' : 'Start / resume daily run'}<RotateCcw size={14} /></button>
      <AccessInventory keyMask={run?.state.keyMask ?? 0} switchMask={run?.state.switchMask ?? 0} empTurns={run?.state.empRemainingTurns} />
      <h3>Fewest moves today</h3><ol className="daily-rankings" data-testid="daily-rankings">{daily.leaderboard.map((row, index) => <li key={`${row.completedAt}-${index}`}><span>{index + 1}. {row.name}</span><strong>{row.moves}</strong></li>)}</ol>{daily.leaderboard.length === 0 && <p>No verified escapes yet. Be the first.</p>}<p className="sector-detail-note">Resets at 00:00 UTC. Names are player-provided; positions, pickups and scores are checked by the server.</p>
    </aside></div> : <div className="architect-panel sector-detail"><p role="status">{message || 'Loading today’s room…'}</p><button className="architect-btn" disabled={pending} onClick={() => void load()}>Retry loading</button></div>}
    {daily && message.includes('expired') && <button className="architect-btn" onClick={() => { setRun(undefined); void load(); }}>Load today’s new challenge</button>}
  </div>;
}
