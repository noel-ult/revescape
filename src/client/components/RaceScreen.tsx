import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Flag, Trophy } from 'lucide-react';
import { MatchState } from '../../shared/types';
import { SECTORS } from '../../shared/sectors';
import { COOP_SECTORS } from '../../shared/coop';
import { AccessInventory } from './AccessInventory';
import { PuzzleGrid } from './PuzzleGrid';
import { humanViewStep } from '../../shared/movement';
import { soundFX } from '../lib/sound';
import { getSocket } from '../lib/socket';

export function RaceScreen({ match, playerToken, connected, onMove, onRematch, onExit }: {
  match: MatchState; playerToken: string; connected: boolean;
  onMove: (dr: number, dc: number) => void; onRematch: () => void; onExit: () => void;
}) {
  const me = match.players.find(player => player.token === playerToken);
  const coop = match.mode === 'COOP';
  const sectors = coop ? COOP_SECTORS : SECTORS;
  const opponent = match.players.find(player => player.id !== (me ?? match.players[0])?.id);
  const racer = me?.racer ?? match.players[0]?.racer;
  const [now, setNow] = useState(Date.now());
  const clock = useRef({ sample: 0, offset: 0 });
  if (match.serverTime && match.serverTime !== clock.current.sample) clock.current = { sample: match.serverTime, offset: match.serverTime - Date.now() };
  const serverNow = now + clock.current.offset;
  const [blocked, setBlocked] = useState('');
  const lastInput = useRef(0);
  const moveRef = useRef(onMove); moveRef.current = onMove;
  const active = match.phase === 'RACING' && Boolean(me) && connected && racer?.finishedAtMs === undefined && serverNow >= (match.raceStartedAt ?? Infinity) && serverNow >= (racer?.moveReadyAt ?? 0);
  const move = (dr: number, dc: number) => {
    const currentTime = Date.now() + clock.current.offset;
    if (match.phase !== 'RACING' || !me || !connected || racer?.finishedAtMs !== undefined || currentTime < (match.raceStartedAt ?? Infinity) || currentTime < (racer?.moveReadyAt ?? 0) || performance.now() - lastInput.current < 180) return;
    lastInput.current = performance.now(); setBlocked(''); moveRef.current(dr, dc);
  };
  const inputRef = useRef(move); inputRef.current = move;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    const blockedMessage = ({ message }: { message: string }) => setBlocked(message);
    const key = (event: KeyboardEvent) => {
      if (document.getElementById('root')?.inert) return;
      const deltas: Record<string, [number, number]> = { ArrowUp: [-1, 0], w: [-1, 0], ArrowDown: [1, 0], s: [1, 0], ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1] };
      const delta = deltas[event.key] ?? deltas[event.key.toLowerCase()];
      if (delta) { event.preventDefault(); inputRef.current(...delta); }
    };
    getSocket().on('race:blocked', blockedMessage); window.addEventListener('keydown', key);
    return () => { clearInterval(timer); window.removeEventListener('keydown', key); getSocket().off('race:blocked', blockedMessage); };
  }, []);
  useEffect(() => {
    if (!racer?.moves) return;
    if (racer.lastStep.event === 'COLLECT_KEY') soundFX.playKeyPickup();
    else if (racer.lastStep.event === 'PORTAL_WARP') soundFX.playSwitchToggle();
    else if (racer.lastStep.event === 'EXIT' || racer.lastStep.event === 'START') soundFX.playSuccess();
    else soundFX.playStep();
  }, [racer?.moves]);
  if (!racer) return <p role="status">Waiting for the race state…</p>;
  const sector = sectors.find(entry => entry.id === match.sectorIds?.[racer.stageIndex]) ?? sectors[0];
  const finished = match.phase === 'RESULTS';
  const jammed = (racer.empRemainingTurns ?? 0) > 0;
  const displayedStep = humanViewStep(sector.grid, racer);
  const rivalVisible = !jammed || ('visibleCells' in displayedStep && displayedStep.visibleCells.includes(`${opponent?.racer?.row},${opponent?.racer?.col}`));
  const countdown = Math.max(0, Math.ceil(((match.raceStartedAt ?? 0) - serverNow) / 1000));
  const elapsed = Math.max(0, (finished ? coop ? Math.max(...match.players.map(p => p.racer?.finishedAtMs ?? 0)) : match.players.find(player => player.id === match.winnerId)?.racer?.finishedAtMs ?? 0 : serverNow - (match.raceStartedAt ?? serverNow)) / 1000);
  return <div className="race-page">
    <div className="sector-page-heading"><div><span className="architect-eyebrow">{coop ? 'Co-op expedition' : 'Live escape race'} / room {match.roomCode} / round {match.roundNumber}</span><h1 data-testid="race-heading">{finished ? coop ? 'Expedition complete — team wins!' : `${match.players.find(p => p.id === match.winnerId)?.name ?? 'Race'} wins!` : sector.name}</h1><p>{sector.objective}</p></div><div className="race-clock">{elapsed.toFixed(1)}<small>SECONDS</small></div></div>
    <div className="race-layout"><main>
      <PuzzleGrid grid={sector.grid} initialCamera="follow" followLabel="Follow you" currentStep={displayedStep} viewMode={jammed ? 'AI_FOG' : 'WORLD'} theme={sector.theme} stepDurationMs={150}
        opponentStep={rivalVisible && opponent?.racer?.stageIndex === racer.stageIndex ? opponent.racer.lastStep : null} />
      <div className="race-controls">
        <div><button aria-label="Move up" disabled={!active} onClick={() => move(-1, 0)}><ArrowUp size={20} /></button><div><button aria-label="Move left" disabled={!active} onClick={() => move(0, -1)}><ArrowLeft size={20} /></button><button aria-label="Move down" disabled={!active} onClick={() => move(1, 0)}><ArrowDown size={20} /></button><button aria-label="Move right" disabled={!active} onClick={() => move(0, 1)}><ArrowRight size={20} /></button></div></div>
        <p role="status">{!connected ? 'Connection lost. Reconnecting…' : finished ? coop ? 'Team extraction complete. Play another round or return home.' : 'Race complete. Play another round or return home.' : countdown ? `Race starts in ${countdown}…` : coop && racer.finishedAtMs !== undefined ? 'Extracted — waiting for your teammate to reach the checkpoint.' : blocked || (jammed ? `Sensors jammed: ${racer.empRemainingTurns} moves remaining.` : racer.lastStep.description)}<small className="block mt-2 text-slate-400">WASD, arrows, or touch controls · Cyan is you; amber is your {coop ? 'teammate' : 'rival'}.</small></p>
      </div>
    </main><aside className="architect-panel race-scoreboard">
      <h2><Flag size={18} />{coop ? 'Team expedition' : 'Race to orbital command'}</h2>
      {match.players.map(player => <div className={`race-player ${player.token === playerToken ? 'you' : ''}`} key={player.id} data-testid={`race-player-${player.id}`}>
        <strong>{player.name} {player.token === playerToken ? '(YOU)' : ''}<span>{player.connected ? 'LIVE' : 'RECONNECTING'}</span></strong>
        <p>Sector {(player.racer?.stageIndex ?? 0) + 1}/{match.sectorIds?.length ?? sectors.length} · <span data-testid={`race-moves-${player.id}`}>{player.racer?.moves ?? 0}</span> moves{coop && player.racer?.finishedAtMs !== undefined ? ' · EXTRACTED' : ''}</p>
        <div className="race-progress">{sectors.map((entry, index) => <i key={entry.id} title={entry.name} className={index <= (player.racer?.stageIndex ?? 0) ? 'reached' : ''} />)}</div>
      </div>)}
      <AccessInventory keyMask={racer.keyMask} switchMask={racer.switchMask} empTurns={racer.empRemainingTurns} />
      <ol className="race-route">{sectors.map((entry, index) => <li key={entry.id} className={index === racer.stageIndex ? 'current' : index < racer.stageIndex ? 'passed' : ''}><span>{index + 1}</span>{entry.name}</li>)}</ol>
      <p className="sector-detail-note">{coop ? 'Access cores are shared. Stand on the switch to hold the gate open. Both players must extract to advance; disconnected teammates can reconnect using the invite.' : 'Every exit is a checkpoint. The server verifies each move, keys and lift crossings. The first player through all eight sectors wins.'}</p>
      {finished && me && <button className="architect-btn architect-btn-primary" data-testid="race-rematch-btn" onClick={onRematch}><Trophy size={15} />{coop ? 'Play co-op again' : 'Race again'}</button>}
      <button className="architect-btn" onClick={onExit}>{coop ? 'Leave expedition' : 'Leave race'}</button>
    </aside></div>
  </div>;
}
