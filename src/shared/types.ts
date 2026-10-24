export type TileType =
  | 'EMPTY'
  | 'START'
  | 'EXIT'
  | 'WALL'
  | 'KEY_RED'
  | 'DOOR_RED'
  | 'KEY_CYAN'
  | 'DOOR_CYAN'
  | 'KEY_GOLD'
  | 'DOOR_GOLD'
  | 'SWITCH_A'
  | 'GATE_A_CLOSED'
  | 'GATE_A_OPEN'
  | 'DECOY_EXIT'
  | 'TRAP_RESET'
  | 'PORTAL_A'
  | 'EMP_SCRAMBLER'
  | 'GRAVITY_MUD'
  | 'ELEVATOR_A'
  | 'ELEVATOR_B';

export type Grid = TileType[][];

export interface Coordinate {
  row: number;
  col: number;
}

export interface TileMetadata {
  type: TileType;
  label: string;
  shortLabel: string;
  cost: number;
  maxCount: number;
  description: string;
  category:
    | 'anchor'
    | 'structure'
    | 'key'
    | 'door'
    | 'switch'
    | 'gate'
    | 'deception'
    | 'tactical'
    | 'tool';
  colorClass: string;
}

export type StepEventType =
  | 'START'
  | 'MOVE'
  | 'EXPLORE_FRONTIER'
  | 'COLLECT_KEY'
  | 'UNLOCK_DOOR'
  | 'TOGGLE_SWITCH'
  | 'PASS_GATE'
  | 'DECOY_DISCOVERED'
  | 'TRAP_RESET_TRIGGERED'
  | 'PORTAL_WARP'
  | 'CHANGE_LEVEL'
  | 'EMP_JAMMED'
  | 'GRAVITY_SLOW'
  | 'REPLAN'
  | 'MEMORY_AVOID'
  | 'EXIT';

export interface SolverStep {
  stepIndex: number;
  row: number;
  col: number;
  level?: number;
  keyMask: number;
  switchMask: number;
  resetMask?: number;
  event: StepEventType;
  tile: TileType;
  description: string;
}

export interface ExploredCell {
  row: number;
  col: number;
  visitOrder: number;
  visitCount: number;
}

export interface SolverResult {
  solvable: boolean;
  algorithm: 'BFS' | 'AUTONOMOUS_ASTAR';
  shortestPathLength: number;
  statesExplored: number;
  solveTimeMs: number;
  steps: SolverStep[];
  exploredCells: ExploredCell[];
  meaningfulInteractions: number;
  keysCollectedCount: number;
  doorsUnlockedCount: number;
  switchesToggledCount: number;
  gatesPassedCount: number;
  reason?: string;
}

export type AgentObjectiveType =
  | 'REACH_EXIT'
  | 'INVESTIGATE_SIGNAL'
  | 'COLLECT_KEY'
  | 'UNLOCK_DOOR'
  | 'TOGGLE_SWITCH'
  | 'EXPLORE_FRONTIER';

export interface AgentDecisionEvent {
  stepIndex: number;
  type:
    | 'OBSERVE'
    | 'FRONTIER'
    | 'KEY_FOUND'
    | 'DOOR_UNLOCKED'
    | 'SWITCH_TOGGLED'
    | 'DECOY_EXPOSED'
    | 'TRAP_TRIGGERED'
    | 'PORTAL_WARP'
    | 'LEVEL_CHANGE'
    | 'EMP_JAMMED'
    | 'REPLAN'
    | 'LUNA_CHOICE'
    | 'PLANNER_FALLBACK'
    | 'MEMORY_ADAPT'
    | 'EXIT_FOUND'
    | 'ESCAPED';
  message: string;
  row: number;
  col: number;
}

export interface AgentMemory {
  attemptCount: number;
  knownHazards: string[]; // "row,col" of discovered TRAP_RESET or EMP_SCRAMBLER tiles
  verifiedDecoys: string[]; // "row,col" of discovered DECOY_EXIT tiles
  deadEndCorridors: string[]; // "row,col" cells marked low-utility
}

export interface AgentSimulationStep {
  stepIndex: number;
  row: number;
  col: number;
  level?: number;
  keyMask: number;
  switchMask: number;
  visionRadius: number;
  empRemainingTurns: number;
  triggeredResetPositions: string[];
  event: StepEventType;
  tile: TileType;
  objectiveType: AgentObjectiveType;
  objectiveTarget: Coordinate | null;
  plannedRoute: Coordinate[];
  visibleCells: string[]; // "r,c" currently within vision radius
  discoveredCells: string[]; // "r,c" all cells revealed up to this step
  knownHazards: string[]; // "r,c" known reset traps up to this step
  verifiedDecoys: string[]; // "r,c" known decoys up to this step
  decisionLog: string;
}

export interface AutonomousAgentResult {
  planner?: {
    mode: 'LUNA';
    model: 'gpt-6-luna';
    modelChoices: number;
    fallbackChoices: number;
  };
  escaped: boolean;
  attemptNumber: number;
  visibilityRadius: number;
  totalSteps: number;
  explorationSteps: number;
  trapPenaltySteps: number;
  replanCount: number;
  trapsTriggeredCount: number;
  decoysInvestigatedCount: number;
  portalsUsedCount: number;
  empTriggeredCount: number;
  memoryAvoidancesCount: number;
  discoveredPercent: number;
  solveTimeMs: number;
  steps: AgentSimulationStep[];
  decisionEvents: AgentDecisionEvent[];
  updatedMemory: AgentMemory;
  reason?: string;
}

export interface ScoreBreakdown {
  totalScore: number;
  lengthScore: number;
  searchScore: number;
  deceptionScore: number;
  interactionScore: number;
  shortestPathLength: number; // Omniscient BFS optimal moves
  actualAgentSteps: number; // Autonomous fog-of-war A* agent moves
  explorationOverhead: number; // actualAgentSteps - shortestPathLength
  statesExplored: number;
  replanCount: number;
  trapsTriggeredCount: number;
  decoysInvestigatedCount: number;
  meaningfulInteractions: number;
  deceptionRatio: number;
  difficultyRating: 'TRIVIAL' | 'EASY' | 'MODERATE' | 'DEVIOUS' | 'MASTERMIND';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  budgetUsed: number;
  budgetRemaining: number;
  tileCounts: Record<TileType, number>;
  solverResult?: SolverResult; // Complete-information BFS validation result
  agentResult?: AutonomousAgentResult; // Fog-of-war autonomous A* agent result
  adaptedAgentResult?: AutonomousAgentResult; // Attempt 2 with retained memory
  scoreBreakdown?: ScoreBreakdown;
}

export type MatchPhase =
  | 'LOBBY'
  | 'BUILDING'
  | 'VALIDATING'
  | 'AI_SOLVING'
  | 'RESULTS'
  | 'RACING';

export type MatchMode = 'ARCHITECT' | 'RACE' | 'COOP';
export interface RacerState {
  empRemainingTurns?: number;
  moveReadyAt?: number;
  stageIndex: number;
  moves: number;
  row: number;
  col: number;
  keyMask: number;
  switchMask: number;
  spentTraps: string[];
  lastStep: SolverStep;
  finishedAtMs?: number;
}

export interface PlayerSlot {
  racer?: RacerState;
  id: string;
  token: string;
  name: string;
  connected: boolean;
  ready: boolean;
  submitted: boolean;
  budgetUsed: number;
  tilesPlaced: number;
  isValidDraft: boolean;
  grid?: Grid;
  solverResult?: SolverResult;
  agentResult?: AutonomousAgentResult;
  adaptedAgentResult?: AutonomousAgentResult;
  scoreBreakdown?: ScoreBreakdown;
}

export interface MatchState {
  serverTime?: number;
  mode?: MatchMode;
  raceStartedAt?: number;
  sectorIds?: string[];
  roomCode: string;
  phase: MatchPhase;
  roundNumber: number;
  buildDurationSec: 45 | 90;
  remainingSeconds: number;
  hostToken: string;
  players: PlayerSlot[];
  spectatorCount: number;
  winnerId: string | 'TIE' | null;
  rematchVotes: string[];
  createdAt: number;
}

export interface PresetBoard {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  grid: Grid;
}
