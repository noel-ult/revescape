import { cloneGrid, computeGridStats, isAnchorCell, parseShorthandGrid } from './board';
import { MAX_BUDGET, TILE_CATALOG } from './constants';
import { Coordinate, Grid, TileType } from './types';
import { validDeckAccess } from './levels';

export interface FacilityModule {
  id: string;
  name: string;
  description: string;
  color: string;
  cells: Array<Coordinate & { tile: TileType }>;
}

const cells = (rows: string[]): FacilityModule['cells'] =>
  parseShorthandGrid(rows).flatMap((row, r) =>
    row.flatMap((tile, c) => tile === 'EMPTY' ? [] : [{ row: r, col: c, tile }]));

export const FACILITY_MODULES: FacilityModule[] = [
  {
    id: 'security', name: 'Security wing', color: '#ffb66b',
    description: 'A sealed bulkhead, access core, and two enclosing walls. Shape a secure route.',
    cells: cells(['# R #', '. . .', '. r .']),
  },
  {
    id: 'portal', name: 'Transit chamber', color: '#b59aff',
    description: 'Two connected warp rings with a partition. Fold the route through your facility.',
    cells: cells(['P # .', '. # .', '. . P']),
  },
  {
    id: 'cryo', name: 'Cryo laboratory', color: '#83e4ed',
    description: 'Containment walls around a slowing coolant field. Make the AI choose a detour.',
    cells: cells(['# # #', '. M .', '. M .']),
  },
  {
    id: 'signal', name: 'Signal observatory', color: '#f3a2cf',
    description: 'A false extraction tower behind an EMP approach. Disorient the scout.',
    cells: cells(['# D #', '. . .', '. J .']),
  },
  {
    id: 'airlock', name: 'Phase airlock', color: '#a8b7ff',
    description: 'A switch-operated gate and a control terminal. Build a changing passage.',
    cells: cells(['# X #', '. . .', '. w .']),
  },
  {
    id: 'partition', name: 'Gallery partition', color: '#a2c7dd',
    description: 'An architectural corner. Divide open space into corridors and chambers.',
    cells: cells(['# # #', '# . .', '# . .']),
  },
  {
    id: 'annex-a', name: 'Aerial annex lift', color: '#8ef3cd',
    description: 'Connect a base-floor space next to the eastern aerial deck. Its four raised sectors become playable.',
    cells: cells(['. . .', '. U .', '. . .']),
  },
  {
    id: 'annex-b', name: 'Sky observatory lift', color: '#ffc581',
    description: 'Connect a base-floor space next to the western high deck. Only its access lift allows crossing.',
    cells: cells(['. . .', '. V .', '. . .']),
  },
];

export function moduleFootprint(module: FacilityModule, row: number, col: number, rotation: number) {
  return module.cells.map((cell) => {
    let r = cell.row;
    let c = cell.col;
    for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) [r, c] = [c, 2 - r];
    return { row: row + r - 1, col: col + c - 1, tile: cell.tile };
  });
}

/** Placement is atomic; a rejected module never overwrites any part of a draft. */
export function placeFacilityModule(
  grid: Grid, module: FacilityModule, row: number, col: number, rotation = 0
): { grid: Grid; error?: string } {
  const footprint = moduleFootprint(module, row, col, rotation);
  const next = cloneGrid(grid);
  for (const cell of footprint) {
    if (cell.row < 0 || cell.row >= 8 || cell.col < 0 || cell.col >= 8)
      return { grid, error: 'The whole module must fit inside the facility.' };
    if (isAnchorCell(cell.row, cell.col))
      return { grid, error: 'Keep the deployment and extraction platforms clear.' };
    if (grid[cell.row][cell.col] !== 'EMPTY')
      return { grid, error: 'This module overlaps existing architecture. Choose open space or erase first.' };
    if (!validDeckAccess(cell.tile, cell.row, cell.col))
      return { grid, error: 'Place the lift on the main floor directly beside its matching raised platform.' };
    next[cell.row][cell.col] = cell.tile;
  }
  const stats = computeGridStats(next);
  if (stats.budgetUsed > MAX_BUDGET)
    return { grid, error: 'Not enough energy for this module. Remove a structure first.' };
  for (const [tile, count] of Object.entries(stats.tileCounts)) {
    if (count > TILE_CATALOG[tile as TileType].maxCount)
      return { grid, error: `${TILE_CATALOG[tile as TileType].label} capacity reached.` };
  }
  return { grid: next };
}

/** An editable starting point, evaluated by the same engine as user rooms. */
export const SHOWCASE_FACILITY = parseShorthandGrid([
  'S . P . . . . .',
  '# # . # U . . .',
  '. . . . . r # .',
  '. # # # . . . .',
  '. . P . . M . .',
  '# . . V . M . .',
  '. . c . . # # #',
  '. . . # . R C E',
]);
