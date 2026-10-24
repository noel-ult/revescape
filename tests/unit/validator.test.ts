import { describe, expect, it } from 'vitest';
import { cloneGrid, createEmptyGrid, PRESET_BOARDS } from '../../src/shared/board';
import { validateBoard } from '../../src/shared/validator';
import { FACILITY_MODULES, moduleFootprint, placeFacilityModule, SHOWCASE_FACILITY } from '../../src/shared/facility';

describe('Server-Authoritative Board Validator', () => {
  it('validates a standard empty board as valid', () => {
    const grid = createEmptyGrid();
    const res = validateBoard(grid);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.budgetUsed).toBe(0);
  });

  it('rejects boards where START or EXIT are overwritten', () => {
    const grid = createEmptyGrid();
    grid[0][0] = 'WALL';
    const res = validateBoard(grid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Start position'))).toBe(true);
  });

  it('rejects boards exceeding component maxCount or budget limit', () => {
    const grid = createEmptyGrid();
    grid[0][1] = 'KEY_RED';
    grid[0][2] = 'KEY_RED'; // maxCount for KEY_RED is 1
    const res = validateBoard(grid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Crimson Key limit exceeded'))).toBe(true);
  });

  it('validates all built-in preset boards within the 30-point budget', () => {
    for (const preset of PRESET_BOARDS) {
      const res = validateBoard(cloneGrid(preset.grid));
      expect(res.valid, `Preset ${preset.name} errors: ${res.errors.join(', ')}`).toBe(true);
      expect(res.budgetUsed).toBeLessThanOrEqual(30);
    }
  });

  it('keeps every rotated facility module playable and treats placement as one atomic operation', () => {
    for (const module of FACILITY_MODULES) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const original = createEmptyGrid();
        const location = module.id === 'annex-a' ? { row: 1, col: 4 } :
          module.id === 'annex-b' ? { row: 5, col: 3 } : { row: 3, col: 3 };
        const placed = placeFacilityModule(original, module, location.row, location.col, rotation);
        expect(placed.error).toBeUndefined();
        expect(validateBoard(placed.grid).valid, `${module.id}, rotation ${rotation}`).toBe(true);
        expect(original).toEqual(createEmptyGrid());
        const overlap = placeFacilityModule(placed.grid, module, location.row, location.col, rotation);
        expect(overlap.error).toMatch(/overlaps/);
        expect(overlap.grid).toBe(placed.grid);
      }
      expect(moduleFootprint(module, 3, 3, 4)).toEqual(moduleFootprint(module, 3, 3, 0));
    }
  });

  it('rejects module placement outside the facility, on anchors, beyond capacity or over budget without losing a draft', () => {
    const empty = createEmptyGrid();
    expect(placeFacilityModule(empty, FACILITY_MODULES[0], 0, 0).error).toBeTruthy();
    expect(placeFacilityModule(empty, FACILITY_MODULES[0], 1, 1).error).toMatch(/platforms/);
    const first = placeFacilityModule(empty, FACILITY_MODULES[0], 2, 2).grid;
    const duplicateKey = placeFacilityModule(first, FACILITY_MODULES[0], 5, 5);
    expect(duplicateKey.error).toMatch(/capacity/);
    expect(duplicateKey.grid).toBe(first);
    const full = createEmptyGrid();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if ((r < 2 || r > 4 || c < 2 || c > 4) && full[r][c] === 'EMPTY') full[r][c] = 'WALL';
    }
    const overBudget = placeFacilityModule(full, FACILITY_MODULES[0], 3, 3);
    expect(overBudget.error).toMatch(/energy/);
    expect(overBudget.grid).toBe(full);
  });

  it('starts the architectural demo with actual portal traversal, key collection and a security door', () => {
    const result = validateBoard(SHOWCASE_FACILITY);
    expect(result.valid, result.errors.join(', ')).toBe(true);
    expect(result.budgetRemaining).toBeGreaterThanOrEqual(0);
    expect(result.agentResult?.escaped).toBe(true);
    const events = result.agentResult!.steps.map(step => step.event);
    expect(events).toContain('PORTAL_WARP');
    expect(events).toContain('COLLECT_KEY');
    expect(events).toContain('UNLOCK_DOOR');
    expect(result.agentResult!.steps.filter(step => step.event === 'CHANGE_LEVEL').length).toBeGreaterThanOrEqual(4);
    expect(events.at(-1)).toBe('EXIT');
  });
});
