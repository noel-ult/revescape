import { createEmptyMemory, findPortalDestination } from './board';
import {
  DEFAULT_VISION_RADIUS,
  DOOR_KEY_BITS,
  GRID_COLS,
  GRID_ROWS,
  KEY_BITS,
  MAX_AGENT_STEPS,
  START_POS,
  TILE_CATALOG,
} from './constants';
import { canEnterTile } from './solver';
import { canTraverseDeck, deckAt, DeckTopology, getDeckTopology } from './levels';
import {
  AgentDecisionEvent,
  AgentMemory,
  AgentObjectiveType,
  AgentSimulationStep,
  AutonomousAgentResult,
  Coordinate,
  Grid,
  StepEventType,
  TileType,
} from './types';

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // UP
  [0, 1],  // RIGHT
  [1, 0],  // DOWN
  [0, -1], // LEFT
];

function coordKey(r: number, c: number): string {
  return `${r},${c}`;
}

function manhattan(a: Coordinate, b: Coordinate): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

interface AStarNode {
  row: number;
  col: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

/**
 * Component 3: A* Pathfinding over the AI's currently known map.
 * - Never traverses undiscovered cells.
 * - Respects currently held keys (`keyMask`) and current switch state (`switchMask`).
 * - Applies high movement cost penalty (`+45`) to remembered active reset/EMP hazard tiles
 *   so the AI automatically routes around known hazards whenever an alternative route exists,
 *   while still allowing traversal if it is the ONLY path.
 */
export function planRouteAStar(
  start: Coordinate,
  goal: Coordinate,
  knownMap: Map<string, TileType>,
  keyMask: number,
  switchMask: number,
  knownHazards: Set<string>,
  disarmedHazards: Set<string>,
  visitCounts: Map<string, number>,
  topology: DeckTopology = { accessA: null, accessB: null }
): { path: Coordinate[]; cost: number; avoidsKnownHazard: boolean } | null {
  if (start.row === goal.row && start.col === goal.col) {
    return { path: [], cost: 0, avoidsKnownHazard: false };
  }

  const open: AStarNode[] = [
    {
      row: start.row,
      col: start.col,
      g: 0,
      f: manhattan(start, goal),
      parent: null,
    },
  ];

  const bestG = new Map<string, number>();
  bestG.set(coordKey(start.row, start.col), 0);
  let encounteredKnownHazardInSearch = false;

  while (open.length > 0) {
    // Pop node with lowest f (tie-break lowest h, then row/col for determinism)
    open.sort((a, b) => {
      if (a.f !== b.f) return a.f - b.f;
      return a.row !== b.row ? a.row - b.row : a.col - b.col;
    });

    const current = open.shift()!;
    if (current.row === goal.row && current.col === goal.col) {
      const route: Coordinate[] = [];
      let curr: AStarNode | null = current;
      while (curr && curr.parent !== null) {
        route.push({ row: curr.row, col: curr.col });
        curr = curr.parent;
      }
      route.reverse();
      return {
        path: route,
        cost: current.g,
        avoidsKnownHazard: encounteredKnownHazardInSearch,
      };
    }

    for (const [dr, dc] of DIRECTIONS) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (!canTraverseDeck(topology, current, { row: nr, col: nc })) continue;

      const nKey = coordKey(nr, nc);
      const knownTile = knownMap.get(nKey);

      // AI cannot plan through unknown cells!
      if (!knownTile) continue;

      if (!canEnterTile(knownTile, keyMask, switchMask)) {
        continue;
      }

      let stepCost = 1;
      if (deckAt(topology, current.row, current.col) !== deckAt(topology, nr, nc)) {
        stepCost += 2; // Elevation costs energy, but the Manhattan heuristic remains admissible.
      }
      if (knownTile === 'GRAVITY_MUD') {
        stepCost += 2; // Cryo-stasis field triples movement cost
      }
      if (knownHazards.has(nKey) && !disarmedHazards.has(nKey)) {
        encounteredKnownHazardInSearch = true;
        stepCost += 45; // Heavy memory penalty for active reset trap / EMP
      }

      // Slight penalty for heavily revisited floor cells to prevent oscillation
      const priorVisits = visitCounts.get(nKey) ?? 0;
      if (priorVisits > 2 && nr !== goal.row && nc !== goal.col) {
        stepCost += Math.min(4, priorVisits - 2) * 0.25;
      }

      const tentativeG = current.g + stepCost;
      const prevBest = bestG.get(nKey);
      if (prevBest === undefined || tentativeG < prevBest) {
        bestG.set(nKey, tentativeG);
        open.push({
          row: nr,
          col: nc,
          g: tentativeG,
          f: tentativeG + manhattan({ row: nr, col: nc }, goal),
          parent: current,
        });
      }
    }
  }

  return null;
}

/**
 * Autonomous Planning AI Simulation Engine:
 * - Component 1: Partial Observability (Manhattan vision radius + Beacon signal detection)
 * - Component 2: Frontier-Based Exploration (scores known accessible cells bordering unknown space)
 * - Component 3: A* Pathfinding over known map with inventory state
 * - Component 4: Memory-Based Planning (persists knownHazards & verifiedDecoys across attempts)
 * - Component 5: Dynamic Replanning (invalidates plan on newly revealed obstacles, traps, or decoys)
 * - Component 6: Real Observable Decision Log events
 */
export function runAutonomousAgent(
  trueGrid: Grid,
  options?: {
    visibilityRadius?: number;
    priorMemory?: AgentMemory;
    maxSteps?: number;
  }
): AutonomousAgentResult {
  const startTime = performance.now();
  const visibilityRadius = options?.visibilityRadius ?? DEFAULT_VISION_RADIUS;
  const maxSteps = options?.maxSteps ?? MAX_AGENT_STEPS;
  const priorMemory = options?.priorMemory ?? createEmptyMemory();
  const attemptNumber = priorMemory.attemptCount + 1;
  // Public architectural topology only. Hidden tiles remain accessible solely via observation.
  const topology = getDeckTopology(trueGrid);

  // AI Knowledge State (Strict separation from trueGrid!)
  const knownMap = new Map<string, TileType>();
  const knownHazards = new Set<string>(priorMemory.knownHazards);
  const verifiedDecoys = new Set<string>(priorMemory.verifiedDecoys);
  const deadEndCorridors = new Set<string>(priorMemory.deadEndCorridors);
  const disarmedHazards = new Set<string>();
  const visitCounts = new Map<string, number>();
  const switchToggleCounts = new Map<string, number>();

  // Detect broadcast signals: True EXIT and DECOY_EXIT emit a long-range signal beacon
  // so the AI senses candidate signal coordinates at medium range (radius 5),
  // but cannot tell if a signal is the True Exit or a Decoy until it approaches within distance 1!
  const candidateSignals = new Map<string, Coordinate>();

  let currentPos: Coordinate = { ...START_POS };
  let keyMask = 0;
  let switchMask = 0;
  let empRemainingTurns = 0;

  let explorationSteps = 0;
  let trapPenaltySteps = 0;
  let replanCount = 0;
  let trapsTriggeredCount = 0;
  let decoysInvestigatedCount = 0;
  let portalsUsedCount = 0;
  let empTriggeredCount = 0;
  let memoryAvoidancesCount = 0;
  const countedMemoryAvoidHazards = new Set<string>();
  const usedPortalCoords = new Set<string>();

  const decisionEvents: AgentDecisionEvent[] = [];
  const steps: AgentSimulationStep[] = [];

  const recordDecision = (
    stepIndex: number,
    type: AgentDecisionEvent['type'],
    message: string,
    pos: Coordinate = currentPos
  ) => {
    decisionEvents.push({
      stepIndex,
      type,
      message,
      row: pos.row,
      col: pos.col,
    });
  };

  /**
   * Component 1: Observe surroundings within `visibilityRadius`
   */
  const observeEnvironment = (
    stepIndex: number
  ): {
    visibleNow: string[];
    newlyRevealedImportant: boolean;
  } => {
    const visibleNow: string[] = [];
    let newlyRevealedImportant = false;
    const effectiveRadius = empRemainingTurns > 0 ? 1 : visibilityRadius;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const dist =
          Math.abs(r - currentPos.row) + Math.abs(c - currentPos.col);
        const cKey = coordKey(r, c);
        const trueTile = trueGrid[r][c];
        const sameDeck = deckAt(topology, r, c) === deckAt(topology, currentPos.row, currentPos.col);
        const onAccess = [topology.accessA, topology.accessB].some(
          access => access?.row === currentPos.row && access.col === currentPos.col
        );

        // Long-range beacon sensor (Manhattan distance <= 5) detects DECOY_EXIT and EXIT signals
        if (
          empRemainingTurns === 0 &&
          dist <= 5 &&
          (trueTile === 'DECOY_EXIT' || trueTile === 'EXIT') &&
          !verifiedDecoys.has(cKey) &&
          !knownMap.has(cKey) &&
          !candidateSignals.has(cKey)
        ) {
          candidateSignals.set(cKey, { row: r, col: c });
          newlyRevealedImportant = true;
          recordDecision(
            stepIndex,
            'OBSERVE',
            `Exit beacon signal detected near (${r}, ${c}) — authenticity unverified`,
            { row: r, col: c }
          );
        }

        if (dist <= effectiveRadius && (sameDeck || onAccess)) {
          visibleNow.push(cKey);
          const wasKnown = knownMap.has(cKey);

          // Note: TRAP_RESET and EMP_SCRAMBLER look like normal floor until the AI steps on them
          // or already remembers them from `knownHazards`!
          // DECOY_EXIT looks like an EXIT beacon until the AI gets within distance <= 1!
          if (
            (trueTile === 'TRAP_RESET' || trueTile === 'EMP_SCRAMBLER') &&
            !knownHazards.has(cKey)
          ) {
            if (!wasKnown) {
              knownMap.set(cKey, 'EMPTY');
            }
          } else if (trueTile === 'DECOY_EXIT' && dist > 1 && !verifiedDecoys.has(cKey)) {
            if (!wasKnown) {
              knownMap.set(cKey, 'EXIT');
              newlyRevealedImportant = true;
            }
          } else {
            const prevBelieved = knownMap.get(cKey);
            knownMap.set(cKey, trueTile);

            if (trueTile === 'DECOY_EXIT' && !verifiedDecoys.has(cKey)) {
              verifiedDecoys.add(cKey);
              candidateSignals.delete(cKey);
              decoysInvestigatedCount++;
              newlyRevealedImportant = true;
              recordDecision(
                stepIndex,
                'DECOY_EXPOSED',
                `Decoy hologram exposed at (${r}, ${c})! Recording in memory & replanning.`,
                { row: r, col: c }
              );
            } else if (!wasKnown || prevBelieved !== trueTile) {
              if (KEY_BITS[trueTile] !== undefined) {
                newlyRevealedImportant = true;
                recordDecision(
                  stepIndex,
                  'KEY_FOUND',
                  `${TILE_CATALOG[trueTile].label} spotted at (${r}, ${c})`,
                  { row: r, col: c }
                );
              } else if (trueTile === 'EXIT') {
                candidateSignals.delete(cKey);
                newlyRevealedImportant = true;
                recordDecision(
                  stepIndex,
                  'EXIT_FOUND',
                  `True Escape Portal confirmed at (${r}, ${c})!`,
                  { row: r, col: c }
                );
              } else if (DOOR_KEY_BITS[trueTile] !== undefined || trueTile === 'SWITCH_A') {
                newlyRevealedImportant = true;
              }
            }
          }
        }
      }
    }

    return { visibleNow, newlyRevealedImportant };
  };

  /**
   * Component 2: Select next planning objective and compute A* route
   */
  const selectNextObjectiveAndPlan = (
    stepIndex: number
  ): {
    objectiveType: AgentObjectiveType;
    target: Coordinate | null;
    route: Coordinate[];
    explanation: string;
  } => {
    const candidates: Array<{
      type: AgentObjectiveType;
      target: Coordinate;
      route: Coordinate[];
      score: number;
      explanation: string;
      avoidsHazard: boolean;
    }> = [];

    // 1. Check known EXIT or unverified DECOY believed to be EXIT
    for (const [k, tile] of knownMap.entries()) {
      if (tile === 'EXIT' && !verifiedDecoys.has(k)) {
        const [r, c] = k.split(',').map(Number);
        const plan = planRouteAStar(
          currentPos,
          { row: r, col: c },
          knownMap,
          keyMask,
          switchMask,
          knownHazards,
          disarmedHazards,
          visitCounts,
          topology
        );
        if (plan && plan.path.length > 0) {
          candidates.push({
            type: 'REACH_EXIT',
            target: { row: r, col: c },
            route: plan.path,
            score: 1000 - plan.cost,
            explanation: `Advancing along A* route to Exit signal at (${r}, ${c})`,
            avoidsHazard: plan.avoidsKnownHazard,
          });
        }
      }
    }

    // 2. Check known uncollected keys
    for (const [k, tile] of knownMap.entries()) {
      const bit = KEY_BITS[tile];
      if (bit !== undefined && (keyMask & bit) === 0) {
        const [r, c] = k.split(',').map(Number);
        const plan = planRouteAStar(
          currentPos,
          { row: r, col: c },
          knownMap,
          keyMask,
          switchMask,
          knownHazards,
          disarmedHazards,
          visitCounts,
          topology
        );
        if (plan && plan.path.length > 0) {
          candidates.push({
            type: 'COLLECT_KEY',
            target: { row: r, col: c },
            route: plan.path,
            score: 850 - plan.cost * 2,
            explanation: `Routing to collect ${TILE_CATALOG[tile].label} at (${r}, ${c})`,
            avoidsHazard: plan.avoidsKnownHazard,
          });
        }
      }
    }

    // 3. Check known switches if toggling the switch opens a new frontier or unlocks the exit!
    // If there are NO direct reachable keys or exits in the current switch state, check if toggling
    // a known switch is needed (only after exhausting non-switch frontiers in the current state).
    const hasBlockedGate = Array.from(knownMap.values()).some(
      (t) =>
        (t === 'GATE_A_CLOSED' && (switchMask & 1) === 0) ||
        (t === 'GATE_A_OPEN' && (switchMask & 1) === 1)
    );
    if (hasBlockedGate) {
      for (const [k, tile] of knownMap.entries()) {
        if (tile === 'SWITCH_A') {
          const [r, c] = k.split(',').map(Number);
          const toggles = switchToggleCounts.get(k) ?? 0;
          if (toggles < 3 && !(r === currentPos.row && c === currentPos.col)) {
            const plan = planRouteAStar(
              currentPos,
              { row: r, col: c },
              knownMap,
              keyMask,
              switchMask,
              knownHazards,
              disarmedHazards,
              visitCounts,
              topology
            );
            if (plan && plan.path.length > 0) {
              candidates.push({
                type: 'TOGGLE_SWITCH',
                target: { row: r, col: c },
                route: plan.path,
                // Score lower than uncollected keys and unexplored frontiers so the AI explores
                // reachable regions and grabs keys BEFORE flipping the phase gate!
                score: 320 - toggles * 60 - plan.cost * 2,
                explanation: `Navigating to toggle Pulse Switch at (${r}, ${c}) to flip phase gates`,
                avoidsHazard: plan.avoidsKnownHazard,
              });
            }
          }
        }
      }
    }

    // 4. Frontier Exploration: Find all known walkable cells adjacent to at least 1 unknown cell
    for (const [k, tile] of knownMap.entries()) {
      if (!canEnterTile(tile, keyMask, switchMask)) continue;
      const [r, c] = k.split(',').map(Number);
      if (r === currentPos.row && c === currentPos.col) continue;

      let unknownNeighbors = 0;
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS) {
          if (canTraverseDeck(topology, { row: r, col: c }, { row: nr, col: nc }) &&
            !knownMap.has(coordKey(nr, nc))) {
            unknownNeighbors++;
          }
        }
      }

      if (unknownNeighbors > 0) {
        const plan = planRouteAStar(
          currentPos,
          { row: r, col: c },
          knownMap,
          keyMask,
          switchMask,
          knownHazards,
          disarmedHazards,
          visitCounts,
          topology
        );
        if (plan && plan.path.length > 0) {
          // Information gain + proximity to detected signal beacons or bottom-right quadrant
          let signalBonus = 0;
          for (const [sigKey, sigCoord] of candidateSignals.entries()) {
            if (!verifiedDecoys.has(sigKey)) {
              const distToSig = manhattan({ row: r, col: c }, sigCoord);
              signalBonus = Math.max(signalBonus, (14 - distToSig) * 8);
            }
          }

          const deadEndPenalty = deadEndCorridors.has(k) ? 35 : 0;
          const frontierScore =
            500 +
            unknownNeighbors * 14 +
            signalBonus +
            (r + c) * 3 -
            plan.cost * 5 -
            deadEndPenalty;

          candidates.push({
            type:
              signalBonus > 40 ? 'INVESTIGATE_SIGNAL' : 'EXPLORE_FRONTIER',
            target: { row: r, col: c },
            route: plan.path,
            score: frontierScore,
            explanation:
              signalBonus > 40
                ? `Investigating beacon signal frontier at (${r}, ${c})`
                : `Exploring unknown frontier at (${r}, ${c}) (+${unknownNeighbors} unseen tiles)`,
            avoidsHazard: plan.avoidsKnownHazard,
          });
        }
      }
    }

    if (candidates.length === 0) {
      return {
        objectiveType: 'EXPLORE_FRONTIER',
        target: null,
        route: [],
        explanation: 'No reachable frontier or objective available.',
      };
    }

    let anyCandidateAvoidedHazard = false;
    for (const cand of candidates) {
      if (cand.avoidsHazard) {
        anyCandidateAvoidedHazard = true;
        break;
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0];

    if (chosen.avoidsHazard || anyCandidateAvoidedHazard) {
      for (const hKey of knownHazards) {
        if (!countedMemoryAvoidHazards.has(hKey)) {
          countedMemoryAvoidHazards.add(hKey);
          memoryAvoidancesCount++;
          recordDecision(
            stepIndex,
            'MEMORY_ADAPT',
            `Memory active: A* penalized known Reset Trap at (${hKey}) & chose safe route`,
            currentPos
          );
        }
      }
    }

    return {
      objectiveType: chosen.type,
      target: chosen.target,
      route: chosen.route,
      explanation: chosen.explanation,
    };
  };

  // Initial observation at Spawn (0,0)
  if (priorMemory.knownHazards.length > 0 || priorMemory.verifiedDecoys.length > 0) {
    recordDecision(
      0,
      'MEMORY_ADAPT',
      `Attempt #${attemptNumber}: Retained memory of ${priorMemory.knownHazards.length} hazard(s) and ${priorMemory.verifiedDecoys.length} decoy(s).`
    );
  }

  const initObs = observeEnvironment(0);
  visitCounts.set(coordKey(currentPos.row, currentPos.col), 1);

  let currentPlan = selectNextObjectiveAndPlan(0);
  recordDecision(0, 'FRONTIER', currentPlan.explanation, currentPos);

  steps.push({
    stepIndex: 0,
    row: currentPos.row,
    col: currentPos.col,
    level: deckAt(topology, currentPos.row, currentPos.col),
    keyMask,
    switchMask,
    visionRadius: visibilityRadius,
    empRemainingTurns: 0,
    triggeredResetPositions: Array.from(disarmedHazards),
    event: 'START',
    tile: trueGrid[currentPos.row][currentPos.col],
    objectiveType: currentPlan.objectiveType,
    objectiveTarget: currentPlan.target,
    plannedRoute: currentPlan.route,
    visibleCells: initObs.visibleNow,
    discoveredCells: Array.from(knownMap.keys()),
    knownHazards: Array.from(knownHazards),
    verifiedDecoys: Array.from(verifiedDecoys),
    decisionLog: currentPlan.explanation,
  });

  for (let stepIdx = 1; stepIdx <= maxSteps; stepIdx++) {
    if (empRemainingTurns > 0) {
      empRemainingTurns--;
    }
    // Replan if current route is empty or next step is no longer passable
    if (
      currentPlan.route.length === 0 ||
      !canEnterTile(
        knownMap.get(
          coordKey(currentPlan.route[0].row, currentPlan.route[0].col)
        ) ?? 'WALL',
        keyMask,
        switchMask
      )
    ) {
      currentPlan = selectNextObjectiveAndPlan(stepIdx);
      if (currentPlan.route.length === 0) {
        break;
      }
      replanCount++;
      recordDecision(stepIdx, 'REPLAN', `Replanned: ${currentPlan.explanation}`);
    }

    const nextCoord = currentPlan.route.shift()!;
    const nextKey = coordKey(nextCoord.row, nextCoord.col);
    const trueTile = trueGrid[nextCoord.row][nextCoord.col];

    // If the AI tries to step onto a tile that wasn't passable (e.g. unexpected state), replan
    if (!canEnterTile(trueTile, keyMask, switchMask) ||
      !canTraverseDeck(topology, currentPos, nextCoord)) {
      knownMap.set(nextKey, trueTile);
      replanCount++;
      currentPlan = selectNextObjectiveAndPlan(stepIdx);
      recordDecision(
        stepIdx,
        'REPLAN',
        `Route blocked at (${nextCoord.row}, ${nextCoord.col}) — recalculating A* path`
      );
      continue;
    }

    const fromDeck = deckAt(topology, currentPos.row, currentPos.col);
    currentPos = { ...nextCoord };
    visitCounts.set(nextKey, (visitCounts.get(nextKey) ?? 0) + 1);

    if (
      currentPlan.objectiveType === 'EXPLORE_FRONTIER' ||
      currentPlan.objectiveType === 'INVESTIGATE_SIGNAL'
    ) {
      explorationSteps++;
    }

    let stepEvent: StepEventType =
      currentPlan.objectiveType === 'EXPLORE_FRONTIER'
        ? 'EXPLORE_FRONTIER'
        : 'MOVE';
    let decisionText = currentPlan.explanation;

    // Handle tile interactions in True World
    const keyBit = KEY_BITS[trueTile];
    if (keyBit !== undefined && (keyMask & keyBit) === 0) {
      keyMask |= keyBit;
      stepEvent = 'COLLECT_KEY';
      decisionText = `Collected ${TILE_CATALOG[trueTile].label} at (${currentPos.row}, ${currentPos.col})`;
      recordDecision(stepIdx, 'KEY_FOUND', decisionText, currentPos);
    } else if (DOOR_KEY_BITS[trueTile] !== undefined) {
      stepEvent = 'UNLOCK_DOOR';
      decisionText = `Unlocked ${TILE_CATALOG[trueTile].label} at (${currentPos.row}, ${currentPos.col})`;
      recordDecision(stepIdx, 'DOOR_UNLOCKED', decisionText, currentPos);
    } else if (trueTile === 'SWITCH_A') {
      switchMask ^= 1;
      switchToggleCounts.set(nextKey, (switchToggleCounts.get(nextKey) ?? 0) + 1);
      stepEvent = 'TOGGLE_SWITCH';
      decisionText = `Activated Pulse Switch at (${currentPos.row}, ${currentPos.col}) — gates toggled`;
      recordDecision(stepIdx, 'SWITCH_TOGGLED', decisionText, currentPos);
    } else if (trueTile === 'GATE_A_CLOSED' || trueTile === 'GATE_A_OPEN') {
      stepEvent = 'PASS_GATE';
      decisionText = `Traversed ${TILE_CATALOG[trueTile].label} at (${currentPos.row}, ${currentPos.col})`;
    } else if (trueTile === 'TRAP_RESET' && !disarmedHazards.has(nextKey)) {
      // Trap B: Warp Mine triggers once per attempt!
      trapsTriggeredCount++;
      trapPenaltySteps += stepIdx;
      disarmedHazards.add(nextKey);
      knownHazards.add(nextKey);
      knownMap.set(nextKey, 'TRAP_RESET');
      stepEvent = 'TRAP_RESET_TRIGGERED';
      decisionText = `WARP MINE DETONATED at (${currentPos.row}, ${currentPos.col})! Blasted back to Spawn (0,0). Coordinates locked in memory!`;
      recordDecision(stepIdx, 'TRAP_TRIGGERED', decisionText, currentPos);

      // Teleport AI back to START_POS
      currentPos = { ...START_POS };
      currentPlan.route = [];
    } else if (trueTile === 'EMP_SCRAMBLER' && !disarmedHazards.has(nextKey)) {
      empTriggeredCount++;
      trapsTriggeredCount++;
      disarmedHazards.add(nextKey);
      knownHazards.add(nextKey);
      knownMap.set(nextKey, 'EMP_SCRAMBLER');
      empRemainingTurns = 6;
      stepEvent = 'EMP_JAMMED';
      decisionText = `EMP JAMMER DETONATED at (${currentPos.row}, ${currentPos.col})! Lidar vision narrowed to R=1 for 6 turns!`;
      recordDecision(stepIdx, 'EMP_JAMMED', decisionText, currentPos);
      currentPlan.route = [];
    } else if (trueTile === 'PORTAL_A' && !usedPortalCoords.has(nextKey)) {
      const dest = findPortalDestination(trueGrid, currentPos.row, currentPos.col);
      if (dest) {
        portalsUsedCount++;
        usedPortalCoords.add(nextKey);
        usedPortalCoords.add(coordKey(dest.row, dest.col));
        stepEvent = 'PORTAL_WARP';
        decisionText = `QUANTUM WORMHOLE WARP from (${currentPos.row}, ${currentPos.col}) → (${dest.row}, ${dest.col})!`;
        recordDecision(stepIdx, 'PORTAL_WARP', decisionText, dest);
        currentPos = { ...dest };
        currentPlan.route = [];
      }
    } else if (trueTile === 'GRAVITY_MUD') {
      trapPenaltySteps += 2;
      stepEvent = 'GRAVITY_SLOW';
      decisionText = `Crossing Cryo-Stasis Field at (${currentPos.row}, ${currentPos.col}) (+2 energy drag)`;
    } else if (trueTile === 'DECOY_EXIT') {
      verifiedDecoys.add(nextKey);
      candidateSignals.delete(nextKey);
      knownMap.set(nextKey, 'DECOY_EXIT');
      stepEvent = 'DECOY_DISCOVERED';
      decisionText = `Decoy Exit at (${currentPos.row}, ${currentPos.col}) confirmed fake! Replanning.`;
      currentPlan.route = [];
    } else if (trueTile === 'EXIT') {
      stepEvent = 'EXIT';
      decisionText = `Reached True Escape Portal at (${currentPos.row}, ${currentPos.col})!`;
      recordDecision(stepIdx, 'ESCAPED', decisionText, currentPos);
    }
    const toDeck = deckAt(topology, currentPos.row, currentPos.col);
    if (fromDeck !== toDeck) {
      if (stepEvent === 'MOVE' || stepEvent === 'EXPLORE_FRONTIER') stepEvent = 'CHANGE_LEVEL';
      decisionText = `Lift transit: deck ${fromDeck} to deck ${toDeck}. ${decisionText}`;
      recordDecision(stepIdx, 'LEVEL_CHANGE', decisionText, currentPos);
    }

    // Observe from new position
    const obs = observeEnvironment(stepIdx);

    // If new critical info was discovered or trap reset occurred, dynamically replan!
    if (
      stepEvent !== 'EXIT' &&
      (obs.newlyRevealedImportant ||
        stepEvent === 'TRAP_RESET_TRIGGERED' ||
        stepEvent === 'COLLECT_KEY' ||
        stepEvent === 'TOGGLE_SWITCH' ||
        currentPlan.route.length === 0)
    ) {
      if (obs.newlyRevealedImportant || stepEvent === 'TRAP_RESET_TRIGGERED') {
        replanCount++;
      }
      currentPlan = selectNextObjectiveAndPlan(stepIdx);
    }

    steps.push({
      stepIndex: stepIdx,
      row: currentPos.row,
      col: currentPos.col,
      level: toDeck,
      keyMask,
      switchMask,
      visionRadius: empRemainingTurns > 0 ? 1 : visibilityRadius,
      empRemainingTurns,
      triggeredResetPositions: Array.from(disarmedHazards),
      event: stepEvent,
      tile: trueTile,
      objectiveType: currentPlan.objectiveType,
      objectiveTarget: currentPlan.target,
      plannedRoute: [...currentPlan.route],
      visibleCells: obs.visibleNow,
      discoveredCells: Array.from(knownMap.keys()),
      knownHazards: Array.from(knownHazards),
      verifiedDecoys: Array.from(verifiedDecoys),
      decisionLog: decisionText,
    });

    if (stepEvent === 'EXIT') {
      const solveTimeMs = Number((performance.now() - startTime).toFixed(3));
      return {
        escaped: true,
        attemptNumber,
        visibilityRadius,
        totalSteps: steps.length - 1,
        explorationSteps,
        trapPenaltySteps,
        replanCount,
        trapsTriggeredCount,
        decoysInvestigatedCount,
        portalsUsedCount,
        empTriggeredCount,
        memoryAvoidancesCount,
        discoveredPercent: Math.round(
          (knownMap.size / (GRID_ROWS * GRID_COLS)) * 100
        ),
        solveTimeMs,
        steps,
        decisionEvents,
        updatedMemory: {
          attemptCount: attemptNumber,
          knownHazards: Array.from(knownHazards),
          verifiedDecoys: Array.from(verifiedDecoys),
          deadEndCorridors: Array.from(deadEndCorridors),
        },
      };
    }
  }

  const solveTimeMs = Number((performance.now() - startTime).toFixed(3));
  return {
    escaped: false,
    attemptNumber,
    visibilityRadius,
    totalSteps: steps.length - 1,
    explorationSteps,
    trapPenaltySteps,
    replanCount,
    trapsTriggeredCount,
    decoysInvestigatedCount,
    portalsUsedCount,
    empTriggeredCount,
    memoryAvoidancesCount,
    discoveredPercent: Math.round(
      (knownMap.size / (GRID_ROWS * GRID_COLS)) * 100
    ),
    solveTimeMs,
    steps,
    decisionEvents,
    updatedMemory: {
      attemptCount: attemptNumber,
      knownHazards: Array.from(knownHazards),
      verifiedDecoys: Array.from(verifiedDecoys),
      deadEndCorridors: Array.from(deadEndCorridors),
    },
    reason: 'Autonomous agent reached maximum exploration step limit.',
  };
}
