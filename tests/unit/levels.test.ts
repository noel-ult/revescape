import { describe, expect, it } from 'vitest';
import { planRouteAStar, runAutonomousAgent } from '../../src/shared/agent';
import { cloneGrid, createEmptyGrid } from '../../src/shared/board';
import { FACILITY_MODULES, placeFacilityModule, SHOWCASE_FACILITY } from '../../src/shared/facility';
import { canTraverseDeck, deckAt, getDeckTopology, validDeckAccess } from '../../src/shared/levels';
import { solveBoardBFS } from '../../src/shared/solver';
import { Coordinate, TileType } from '../../src/shared/types';
import { validateBoard } from '../../src/shared/validator';

const annexes = [
  { tile: 'ELEVATOR_A' as const, module: 'annex-a', access: { row: 1, col: 4 }, outside: { row: 0, col: 5 }, inside: { row: 1, col: 5 }, level: 1 },
  { tile: 'ELEVATOR_B' as const, module: 'annex-b', access: { row: 5, col: 3 }, outside: { row: 4, col: 2 }, inside: { row: 5, col: 2 }, level: 2 },
];

const key = (p: Coordinate) => `${p.row},${p.col}`;

describe('Playable raised decks', () => {
  it.each(annexes)('$tile placement must be on the main floor beside its own annex', ({ tile, module, access, inside }) => {
    const empty = createEmptyGrid();
    const lift = FACILITY_MODULES.find(entry => entry.id === module)!;
    expect(placeFacilityModule(empty, lift, access.row, access.col).error).toBeUndefined();
    for (const position of [inside, { row: 3, col: 3 }, { row: -1, col: 4 }]) {
      expect(validDeckAccess(tile, position.row, position.col)).toBe(false);
      const rejected = placeFacilityModule(empty, lift, position.row, position.col);
      expect(rejected.error).toBeTruthy();
      expect(rejected.grid).toBe(empty);
    }
    const invalid = cloneGrid(empty);
    invalid[inside.row][inside.col] = tile;
    expect(validateBoard(invalid).errors).toContainEqual(expect.stringMatching(/must stand on the main floor/));
    const duplicate = cloneGrid(empty);
    duplicate[access.row][access.col] = tile;
    duplicate[access.row - 1][access.col + (tile === 'ELEVATOR_A' ? 1 : -1)] = tile;
    expect(validateBoard(duplicate).errors).toContainEqual(expect.stringMatching(/limit exceeded/));
  });

  it.each(annexes)('$tile permits only its legal entry and return, with no diagonal or non-lift crossings', ({ tile, access, outside, inside, level }) => {
    const grid = createEmptyGrid();
    grid[access.row][access.col] = tile;
    const topology = getDeckTopology(grid);
    expect(deckAt(topology, inside.row, inside.col)).toBe(level);
    expect(canTraverseDeck(topology, outside, inside)).toBe(false);
    expect(canTraverseDeck(topology, inside, outside)).toBe(false);
    expect(canTraverseDeck(topology, access, inside)).toBe(true);
    expect(canTraverseDeck(topology, inside, access)).toBe(true);
    expect(canTraverseDeck(topology, access, { row: access.row + 1, col: access.col + 1 })).toBe(false);
  });

  it.each(annexes)('A* uses $tile rather than a shorter illegal boundary crossing, and cannot use an unobserved lift', ({ tile, access, outside, inside }) => {
    const grid = createEmptyGrid();
    grid[access.row][access.col] = tile;
    const topology = getDeckTopology(grid);
    const known = new Map<string, TileType>(grid.flatMap((row, r) => row.map((value, c) => [`${r},${c}`, value] as const)));
    const plan = () => planRouteAStar(outside, inside, known, 0, 0, new Set(), new Set(), new Map(), topology);
    const route = plan()!;
    expect(route.path).toContainEqual(access);
    expect(route.path.length).toBeGreaterThan(1);
    expect(route.cost).toBe(route.path.length + 2);
    const path = [outside, ...route.path];
    for (let i = 1; i < path.length; i++) expect(canTraverseDeck(topology, path[i - 1], path[i])).toBe(true);
    known.delete(key(access));
    expect(plan()).toBeNull();
  });

  it.each(annexes)('BFS cannot reach a required annex key by bypassing a blocked $tile', ({ tile, access, inside, level }) => {
    const grid = createEmptyGrid();
    grid[access.row][access.col] = tile;
    grid[inside.row][inside.col] = 'KEY_RED';
    grid[7][6] = 'DOOR_RED';
    grid[6][7] = 'WALL';
    const topology = getDeckTopology(grid);
    const open = solveBoardBFS(grid);
    expect(open.solvable).toBe(true);
    expect(open.steps.some(step => step.level === level && step.event === 'COLLECT_KEY')).toBe(true);
    for (let i = 1; i < open.steps.length; i++) expect(canTraverseDeck(topology, open.steps[i - 1], open.steps[i])).toBe(true);
    for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      const r = access.row + dr, c = access.col + dc;
      if (deckAt(topology, r, c) === 0) grid[r][c] = 'WALL';
    }
    const blocked = solveBoardBFS(grid);
    expect(blocked.solvable).toBe(false);
    expect(blocked.exploredCells.some(cell => deckAt(topology, cell.row, cell.col) === level)).toBe(false);
  });

  it('the starter scout visits both raised decks and returns through their lifts, deterministically', () => {
    const result = runAutonomousAgent(SHOWCASE_FACILITY);
    const topology = getDeckTopology(SHOWCASE_FACILITY);
    expect(result.escaped).toBe(true);
    expect(new Set(result.steps.map(step => step.level))).toEqual(new Set([0, 1, 2]));
    expect(result.decisionEvents.filter(event => event.type === 'LEVEL_CHANGE')).toHaveLength(4);
    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      expect(step.level).toBe(deckAt(topology, step.row, step.col));
      if (step.event !== 'PORTAL_WARP') expect(canTraverseDeck(topology, result.steps[i - 1], step)).toBe(true);
    }
    expect(runAutonomousAgent(SHOWCASE_FACILITY).steps).toEqual(result.steps);
    expect(result.steps[0].discoveredCells).not.toContain('2,5');
    expect(result.steps[0].discoveredCells).not.toContain('6,2');
  });
});
