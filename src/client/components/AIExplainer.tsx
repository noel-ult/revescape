import React from 'react';
import { AgentSimulationStep, AutonomousAgentResult, SolverStep } from '../../shared/types';

interface AIExplainerProps {
  step?: AgentSimulationStep | SolverStep | null;
  optimalMoves?: number;
  actualMoves?: number;
  compact?: boolean;
  planner?: AutonomousAgentResult['planner'];
}

export const AIExplainer: React.FC<AIExplainerProps> = ({
  step, optimalMoves, actualMoves, compact = false, planner,
}) => {
  const observation = step && 'visibleCells' in step ? step : null;
  return (
    <section className={`ai-explainer ${compact ? 'ai-explainer-compact' : ''}`} aria-label="How the AI decides">
      <div className="ai-explainer-kicker">HOW THE SCOUT THINKS <span>{planner ? planner.modelChoices > 0 ? 'LUNA + A*' : 'LUNA REQUESTED / FALLBACK' : 'DETERMINISTIC / NO LLM'}</span></div>
      <h3>{planner ? 'Luna objectives + A* routes' : 'Exploration + A* pathfinding'}</h3>
      {planner ? <p><strong>GPT-6 Luna Decisions</strong> chooses between reachable objectives using the scout’s observed map and memory. A* computes legal routes; the model cannot reveal hidden tiles or bypass lifts. When Luna is unavailable or its decision budget runs out, deterministic frontier scoring takes over. This mode uses a pretrained model; the game does not train it.</p>
        : <p>This is a <strong>search-based agent, not a trained or generative AI</strong>. It observes nearby space, chooses an unexplored frontier or useful objective, then plans the least-cost known route with A*. It replans when a lift, key, hazard, or new route changes what it knows.</p>}
      {planner && <p className="ai-explainer-note" data-testid="luna-status">{planner.modelChoices} Luna choices · {planner.fallbackChoices} fallback choices. Single-option plans use A* directly.</p>}
      <div className="ai-explainer-data">
        <span><small>KNOWN SPACE</small>{observation ? `${observation.discoveredCells.length}/64 sectors` : 'Local visibility'}</span>
        <span><small>CURRENT DECK</small>{step ? `Level ${step.level ?? 0}` : 'Base deck'}</span>
        <span><small>OBJECTIVE</small>{observation ? observation.objectiveType.replaceAll('_', ' ') : 'Explore / escape'}</span>
      </div>
      {observation && <div className="ai-explainer-decision"><small>ACTUAL DECISION · STEP {observation.stepIndex}</small>{observation.decisionLog}</div>}
      <p className="ai-explainer-note">A separate full-map <strong>BFS</strong> checks solvability and measures the shortest possible route.
        {optimalMoves !== undefined && actualMoves !== undefined && ` Here: ${optimalMoves} optimal vs ${actualMoves} exploratory moves.`}
        {' '}{planner ? 'Only the optional objective selector calls the OpenAI Decisions API.' : 'Neither algorithm calls an external AI API.'}
      </p>
    </section>
  );
};
