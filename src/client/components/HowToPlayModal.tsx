import React from 'react';
import { Bot, CheckCircle2, KeyRound, Lock, Power, Shield, Trophy, X } from 'lucide-react';

interface HowToPlayModalProps {
  open: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="cyber-card max-w-3xl w-full rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto border border-cyan-400/40">
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-4 mb-6">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              HOW TO PLAY — REVERSE ESCAPE: MIND WARS
            </h2>
            <p className="text-xs font-mono text-cyan-300 mt-1">
              You Build the Trap. The AI Learns to Escape.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 text-sm text-slate-200">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/25">
              <div className="flex items-center gap-2 font-display font-bold text-cyan-300 mb-2">
                <Shield className="w-4 h-4" /> 1. BUILD A FACILITY
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Place and rotate room modules with your <strong>30-energy budget</strong>. Connect the eastern aerial annex or western sky observatory using matching lifts on the main floor. Each raised deck has four playable sectors; only its lift bridge connects it to the base.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/90 border border-purple-500/25">
              <div className="flex items-center gap-2 font-display font-bold text-purple-300 mb-2">
                <CheckCircle2 className="w-4 h-4" /> 2. KEEP IT SOLVABLE
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Every valid room <strong>must have at least one solution</strong> from Spawn (0,0) to Exit (7,7). Impossible rooms are rejected!
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/25">
              <div className="flex items-center gap-2 font-display font-bold text-emerald-300 mb-2">
                <Bot className="w-4 h-4" /> 3. STUMP THE AI
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                The scout is a <strong>deterministic, search-based AI</strong>—not a trained model or an LLM. It explores nearby sectors, chooses frontiers, and plans through known cells using A*. Elevation and hazards change its route cost. A separate full-map BFS validator checks solvability.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700">
            <h3 className="font-display font-bold text-white mb-3 text-sm uppercase tracking-wider">
              Studio controls
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">Click the floor to place a module. Right-drag to orbit, scroll to zoom, or use two fingers on touch. Plan gives an overhead view. Green previews fit; red previews need a different location. Undo and redo treat a complete module as one action. Explore yourself uses WASD, arrow keys, or the on-screen controls.</p>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">To unlock a raised platform, place its lift on an empty <strong>main-deck sector beside it</strong>. The eastern aerial annex is at sectors (1–2, 5–6); the western sky observatory is at (5–6, 1–2). Platforms can hold keys, doors, traps, and other hardware. Invalid lifts and impossible routes cannot be submitted.</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <KeyRound className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Colored Keys (Cost 2):</span> Collected automatically when the AI steps onto their tile.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Locked Doors (Cost 2):</span> Passable only after the AI has collected the matching colored key.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Power className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Pulse Switch (Cost 3):</span> Toggles the phase state (0 ↔ 1) every time the AI steps on it.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Open & Closed Gates (Cost 2):</span> Closed Gates require Switch ON (1); Open Gates require Switch OFF (0).
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-purple-950/60 border border-cyan-500/30">
            <h3 className="font-display font-bold text-cyan-300 mb-2 text-sm uppercase tracking-wider">
              Fair & Transparent Scoring Formula (0 – 1,000 Pts)
            </h3>
            <ul className="space-y-1.5 text-xs font-mono text-slate-200">
              <li>• <strong>35% Optimal Path Length (Max 350 pts):</strong> Measures the shortest valid route through your facility.</li>
              <li>• <strong>30% Search Effort (Max 300 pts):</strong> Measures exploration and replanning.</li>
              <li>• <strong>20% Deception Impact (Max 200 pts):</strong> Measures additional movement and activated deception.</li>
              <li>• <strong>15% Meaningful Trap Interactions (Max 150 pts):</strong> Counts only keys, doors, and switch gates actually used on the AI&apos;s optimal path (decoy keys in unused corners give 0 interaction points!).</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm transition"
          >
            GOT IT — LET&apos;S BUILD
          </button>
        </div>
      </div>
    </div>
  );
};
