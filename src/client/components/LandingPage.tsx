import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Box, Users } from 'lucide-react';
import { SHOWCASE_FACILITY } from '../../shared/facility';
import { runAutonomousAgent } from '../../shared/agent';
import { PuzzleGrid } from './PuzzleGrid';

interface LandingPageProps {
  playerName: string;
  onChangePlayerName: (name: string) => void;
  onCreateLobby: (duration: 45 | 90, mode?: 'ARCHITECT' | 'RACE') => void;
  onOpenSectors: () => void;
  connected: boolean;
  pending?: boolean;
  onJoinLobby: (roomCode: string) => void;
  onStartSolo: () => void;
  onOpenHelp: () => void;
  errorMessage?: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  playerName, onChangePlayerName, onCreateLobby, onJoinLobby, onStartSolo, onOpenHelp, onOpenSectors, connected, pending, errorMessage,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'ARCHITECT' | 'RACE'>('ARCHITECT');
  const [duration, setDuration] = useState<45 | 90>(90);
  const demonstration = useMemo(() => runAutonomousAgent(SHOWCASE_FACILITY), []);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setFrame(value => (value + 1) % (demonstration.steps.length + 6));
    }, 650);
    return () => clearInterval(timer);
  }, [demonstration]);
  const step = demonstration.steps[Math.min(frame, demonstration.steps.length - 1)];
  return (
    <div className="facility-home">
      <div className="facility-home-hero">
        <div className="facility-home-copy">
          <span className="architect-eyebrow">Make room for play / Devin Hacks Kochi 2026</span>
          <h1>REVERSE<br />ESCAPE<span>MIND WARS</span></h1>
          <h2>You build the world.<br />The AI finds a way.</h2>
          <p>Design a multi-level sci-fi facility. Connect raised platforms, shape impossible-looking routes, and follow a deterministic A* exploration agent as it learns your creation. No LLM is used for its decisions.</p>
          <button className="architect-btn architect-btn-primary" data-testid="solo-challenge-btn" onClick={onStartSolo}>Enter architect studio <ArrowRight size={17} /></button>
          <button className="architect-btn" data-testid="sector-map-btn" onClick={onOpenSectors}>Explore the orbital levels <ArrowRight size={16} /></button>
          <button className="facility-home-help" onClick={onOpenHelp}>How it works ↗</button>
          <div className="facility-home-pills"><span>3D CONSTRUCTION</span><span>ADAPTIVE SCOUT</span><span>ONLINE PvP</span></div>
        </div>
        <div className="facility-home-scene">
          <PuzzleGrid grid={SHOWCASE_FACILITY} currentStep={step} stepDurationMs={600} />
          <p>Live scout simulation · Drag to explore the facility</p>
        </div>
      </div>
      <div className="facility-home-bottom">
        <div className="architect-panel facility-home-mission">
          <Box size={22} />
          <div><h3>Architecture becomes the puzzle.</h3><p>Build security wings, portal chambers, and cryo labs. Every layout must have a way out. The challenge is how much the scout has to discover.</p></div>
        </div>
        <div className="architect-panel facility-home-multiplayer">
          <div className="facility-home-match-title"><Users size={18} /><h3>Play with a friend</h3><span>REAL-TIME / 1v1</span></div>
          <div className="multiplayer-mode" role="group" aria-label="Multiplayer mode">
            <button aria-pressed={mode === 'ARCHITECT'} onClick={() => setMode('ARCHITECT')}>Architect duel<small>Build rooms. Challenge the AI.</small></button>
            <button data-testid="race-mode-btn" aria-pressed={mode === 'RACE'} onClick={() => setMode('RACE')}>Live escape race<small>Two players. Eight orbital levels.</small></button>
          </div>
          <div className="facility-home-match-form">
            <label>Architect callsign<input aria-label="Architect callsign" data-testid="player-name-input" value={playerName} onChange={e => onChangePlayerName(e.target.value)} maxLength={20} /></label>
            <label>Build time<select aria-label="Build time" value={duration} onChange={e => setDuration(Number(e.target.value) as 45 | 90)}><option value={45}>45s · Quick demo</option><option value={90}>90s · Standard</option></select></label>
            <button className="architect-btn architect-btn-primary" data-testid="create-lobby-btn" disabled={!connected || pending} onClick={() => onCreateLobby(duration, mode)}>{pending ? 'Opening lobby…' : connected ? 'Create lobby' : 'Connecting…'} <ArrowRight size={14} /></button>
          </div>
          <form noValidate onSubmit={e => { e.preventDefault(); if (joinCode.trim()) onJoinLobby(joinCode.trim().toUpperCase()); }} className="facility-home-join">
            <input aria-label="Invite code" data-testid="join-code-input" placeholder="Have an invite code?" value={joinCode} maxLength={6} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
            <button className="architect-btn" data-testid="join-lobby-btn" disabled={!connected || pending} type="submit">Join facility <ArrowRight size={13} /></button>
          </form>
          {errorMessage && <p role="alert" data-testid="landing-error" className="architect-message">{errorMessage}</p>}
        </div>
      </div>
    </div>
  );
};
