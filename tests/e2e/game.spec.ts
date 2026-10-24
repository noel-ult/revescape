import { expect, test } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { SHOWCASE_FACILITY } from '../../src/shared/facility';

// Project a visible sector into the Plan camera, then exercise the real pointer picker.
async function clickSector(page: import('@playwright/test').Page, row: number, col: number, level = 0) {
  const canvas = page.locator('canvas[data-ready="true"]');
  const bounds = (await canvas.boundingBox())!;
  const aspect = bounds.width / bounds.height;
  const camera = new PerspectiveCamera(aspect < 1.25 ? 48 : 39, aspect, 0.1, 100);
  camera.position.set(0, aspect < 1.1 ? 25 : 21, 0.01);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const position = new Vector3(col - 3.5, 0, row - 3.5);
  if (level === 1) position.add(new Vector3(3.4, 1.45, -1.6));
  if (level === 2) position.add(new Vector3(-3.4, 2.65, 2.1));
  position.project(camera);
  await canvas.click({ position: { x: (position.x + 1) * bounds.width / 2, y: (1 - position.y) * bounds.height / 2 } });
}

test.describe('Reverse Escape — Humans vs AI E2E Verification', () => {
  test('3D studio: place a module, undo, restore, and follow a moving scout', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByTestId('solo-challenge-btn').click();
    const canvas = page.locator('canvas[data-ready="true"]');
    await expect(canvas).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByTestId('module-security').click();
    await page.getByRole('button', { name: /Rotate module/ }).click();
    await page.getByRole('button', { name: 'top camera' }).click();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(page.getByTestId('budget-indicator')).toHaveText('6/30');
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(page.getByRole('status').filter({ hasText: 'overlaps' })).toBeVisible();
    await expect(page.getByTestId('budget-indicator')).toHaveText('6/30');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('budget-indicator')).toHaveText('0/30');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByTestId('budget-indicator')).toHaveText('6/30');
    await page.getByRole('button', { name: 'Save design' }).click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'Restore saved facility' }).click();
    await expect(page.getByTestId('budget-indicator')).toHaveText('6/30');
    await page.getByTestId('preset-showcase').click();
    await page.getByTestId('test-room-btn').click();
    await page.getByRole('button', { name: 'follow camera' }).click();
    await expect(page.getByRole('button', { name: 'follow camera' })).toHaveAttribute('aria-pressed', 'true');
    // A position between navigation centers proves that the displayed robot interpolates.
    await expect.poll(async () => {
      const coords = (await canvas.getAttribute('data-agent-position'))!.split(',').map(Number);
      return coords.some(value => Math.abs(value + 3.5 - Math.round(value + 3.5)) > 0.05);
    }, { intervals: [50], timeout: 5000 }).toBe(true);
    await page.getByRole('button', { name: 'Back to building' }).click();
    await page.getByRole('button', { name: 'Explore yourself' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('Your Human Moves:').locator('..')).toContainText('1');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Solo Challenge flow: load preset, test room, unleash AI, and verify score breakdown', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('REVERSE');
    await page.getByTestId('solo-challenge-btn').click();

    // Load Key & Lock Gauntlet preset
    await page.getByTestId('preset-key-lock-gauntlet').click();
    await expect(page.getByTestId('budget-indicator')).toContainText('30/30');
    await expect(page.getByTestId('validation-status-box')).toContainText(
      'ROOM VALID & SOLVABLE'
    );

    // Trigger local AI test preview
    await page.getByTestId('test-room-btn').click();

    // Submit room to AI Escape Arena
    await page.getByTestId('submit-room-btn').click();
    await expect(page.getByTestId('arena-heading')).toContainText(
      'AI ESCAPE ARENA'
    );

    // Advance to final results
    await page.getByTestId('view-results-btn').click();
    await expect(page.getByTestId('results-banner')).toBeVisible();
    const scoreText = await page
      .getByTestId('player-total-score-SOLO')
      .textContent();
    expect(Number(scoreText)).toBeGreaterThan(300);
  });

  test('manual exploration blocks deck edges and uses both legal lift bridges', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('solo-challenge-btn').click();
    await page.getByRole('button', { name: 'Explore yourself' }).click();
    const dialog = page.getByRole('dialog');
    const canvas = dialog.locator('canvas[data-ready="true"]');
    await expect(canvas).toBeVisible();
    const move = async (direction: string, moves: number, level: number, blocked = false) => {
      // Human input intentionally has a 190ms repeat guard; hold each key past it.
      await page.keyboard.press(direction, { delay: 210 });
      await expect(dialog.getByText('Your Human Moves:').locator('..').locator('span').last()).toHaveText(String(moves));
      await expect(canvas).toHaveAttribute('data-agent-level', String(level));
      if (blocked) await expect(dialog.getByText(/Find its lift bridge/)).toBeVisible();
    };
    await move('ArrowRight', 1, 0);
    await move('ArrowRight', 2, 0); // Portal lands beside, rather than on, deck 2.
    await move('ArrowDown', 2, 0, true);
    await move('ArrowRight', 3, 0);
    await move('ArrowDown', 4, 0);
    await move('ArrowLeft', 5, 2);
    await move('ArrowLeft', 6, 2);
    await move('ArrowUp', 6, 2, true);
    await move('ArrowRight', 7, 2);
    await move('ArrowRight', 8, 0);
    await move('ArrowUp', 9, 0);
    await move('ArrowRight', 10, 0);
    await move('ArrowUp', 11, 0);
    await move('ArrowUp', 12, 0);
    await move('ArrowRight', 12, 0, true);
    await move('ArrowUp', 13, 0);
    await move('ArrowRight', 14, 1);
    await move('ArrowUp', 14, 1, true);
    await move('ArrowLeft', 15, 0);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`raised 3D placement and scout elevation at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      await page.getByTestId('solo-challenge-btn').click();
      const canvas = page.locator('canvas[data-ready="true"]');
      await expect(canvas).toBeVisible();
      await page.getByRole('button', { name: 'top camera' }).click();
      await page.getByRole('button', { name: 'Components', exact: true }).click();
      await page.getByTestId('tool-EMPTY').click();
      await clickSector(page, 2, 5, 1); // Remove the raised red key by pointing at its hardware.
      await expect(page.getByTestId('budget-indicator')).toHaveText('26/30');
      await page.getByTestId('tool-KEY_RED').click();
      await clickSector(page, 2, 5, 1); // Replace it on the raised empty surface.
      await expect(page.getByTestId('budget-indicator')).toHaveText('28/30');
      await page.getByTestId('tool-EMPTY').click();
      await clickSector(page, 6, 2, 2);
      await expect(page.getByTestId('budget-indicator')).toHaveText('26/30');
      await page.getByTestId('tool-KEY_CYAN').click();
      await clickSector(page, 6, 2, 2);
      await expect(page.getByTestId('budget-indicator')).toHaveText('28/30');
      await page.getByRole('button', { name: 'Save design' }).click();
      const saved = await page.evaluate(() => localStorage.getItem('facility-design'));
      // Verify edits changed the intended raised sectors, rather than hidden main-floor cells.
      expect(JSON.parse(saved!)).toEqual(SHOWCASE_FACILITY);
      await expect(page.getByTestId('validation-status-box')).toContainText('ROOM VALID & SOLVABLE');
      // Observe every rendered frame inside the page. Driver round trips can miss a
      // 480ms ascent on software WebGL, even though the robot animates correctly.
      await canvas.evaluate(element => {
        const observed = new Set<number>();
        new MutationObserver(() => {
          const level = Number(element.getAttribute('data-agent-level'));
          const height = Number(element.getAttribute('data-agent-height'));
          if ((level === 1 || level === 2) && height > 0.05 && height < (level === 1 ? 1.45 : 2.65) - 0.05) {
            observed.add(level);
            element.setAttribute('data-observed-lifts', [...observed].sort().join(','));
          }
        }).observe(element, { attributes: true, attributeFilter: ['data-agent-height'] });
      });
      await page.getByTestId('test-room-btn').click();
      await page.getByRole('button', { name: 'follow camera' }).click();
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveAttribute('data-observed-lifts', '1,2', { timeout: 28000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  test('Online PvP Multiplayer: 2 players join via room code, build traps, watch AI Escape, and see winner + rematch', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/');
    await pageB.goto('/');

    // Player A sets name and creates lobby
    await pageA.getByTestId('player-name-input').fill('AliceTrap');
    await pageA.getByTestId('create-lobby-btn').click();

    const roomCodeEl = pageA.getByTestId('lobby-room-code');
    await expect(roomCodeEl).toBeVisible();
    const roomCode = (await roomCodeEl.textContent())?.trim() || '';
    expect(roomCode.length).toBe(6);

    // Player B sets name and joins using roomCode
    await pageB.getByTestId('player-name-input').fill('BobMaze');
    await pageB.getByTestId('join-code-input').fill(roomCode);
    await pageB.getByTestId('join-lobby-btn').click();

    // Both players see each other in the lobby
    await expect(pageA.getByTestId('lobby-slot-1')).toContainText('BobMaze');
    await expect(pageB.getByTestId('lobby-slot-0')).toContainText('AliceTrap');

    // Both players click Ready
    await pageA.getByTestId('lobby-ready-btn').click();
    await pageB.getByTestId('lobby-ready-btn').click();

    // Both transition to BUILDING phase
    await expect(pageA.getByTestId('build-timer')).toBeVisible();
    await expect(pageB.getByTestId('build-timer')).toBeVisible();

    // Player A loads a validated security facility.
    await pageA.getByTestId('preset-key-lock-gauntlet').click();
    await pageA.getByTestId('submit-room-btn').click();

    // Player B sees that AliceTrap has locked & submitted
    await expect(pageB.getByTestId('opponent-status-pill')).toContainText(
      'LOCKED & SUBMITTED!'
    );

    // Player B submits the simpler empty facility.
    await pageB.getByTestId('submit-room-btn').click();

    // Both transition to AI Escape Arena showing both P1 and P2 boards
    await expect(pageA.getByTestId('arena-heading')).toContainText(
      'AI ESCAPE ARENA'
    );
    await expect(pageB.getByTestId('arena-heading')).toContainText(
      'AI ESCAPE ARENA'
    );
    await expect(pageA.getByTestId('arena-player-card-P1')).toBeVisible();
    await expect(pageA.getByTestId('arena-player-card-P2')).toBeVisible();
    await expect(pageA.locator('canvas[data-ready="true"]')).toHaveCount(2);
    await expect(pageB.locator('canvas[data-ready="true"]')).toHaveCount(2);
    await expect(pageA.getByText(/Remodel & re-run/)).toHaveCount(0);

    // Advance to Results
    await pageA.getByTestId('view-results-btn').click();

    await expect(pageA.getByTestId('winner-headline')).toContainText(
      'AliceTrap WINS!'
    );
    await expect(pageB.getByTestId('winner-headline')).toContainText(
      'AliceTrap WINS!'
    );
    await expect(pageB.getByTestId('player-total-score-P1')).toHaveText(
      (await pageA.getByTestId('player-total-score-P1').textContent())!
    );

    // Verify Rematch returns both players to Building phase
    await pageA.getByTestId('rematch-btn').click();
    await expect(pageA.getByTestId('build-timer')).toBeVisible();
    await expect(pageB.getByTestId('build-timer')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
