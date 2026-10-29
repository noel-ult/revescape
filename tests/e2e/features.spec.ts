import { expect, test } from '@playwright/test';
import { EXPEDITION_STORAGE_KEY } from '../../src/shared/expedition';
import { moveHuman, spawnHuman } from '../../src/shared/movement';
import { solveBoardBFS } from '../../src/shared/solver';

test('AI ghost: countdown, visible opponent, completed escape and saved campaign stars on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByTestId('sector-map-btn').click();
  await page.getByTestId('ghost-race-btn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('ghost-status')).toContainText('Race starts in');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByTestId('human-moves')).toHaveText('0');
  await expect(dialog.getByTestId('ghost-status')).toContainText('AI ghost:');
  const canvas = dialog.locator('canvas[data-ready="true"]');
  await expect.poll(() => canvas.getAttribute('data-opponent-position')).not.toBe('');
  const movementBounds = (await dialog.getByRole('button', { name: 'Move down', exact: true }).boundingBox())!;
  const dialogBounds = (await dialog.boundingBox())!;
  expect(movementBounds.y + movementBounds.height).toBeLessThanOrEqual(Math.min(844, dialogBounds.y + dialogBounds.height));
  for (let i = 0; i < 14; i++) await page.keyboard.press(i < 7 ? 'ArrowRight' : 'ArrowDown', { delay: 210 });
  await expect(dialog.getByText('Sector extraction complete.')).toBeVisible();
  await expect(dialog.getByTestId('ghost-status')).toContainText(/You beat|finished first|draw/);
  await expect(dialog.getByRole('button', { name: 'Race this ghost again' })).toBeVisible();
  await page.screenshot({ path: '/tmp/revescape-ghost-mobile.png' });
  await dialog.getByRole('button', { name: 'Continue to sector map' }).click();
  await expect(page.getByLabel('3 of 3 stars')).toBeVisible();
  const progress = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), EXPEDITION_STORAGE_KEY);
  expect(progress.rewards['exp-dock'].stars).toBe(3);
  await page.reload(); await page.getByTestId('sector-map-btn').click();
  await expect(page.getByLabel('3 of 3 stars')).toBeVisible();
});

test('shared facility: open a validated studio link in a separate browser and remix the exact layout', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const creator = await a.newPage(), friend = await b.newPage();
  await creator.goto('/'); await creator.getByTestId('solo-challenge-btn').click();
  await creator.getByTestId('share-facility-btn').click();
  const link = await creator.getByRole('textbox', { name: 'Playable facility link' }).inputValue();
  expect(link).toContain('?blueprint=v1-');
  await friend.goto(link);
  await expect(friend.getByRole('heading', { name: 'Can you escape this facility?' })).toBeVisible();
  await expect(friend.getByText('28/30 energy', { exact: false })).toBeVisible();
  await friend.getByRole('button', { name: 'Play shared facility', exact: true }).click();
  await expect(friend.getByRole('dialog', { name: 'Shared facility' })).toBeVisible();
  await friend.keyboard.press('Escape');
  await friend.getByRole('button', { name: 'Remix in architect studio' }).click();
  await expect(friend.getByTestId('budget-indicator')).toHaveText('28/30');
  await friend.goto('/?blueprint=v1-invalid');
  await expect(friend.getByRole('alert')).toContainText('invalid');
  await friend.getByRole('button', { name: 'Return home' }).click();
  await expect(friend.getByTestId('sector-map-btn')).toBeVisible();
  await a.close(); await b.close();
});

test('daily challenge: finish through server-owned movement and see the verified ranking after reload', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/'); await page.getByTestId('daily-challenge-btn').click();
  await page.getByRole('textbox', { name: 'Daily callsign' }).fill('Daily explorer');
  const daily = await (await page.request.get('/api/daily')).json();
  await page.getByTestId('daily-start-btn').click();
  await expect(page.locator('.daily-page').getByRole('status')).toContainText('Run started');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'Three ways to make your escape.' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('daily-moves')).toHaveText('Your moves: 0');
  await page.keyboard.press('Escape');
  let state = spawnHuman();
  for (const expected of solveBoardBFS(daily.grid).steps.slice(1)) {
    const choices = [{ dr: -1, dc: 0, key: 'ArrowUp' }, { dr: 0, dc: 1, key: 'ArrowRight' }, { dr: 1, dc: 0, key: 'ArrowDown' }, { dr: 0, dc: -1, key: 'ArrowLeft' }]
      .map(direction => ({ ...direction, move: moveHuman(daily.grid, state, direction.dr, direction.dc) }));
    const next = choices.find(({ move }) => !move.error && move.state.row === expected.row && move.state.col === expected.col && move.state.keyMask === expected.keyMask && move.state.switchMask === expected.switchMask)!;
    const response = page.waitForResponse(r => r.url().endsWith('/api/daily/move') && r.request().method() === 'POST');
    await page.keyboard.press(next.key, { delay: next.move.state.lastStep.event === 'GRAVITY_SLOW' ? 470 : 210 });
    expect((await response).status()).toBe(200); state = next.move.state;
    await expect(page.getByTestId('daily-moves')).toHaveText(`Your moves: ${state.moves}`);
  }
  await expect(page.locator('.daily-page').getByRole('status')).toContainText('verified score is saved');
  await expect(page.getByTestId('daily-rankings')).toContainText('Daily explorer');
  await page.screenshot({ path: '/tmp/revescape-daily-desktop.png', fullPage: true });
  await page.reload(); await page.getByTestId('daily-challenge-btn').click();
  await expect(page.getByTestId('daily-rankings')).toContainText('Daily explorer');
  await page.getByTestId('daily-start-btn').click();
  await expect(page.getByTestId('daily-moves')).toHaveText(`Your moves: ${state.moves}`);
});

test('daily challenge: a failed load keeps retry available and recovers without a blank screen', async ({ page }) => {
  await page.route('**/api/daily', route => route.abort());
  await page.goto('/'); await page.getByTestId('daily-challenge-btn').click();
  await expect(page.getByRole('button', { name: 'Retry loading' })).toBeEnabled();
  await expect(page.locator('.daily-page').getByRole('status')).not.toContainText('Loading today');
  await page.unroute('**/api/daily');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByRole('textbox', { name: 'Daily callsign' })).toBeVisible();
});

test('decision rewind: pause, validate an edit, compare a checkpoint continuation and restore the original', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('solo-challenge-btn').click();
  await page.getByTestId('submit-room-btn').click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Replay step' });
  await slider.press('Home');
  for (let i = 0; i < 3; i++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue('3');
  await page.getByRole('spinbutton', { name: 'Rewind edit row' }).fill('9');
  await page.getByTestId('compare-rewind-btn').click();
  await expect(page.getByRole('region', { name: 'Decision rewind laboratory' }).getByRole('status')).toContainText('from 0 to 7');
  await page.getByRole('spinbutton', { name: 'Rewind edit row' }).fill('7');
  await page.getByRole('spinbutton', { name: 'Rewind edit column' }).fill('0');
  await page.getByRole('combobox', { name: 'Rewind component' }).selectOption('GRAVITY_MUD');
  await page.getByTestId('compare-rewind-btn').click();
  await expect(page.getByTestId('rewind-comparison')).toContainText('Resumed after step 3');
  await expect(slider).toHaveValue('3');
  await page.screenshot({ path: '/tmp/revescape-rewind-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Restore original replay' }).click();
  await expect(page.getByTestId('rewind-comparison')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Decision rewind laboratory' }).getByRole('status')).toContainText('Original replay restored');
});

test('co-op: hold a pressure switch, share a core, wait at extraction and advance both players', async ({ browser }) => {
  test.setTimeout(150000);
  const a = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const one = await a.newPage(), two = await b.newPage();
  const errors: string[] = []; for (const page of [one, two]) page.on('pageerror', e => errors.push(e.message));
  await one.goto('/'); await one.getByTestId('coop-mode-btn').click(); await one.getByTestId('create-lobby-btn').click();
  const code = (await one.getByTestId('lobby-room-code').textContent())!.trim();
  await two.goto(`/?room=${code}`);
  await one.getByTestId('lobby-ready-btn').click(); await two.getByTestId('lobby-ready-btn').click();
  await expect(one.getByTestId('race-heading')).toHaveText('Pressure relay');
  await expect(one.getByRole('button', { name: 'Move down', exact: true })).toBeEnabled();
  const step = async (page: typeof one, key: string, id: string) => {
    const counter = page.getByTestId(`race-moves-${id}`);
    const before = Number(await counter.textContent());
    await expect(page.getByRole('button', { name: 'Move down', exact: true })).toBeEnabled();
    await page.keyboard.press(key, { delay: 210 });
    await expect(counter).toHaveText(String(before + 1));
  };
  await step(one, 'ArrowDown', 'P1'); await step(one, 'ArrowDown', 'P1'); await step(one, 'ArrowRight', 'P1');
  await expect(two.getByTestId('access-inventory')).toContainText('Phase switch: ON');
  for (let i = 0; i < 3; i++) await step(two, 'ArrowRight', 'P2');
  for (let i = 0; i < 5; i++) await step(two, 'ArrowDown', 'P2');
  await step(two, 'ArrowRight', 'P2'); await step(two, 'ArrowRight', 'P2');
  await expect(one.getByTestId('access-inventory')).toContainText('Red: collected');
  for (let i = 0; i < 2; i++) await step(two, 'ArrowRight', 'P2');
  await step(two, 'ArrowDown', 'P2'); await step(two, 'ArrowDown', 'P2');
  await expect(two.locator('.race-controls').getByRole('status')).toContainText('waiting for your teammate');
  await expect(one.getByTestId('race-heading')).toHaveText('Pressure relay');
  for (let i = 0; i < 5; i++) await step(one, 'ArrowRight', 'P1');
  for (let i = 0; i < 5; i++) await step(one, 'ArrowDown', 'P1');
  await step(one, 'ArrowRight', 'P1');
  await expect(one.getByTestId('race-heading')).toHaveText('Shared aerial clearance');
  await expect(two.getByTestId('race-heading')).toHaveText('Shared aerial clearance');
  await expect(one.getByTestId('access-inventory')).toContainText('Red: missing');
  await one.screenshot({ path: '/tmp/revescape-coop-desktop.png', fullPage: true });
  await two.screenshot({ path: '/tmp/revescape-coop-mobile.png', fullPage: true });
  expect(errors).toEqual([]); await a.close(); await b.close();
});
