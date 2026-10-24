import React from 'react';
import { AgentSimulationStep, SolverStep } from '../../shared/types';

interface AIExplainerProps {
  step?: AgentSimulationStep | SolverStep | null;
  optimalMoves?: number;
  actualMoves?: number;
  compact?: boolean;
}

export const AIExplainer: React.FC<AIExplainerProps> = ({
  step, optimalMoves, actualMoves, compact = false,
}) => {
  const observation = step && 'visibleCells' in step ? step : null;
  return (
    <section className={`ai-explainer ${compact ? 'ai-explainer-compact' : ''}`} aria-label="How the AI decides">
      <div className="ai-explainer-kicker">HOW THE SCOUT THINKS <span>DETERMINISTIC / NO LLM</span></div>
      <h3>Exploration + A* pathfinding</h3>
      <p>This is a <strong>search-based agent, not a trained or generative AI</strong>. It observes nearby space, chooses an unexplored frontier or useful objective, then plans the least-cost known route with A*. It replans when a lift, key, hazard, or new route changes what it knows.</p>
      <div className="ai-explainer-data">
        <span><small>KNOWN SPACE</small>{observation ? `${observation.discoveredCells.length}/64 sectors` : 'Local visibility'}</span>
        <span><small>CURRENT DECK</small>{step ? `Level ${step.level ?? 0}` : 'Base deck'}</span>
        <span><small>OBJECTIVE</small>{observation ? observation.objectiveType.replaceAll('_', ' ') : 'Explore / escape'}</span>
      </div>
      {observation && <div className="ai-explainer-decision"><small>ACTUAL DECISION · STEP {observation.stepIndex}</small>{observation.decisionLog}</div>}
      <p className="ai-explainer-note">A separate full-map <strong>BFS</strong> checks solvability and measures the shortest possible route.
        {optimalMoves !== undefined && actualMoves !== undefined && ` Here: ${optimalMoves} optimal vs ${actualMoves} exploratory moves.`}
        {' '}Neither algorithm calls an external AI API.
      </p>
    </section>
  );
};
