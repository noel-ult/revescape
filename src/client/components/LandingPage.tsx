import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Box, Users, Flag, Layers, BrainCircuit, Radio, Compass, Swords } from 'lucide-react';
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
          <span className="home-event"><span />MAKE ROOM FOR PLAY · KOCHI 2026</span>
          <h1>REVERSE<br /><em>ESCAPE</em><span>MIND WARS</span></h1>
          <h2>You build the world.<br />The AI finds a way.</h2>
          <p>Build a multi-level facility. Outsmart a searching AI. Or race a friend across eight orbital sectors.</p>
          <div className="home-hero-actions">
            <button className="architect-btn architect-btn-primary" data-testid="sector-map-btn" onClick={onOpenSectors}><Compass size={18} />Explore levels <ArrowUpRight size={18} /></button>
            <button className="architect-btn" data-testid="solo-challenge-btn" onClick={onStartSolo}>Architect studio <ArrowRight size={17} /></button>
          </div>
          <button className="facility-home-help" onClick={onOpenHelp}>New to Mind Wars? <span>See how it works ↗</span></button>
        </div>
        <div className="facility-home-scene">
          <PuzzleGrid grid={SHOWCASE_FACILITY} currentStep={step} stepDurationMs={600} />
          <div className="home-scene-caption"><span><Radio size={12} />REAL SIMULATION. REAL DECISIONS.</span><span>Baseline scout / Frontier + A*</span></div>
        </div>
      </div>
      <div className="home-feature-rail">
        <div><span className="home-feature-icon"><Layers size={21} /></span><span><strong>Eight worlds to escape.</strong><small>Unlock a new sector at every extraction.</small></span></div>
        <div><span className="home-feature-icon orange"><Swords size={21} /></span><span><strong>Your friend. Your rival.</strong><small>Race live or build the better trap.</small></span></div>
        <div><span className="home-feature-icon blue"><BrainCircuit size={21} /></span><span><strong>Outthink the scout.</strong><small>A deterministic AI with memory and replanning.</small></span></div>
      </div>
      <section className="facility-home-multiplayer" aria-label="Multiplayer lobby setup">
        <div className="home-multiplayer-intro"><span className="home-section-icon"><Users size={23} /></span><div><h3>Better with a rival.</h3><p>Create a private room. Share the code. Make your move.</p></div><span className="home-live-label"><i />LIVE MULTIPLAYER</span></div>
        <div className="home-lobby-layout">
          <div className="multiplayer-mode" role="group" aria-label="Multiplayer mode">
            <button aria-pressed={mode === 'ARCHITECT'} onClick={() => setMode('ARCHITECT')}><span className="mode-symbol"><Box size={23} /></span><span><strong>Architect duel</strong><small>Build rooms. Challenge the AI.</small></span><i /></button>
            <button data-testid="race-mode-btn" aria-pressed={mode === 'RACE'} onClick={() => setMode('RACE')}><span className="mode-symbol"><Flag size={23} /></span><span><strong>Live escape race</strong><small>Two players. Eight orbital levels.</small></span><i /></button>
          </div>
          <div className="home-lobby-fields">
            <div className="facility-home-match-form">
              <label>Architect callsign<input aria-label="Architect callsign" data-testid="player-name-input" value={playerName} onChange={e => onChangePlayerName(e.target.value)} maxLength={20} /></label>
              {mode === 'ARCHITECT' && <label className="home-time-field">Build time<select aria-label="Build time" value={duration} onChange={e => setDuration(Number(e.target.value) as 45 | 90)}><option value={45}>45s · Quick demo</option><option value={90}>90s · Standard</option></select></label>}
              <button className="architect-btn architect-btn-primary" data-testid="create-lobby-btn" disabled={!connected || pending} onClick={() => onCreateLobby(duration, mode)}>{pending ? 'Opening lobby…' : connected ? 'Create lobby' : 'Connecting…'}<ArrowRight size={16} /></button>
            </div>
            <div className="home-join-divider"><span>Already have an invite?</span></div>
            <form noValidate onSubmit={e => { e.preventDefault(); if (joinCode.trim()) onJoinLobby(joinCode.trim().toUpperCase()); }} className="facility-home-join">
              <input aria-label="Invite code" data-testid="join-code-input" placeholder="Enter 6-character room code" autoComplete="off" value={joinCode} maxLength={6} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
              <button className="architect-btn" data-testid="join-lobby-btn" disabled={!connected || pending} type="submit">Join facility<ArrowUpRight size={16} /></button>
            </form>
            {errorMessage && <p role="alert" data-testid="landing-error" className="architect-message">{errorMessage}</p>}
          </div>
        </div>
      </section>
      <footer className="home-footer"><span>REVERSE ESCAPE / MIND WARS</span><span>Built for play. Designed to make you think.</span><button onClick={onOpenHelp}>Game guide<ArrowUpRight size={12} /></button></footer>
    </div>
  );
};
