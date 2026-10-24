import React, { useState } from 'react';
import { Cpu, HelpCircle, Home, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { soundFX } from '../lib/sound';

interface NavbarProps {
  connected: boolean;
  roomCode?: string;
  onGoHome: () => void;
  onOpenHelp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  connected,
  roomCode,
  onGoHome,
  onOpenHelp,
}) => {
  const [muted, setMuted] = useState(soundFX.isMuted());

  const handleToggleMute = () => {
    const next = soundFX.toggleMute();
    setMuted(next);
  };

  return (
    <header className="w-full border-b border-cyan-500/20 bg-[#070a18]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 group text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-neon-cyan">
            <Cpu className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-display font-extrabold text-sm sm:text-base tracking-wider text-white group-hover:text-cyan-300 transition-colors">
              REVERSE ESCAPE
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/80">
              MIND WARS / FACILITY ARCHITECT
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          {roomCode && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-400/40 text-xs font-mono text-purple-200">
              <span className="text-purple-400">ROOM:</span>
              <span className="font-bold tracking-wider">{roomCode}</span>
            </div>
          )}

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
              connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{connected ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          <button
            type="button"
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 text-xs font-medium text-slate-200 transition"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">How to Play</span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label="Toggle Sound"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 text-slate-200 transition"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          <button
            type="button"
            onClick={onGoHome}
            aria-label="Home"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 text-slate-200 transition"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
