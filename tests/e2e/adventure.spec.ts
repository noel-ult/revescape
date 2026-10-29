import { expect, test } from '@playwright/test';
import { ADVENTURE_SAVE_KEY, commandCompanion, createAdventure, adventureRoom, validateAdventureRoom, applyAdventureAction, moveAdventure } from '../../src/shared/adventure';

test('adventure hub, real companion movement, pause, restart and saved state',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByTestId('adventure-btn').click();
  await expect(page.getByRole('heading',{name:'Arrival concourse'})).toBeVisible();
  await expect(page.locator('canvas[data-ready="true"]')).toBeVisible();
  await page.getByRole('button',{name:'Hold position',exact:true}).click();
  await page.keyboard.press('ArrowRight',{delay:200});
  await expect(page.getByText(/1 moves ·/)).toBeVisible();
  await page.getByRole('button',{name:'Pause expedition',exact:true}).click();
  await page.keyboard.press('ArrowDown',{delay:200});await expect(page.getByText(/1 moves ·/)).toBeVisible();
  await page.getByRole('button',{name:'Resume expedition',exact:true}).click();
  await page.getByRole('button',{name:'Follow me',exact:true}).click();
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).players[1].col,`${ADVENTURE_SAVE_KEY}-CAMPAIGN`)).toBe(1);
  await page.screenshot({path:'/tmp/revescape-adventure-desktop.png',fullPage:true});
  await page.reload();await page.getByTestId('adventure-btn').click();await expect(page.getByText(/1 moves ·/)).toBeVisible();
  await page.getByRole('button',{name:'Restart room',exact:true}).click();await page.getByRole('button',{name:'Confirm restart',exact:true}).click();
  await expect(page.getByText(/0 moves ·/)).toBeVisible();expect(errors).toEqual([]);
});

test('mobile endless controls, seed validation, save import failure and checkpoint',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByTestId('endless-btn').click();
  await expect(page.getByRole('heading',{name:'Floor 1 · Chamber 1'})).toBeVisible();
  await page.getByRole('button',{name:'Restart run',exact:true}).click();await page.getByLabel('Endless seed').fill('invalid');
  await page.getByRole('button',{name:'Confirm restart',exact:true}).click();await expect(page.getByRole('alert')).toContainText('whole seed');
  await page.getByLabel('Endless seed').fill('42');await page.getByRole('button',{name:'Confirm restart',exact:true}).click();
  await page.getByRole('button',{name:'Move down',exact:true}).click();await expect(page.getByText(/1 moves ·/)).toBeVisible();
  await page.getByRole('button',{name:'Import save',exact:true}).click();await page.getByLabel('Exported adventure save').fill('{}');await page.getByRole('button',{name:'Restore this save'}).click();await expect(page.getByText(/Invalid save/)).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:'/tmp/revescape-adventure-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  let s=createAdventure('ENDLESS',42);
  const proof=validateAdventureRoom(adventureRoom(s));
  for(const step of proof.actions.slice(0,-1))s=applyAdventureAction(s,step.actor,step.action);
  await page.getByRole('button',{name:'Import save',exact:true}).click();await page.getByLabel('Exported adventure save').fill(JSON.stringify({...s,command:'FOLLOW'}));await page.getByRole('button',{name:'Restore this save'}).click();
  await expect(page.getByRole('button',{name:'Continue to next room'})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Continue to next room'}).click();await expect(page.getByRole('heading',{name:'Floor 1 · Chamber 2'})).toBeVisible();
});
