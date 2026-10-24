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
        <article><Compass size={25} /><h3>Play the solo expedition</h3><p>Escape eight sectors, earn mission stars and race the amber AI ghost. Extraction unlocks the next level; rewards stay on this device. Try the daily challenge for a shared UTC room and server-verified rankings.</p><small>SOLO EXPEDITION · GHOST RACE · DAILY</small></article>
        <article><Box size={25} /><h3>Build the trap</h3><p>Design a facility using 30 energy. Test it, launch the scout, then pause and rewind a decision to compare an edited continuation. Share a playable snapshot link for friends to escape or remix.</p><small>CREATIVE PLAY · SHARING · DECISION REWIND</small></article>
        <article><Flag size={25} /><h3>Bring a rival or teammate</h3><p>Create an Architect duel, Live escape race or Co-op expedition, share the invite and ready both players. Co-op shares access cores and requires both players at extraction. Hold its pressure switch for your teammate to cross.</p><small>ONLINE MULTIPLAYER · DUEL · RACE · CO-OP</small></article>
      </div>
      <div className="game-guide-controls"><div><h3>Your controls</h3><p><kbd>W A S D</kbd> or <kbd aria-label="Arrow keys">↑ ↓ ← →</kbd> to move. Use the D-pad on mobile.</p><p>Right-drag to orbit while building. Use Plan for an overhead view, Follow for a close-up, or two fingers to orbit and zoom on touch.</p></div><KeyRound size={24} /></div>
      <div className="game-guide-rules"><p><strong>Read the room.</strong> Collect matching access cores to unlock doors. Phase switches flip gates. A lift is the only walking route onto its raised annex. Portals warp you; reset mines send you back to deployment. EMP fields jam sensors for six moves, and cryo fields slow your next human move.</p><p><BrainCircuit size={18} /><span><strong>How the scout thinks:</strong> the default and competitive scout uses deterministic frontier exploration + A*, with memory and replanning, without a trained model. Architect studio can optionally use GPT-6 Luna Decisions to choose observed objectives, with A* routing and automatic fallback. Full-map BFS validates rooms in both modes. The solo campaign is played by you; its scout benchmark uses the deterministic agent.</span></p></div>
      <footer><span>Press Esc to return to the game.</span><button className="architect-btn architect-btn-primary" onClick={onClose}>Let’s play<ArrowRight size={16} /></button></footer>
    </div>
  </div>, document.body);
};
