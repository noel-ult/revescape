import { Coordinate, Grid, TileType } from './types';

export type Deck = 0 | 1 | 2;
export interface DeckTopology {
  accessA: Coordinate | null;
  accessB: Coordinate | null;
}

const ANNEX_A = (row: number, col: number) =>
  row >= 1 && row <= 2 && col >= 5 && col <= 6;
const ANNEX_B = (row: number, col: number) =>
  row >= 5 && row <= 6 && col >= 1 && col <= 2;
const around = (row: number, col: number, zone: (r: number, c: number) => boolean) =>
  [[-1, 0], [0, 1], [1, 0], [0, -1]].some(([dr, dc]) => zone(row + dr, col + dc));

export function validDeckAccess(tile: TileType, row: number, col: number): boolean {
  if (tile !== 'ELEVATOR_A' && tile !== 'ELEVATOR_B') return true;
  if (row < 0 || row >= 8 || col < 0 || col >= 8 || ANNEX_A(row, col) || ANNEX_B(row, col))
    return false;
  return tile === 'ELEVATOR_A' ? around(row, col, ANNEX_A) : around(row, col, ANNEX_B);
}

/** The positions of visible access machinery are public; room contents are not. */
export function getDeckTopology(grid: Grid): DeckTopology {
  const result: DeckTopology = { accessA: null, accessB: null };
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    if (grid[row]?.[col] === 'ELEVATOR_A') result.accessA = { row, col };
    if (grid[row]?.[col] === 'ELEVATOR_B') result.accessB = { row, col };
  }
  return result;
}

export function deckAt(topology: DeckTopology, row: number, col: number): Deck {
  if (topology.accessA && ANNEX_A(row, col)) return 1;
  if (topology.accessB && ANNEX_B(row, col)) return 2;
  return 0;
}

export function canTraverseDeck(topology: DeckTopology, from: Coordinate, to: Coordinate): boolean {
  if (Math.abs(from.row - to.row) + Math.abs(from.col - to.col) !== 1) return false;
  const fromDeck = deckAt(topology, from.row, from.col);
  const toDeck = deckAt(topology, to.row, to.col);
  if (fromDeck === toDeck) return true;
  const access = (fromDeck === 1 || toDeck === 1) ? topology.accessA : topology.accessB;
  if (!access || (fromDeck !== 0 && toDeck !== 0)) return false;
  return (from.row === access.row && from.col === access.col) ||
    (to.row === access.row && to.col === access.col);
}
