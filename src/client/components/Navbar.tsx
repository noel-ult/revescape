import React, { useState } from 'react';
import { Cpu, HelpCircle, Home, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { soundFX } from '../lib/sound';

interface NavbarProps {
  connected: boolean;
  roomCode?: string;
  onGoHome: () => void;
  onOpenHelp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ connected, roomCode, onGoHome, onOpenHelp }) => {
  const [muted, setMuted] = useState(soundFX.isMuted());
  const toggleMute = () => setMuted(soundFX.toggleMute());
  return <header className="game-nav">
    <div className="game-nav-inner">
      <button type="button" className="game-brand" onClick={onGoHome} aria-label="Reverse Escape home">
        <span className="game-brand-mark"><Cpu size={23} strokeWidth={1.8} /></span>
        <span><strong>REVERSE ESCAPE</strong><small>MIND WARS</small></span>
      </button>
      <div className="game-nav-actions">
        {roomCode && <span className="game-room-tag"><span>ROOM</span>{roomCode}</span>}
        <span className={`game-connection ${connected ? 'online' : ''}`} role="status" aria-label={connected ? 'Connected to multiplayer' : 'Multiplayer offline'}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{connected ? 'Online' : 'Offline'}</span>
        </span>
        <button className="game-nav-guide" type="button" onClick={onOpenHelp} aria-label="How to play"><HelpCircle size={17} /><span>How to play</span></button>
        <button className="game-nav-icon" type="button" aria-label="Toggle Sound" aria-pressed={!muted} title={muted ? 'Turn sound on' : 'Mute sound'} onClick={toggleMute}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
        <button className="game-nav-icon" type="button" aria-label="Home" title="Main menu" onClick={onGoHome}><Home size={17} /></button>
      </div>
    </div>
  </header>;
};
