import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Box, BrainCircuit, Compass, Flag, KeyRound, X } from 'lucide-react';
import { useGameDialog } from '../lib/useGameDialog';

interface HowToPlayModalProps { open: boolean; onClose: () => void; }
export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ open, onClose }) => {
  const dialog = useGameDialog(open, onClose);
  if (!open) return null;
  return createPortal(<div className="game-guide-overlay">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="game-guide-title" className="game-guide">
      <header><div><span className="architect-eyebrow">REVERSE ESCAPE / FIELD GUIDE</span><h2 id="game-guide-title">Three ways to make your escape.</h2><p>Pick your mission. Make every move count.</p></div><button aria-label="Close game guide" onClick={onClose}><X size={20} /></button></header>
      <div className="game-guide-options">
        <article><Compass size={25} /><h3>Explore the sectors</h3><p>Choose an orbital platform, enter its level and find the extraction beacon. Complete a sector to unlock the next. Progress stays on this device.</p><small>SOLO EXPEDITION · 8 LEVELS</small></article>
        <article><Box size={25} /><h3>Build the trap</h3><p>Open the architect studio. Place rooms, walls, access cores and traps using 30 energy. Test the layout, follow the scout, then launch your expedition.</p><small>CREATIVE PLAY · AI CHALLENGE</small></article>
        <article><Flag size={25} /><h3>Bring a rival</h3><p>Create an Architect duel or Live escape race, share the invite link and ready both players. Duels reward the better design; races reward the first final extraction.</p><small>ONLINE MULTIPLAYER · 1v1</small></article>
      </div>
      <div className="game-guide-controls"><div><h3>Your controls</h3><p><kbd>W A S D</kbd> or <kbd aria-label="Arrow keys">↑ ↓ ← →</kbd> to move. Use the D-pad on mobile.</p><p>Right-drag to orbit while building. Use Plan for an overhead view, Follow for a close-up, or two fingers to orbit and zoom on touch.</p></div><KeyRound size={24} /></div>
      <div className="game-guide-rules"><p><strong>Read the room.</strong> Collect matching access cores to unlock doors. Phase switches flip gates. A lift is the only walking route onto its raised annex. Portals warp you; reset mines send you back to deployment. EMP fields jam sensors for six moves, and cryo fields slow your next human move.</p><p><BrainCircuit size={18} /><span><strong>How the scout thinks:</strong> the default and competitive scout uses deterministic frontier exploration + A*, with memory and replanning, without a trained model. Solo expeditions can optionally use GPT-6 Luna Decisions to choose observed objectives, with A* routing and automatic fallback. Full-map BFS validates rooms in both modes.</span></p></div>
      <footer><span>Press Esc to return to the game.</span><button className="architect-btn architect-btn-primary" onClick={onClose}>Let’s play<ArrowRight size={16} /></button></footer>
    </div>
  </div>, document.body);
};
