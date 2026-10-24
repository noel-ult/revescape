import { EXIT_POS, GRID_COLS, GRID_ROWS, START_POS, TILE_CATALOG } from './constants';
import { AgentMemory, Coordinate, Grid, PresetBoard, TileType } from './types';

export function createEmptyGrid(): Grid {
  const grid: Grid = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => 'EMPTY' as TileType)
  );
  grid[START_POS.row][START_POS.col] = 'START';
  grid[EXIT_POS.row][EXIT_POS.col] = 'EXIT';
  return grid;
}

export function createEmptyMemory(): AgentMemory {
  return {
    attemptCount: 0,
    knownHazards: [],
    verifiedDecoys: [],
    deadEndCorridors: [],
  };
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

export function isAnchorCell(row: number, col: number): boolean {
  return (
    (row === START_POS.row && col === START_POS.col) ||
    (row === EXIT_POS.row && col === EXIT_POS.col)
  );
}

export function findPortalDestination(
  grid: Grid,
  fromRow: number,
  fromCol: number
): Coordinate | null {
  if (grid[fromRow]?.[fromCol] !== 'PORTAL_A') return null;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] === 'PORTAL_A' && (r !== fromRow || c !== fromCol)) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function computeGridStats(grid: Grid): {
  budgetUsed: number;
  tilesPlaced: number;
  tileCounts: Record<TileType, number>;
} {
  const tileCounts = Object.keys(TILE_CATALOG).reduce((acc, key) => {
    acc[key as TileType] = 0;
    return acc;
  }, {} as Record<TileType, number>);

  let budgetUsed = 0;
  let tilesPlaced = 0;

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const tile = grid[r][c];
      if (tileCounts[tile] !== undefined) {
        tileCounts[tile]++;
      }
      const meta = TILE_CATALOG[tile];
      if (meta && meta.cost > 0) {
        budgetUsed += meta.cost;
        tilesPlaced++;
      }
    }
  }

  return { budgetUsed, tilesPlaced, tileCounts };
}

export function parseShorthandGrid(rows: string[]): Grid {
  const codeMap: Record<string, TileType> = {
    '.': 'EMPTY',
    S: 'START',
    E: 'EXIT',
    '#': 'WALL',
    r: 'KEY_RED',
    R: 'DOOR_RED',
    c: 'KEY_CYAN',
    C: 'DOOR_CYAN',
    g: 'KEY_GOLD',
    G: 'DOOR_GOLD',
    w: 'SWITCH_A',
    X: 'GATE_A_CLOSED',
    O: 'GATE_A_OPEN',
    D: 'DECOY_EXIT',
    T: 'TRAP_RESET',
    P: 'PORTAL_A',
    J: 'EMP_SCRAMBLER',
    M: 'GRAVITY_MUD',
    U: 'ELEVATOR_A',
    V: 'ELEVATOR_B',
  };

  return rows.map((rowStr) =>
    rowStr
      .trim()
      .split(/\s+/)
      .map((token) => codeMap[token] ?? 'EMPTY')
  );
}

export const PRESET_BOARDS: PresetBoard[] = [
  {
    id: 'mind-wars-deception',
    name: 'Mirage containment complex',
    subtitle: 'Decoy observatory + reset field',
    description:
      'A false extraction signal draws the scout through a reset field. Compare fresh exploration with an attempt that remembers the deception.',
    grid: parseShorthandGrid([
      'S . T . . . . D',
      '. # # # # . . .',
      '. . . . . . # r',
      '# # # . . # # .',
      'c . . . . . . .',
      '. . # # # R # #',
      '. . . . . . C .',
      '. . . . . . # E',
    ]),
  },
  {
    id: 'key-lock-gauntlet',
    name: 'Chromatic security vault',
    subtitle: 'Three access cores + security bulkheads',
    description:
      'Forces the AI to explore unknown frontiers to locate the Crimson, Cobalt, and Solar keys before unlocking the final security bulkheads.',
    grid: parseShorthandGrid([
      'S . . # . . . c',
      '# # . # . # # .',
      'r . . # . . R .',
      '. . . # . . # .',
      '. . . . . . # .',
      '# # # # # C # #',
      'g . . . . . # .',
      '. . . . . . G E',
    ]),
  },
  {
    id: 'switch-gate-paradox',
    name: 'Cryogenic phase laboratory',
    subtitle: 'Phase airlock + coolant field',
    description:
      'Uses an Open Gate and Closed Gate controlled by a Phase Inverter Pad alongside Cryo-Stasis fields to test dynamic A* cost replanning.',
    grid: parseShorthandGrid([
      'S . . O . . . r',
      '# # . # # # . .',
      'w . . M . . R .',
      '. . . . . . # .',
      '# # # X # # # #',
      'c . . . . . . .',
      '. . . . . # . .',
      '. . . . . . C E',
    ]),
  },
];
