import { AutonomousAgentResult, ScoreBreakdown, SolverResult } from './types';

/**
 * Reverse Escape: Mind Wars — Deterministic Bounded Scoring Formula (0 - 1,000 points)
 *
 * Measures genuine strategic difficulty & deception against an Autonomous Planning AI:
 * - 35% (max 350 pts): Omniscient Optimal Path Length (BFS Shortest Path)
 *   Baseline empty 8x8 grid is 14 moves; normalized over [14 .. 50] moves.
 * - 30% (max 300 pts): Exploration & Replanning Effort (Actual Autonomous AI Moves + Replans)
 *   Measures how much uncertainty, frontier exploration, and dynamic replanning the room forced.
 * - 20% (max 200 pts): Deception & Trap Impact
 *   Rewards exploration overhead (actualAgentSteps - shortestPathLength), triggered Reset Traps,
 *   and investigated Decoy Exit signals.
 * - 15% (max 150 pts): Meaningful On-Path Lock/Switch Interactions
 *   Anti-cheese: counts only keys, doors, and switch-gates actually required on the solution path.
 */
export function calculateScore(
  solverResult: SolverResult,
  agentResult?: AutonomousAgentResult
): ScoreBreakdown {
  if (!solverResult.solvable || solverResult.shortestPathLength <= 0) {
    return {
      totalScore: 0,
      lengthScore: 0,
      searchScore: 0,
      deceptionScore: 0,
      interactionScore: 0,
      shortestPathLength: 0,
      actualAgentSteps: 0,
      explorationOverhead: 0,
      statesExplored: solverResult.statesExplored ?? 0,
      replanCount: 0,
      trapsTriggeredCount: 0,
      decoysInvestigatedCount: 0,
      meaningfulInteractions: 0,
      deceptionRatio: 0,
      difficultyRating: 'TRIVIAL',
    };
  }

  const L = solverResult.shortestPathLength;
  const E = solverResult.statesExplored;
  const I = solverResult.meaningfulInteractions;

  const actualSteps = agentResult?.escaped ? agentResult.totalSteps : L;
  const overhead = Math.max(0, actualSteps - L);
  const replans = agentResult?.replanCount ?? 0;
  const trapsTriggered = agentResult?.trapsTriggeredCount ?? 0;
  const decoysInvestigated = agentResult?.decoysInvestigatedCount ?? 0;

  // 1. Optimal Path Length (Max 380)
  const lengthNorm = Math.min(1, Math.max(0, (L - 14) / 32));
  const lengthScore = Math.round(380 * lengthNorm);

  // 2. Search & Exploration Effort (Max 290)
  const multiStateExcess = Math.max(0, E - 64);
  const revisitComplexity = Math.max(0, E - L * 2);
  const replanNorm = Math.min(1, Math.max(0, (replans - 1) / 8));
  const searchNorm = Math.min(
    1,
    multiStateExcess / 95 +
      (I > 0 ? revisitComplexity / 120 : 0) +
      replanNorm * 0.35
  );
  const searchScore = Math.round(290 * searchNorm);

  // 3. Deception & Trap Impact (Max 180)
  const deceptionNorm = Math.min(
    1,
    overhead / 22 + trapsTriggered * 0.35 + decoysInvestigated * 0.25
  );
  const deceptionScore = Math.round(180 * deceptionNorm);

  // 4. Meaningful Interactions (Max 150)
  const interactionNorm = Math.min(1, Math.max(0, I / 5));
  const interactionScore = Math.round(150 * interactionNorm);

  const totalScore = Math.min(
    1000,
    lengthScore + searchScore + deceptionScore + interactionScore
  );

  const deceptionRatio = Number((actualSteps / Math.max(1, L)).toFixed(2));

  let difficultyRating: ScoreBreakdown['difficultyRating'] = 'TRIVIAL';
  if (totalScore >= 750) {
    difficultyRating = 'MASTERMIND';
  } else if (totalScore >= 520) {
    difficultyRating = 'DEVIOUS';
  } else if (totalScore >= 300) {
    difficultyRating = 'MODERATE';
  } else if (totalScore >= 100) {
    difficultyRating = 'EASY';
  }

  return {
    totalScore,
    lengthScore,
    searchScore,
    deceptionScore,
    interactionScore,
    shortestPathLength: L,
    actualAgentSteps: actualSteps,
    explorationOverhead: overhead,
    statesExplored: E,
    replanCount: replans,
    trapsTriggeredCount: trapsTriggered,
    decoysInvestigatedCount: decoysInvestigated,
    meaningfulInteractions: I,
    deceptionRatio,
    difficultyRating,
  };
}
