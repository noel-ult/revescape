import {expect,test} from '@playwright/test';
import {ADVENTURE_SAVE_KEY,adventureRoom,applyAdventureAction,createAdventure,validateAdventureRoom} from '../../src/shared/adventure';

test('campaign machinery: operate a relay, show circuit feedback, recover a record, persist discoveries',async({page})=>{
 const initial={...createAdventure('CAMPAIGN'),roomIndex:3};
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:`${ADVENTURE_SAVE_KEY}-CAMPAIGN`,state:initial});
 await page.goto('/');await page.getByTestId('adventure-btn').click();
 await expect(page.getByRole('heading',{name:'Reactor ignition',exact:true})).toBeVisible();await expect(page.locator('canvas[data-ready="true"]')).toBeVisible();
 await expect(page.getByLabel('Campaign sectors').locator('>button')).toHaveCount(6);
 await page.getByRole('button',{name:/Restore Primary power relay/}).click();await expect(page.getByTestId('adventure-status')).toContainText('Move beside');
 for(const key of ['ArrowDown','ArrowDown','ArrowRight','ArrowRight'])await page.keyboard.press(key,{delay:220});
 await page.getByRole('button',{name:/Restore Primary power relay/}).click();await expect(page.getByRole('button',{name:/✓ Powered/})).toBeVisible();
 for(const key of ['ArrowRight','ArrowRight','ArrowRight','ArrowRight','ArrowUp'])await page.keyboard.press(key,{delay:220});
 await page.getByRole('button',{name:/Recover Reactor ignition station log/}).click();await expect(page.getByTestId('adventure-status')).toContainText('crew');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),`${ADVENTURE_SAVE_KEY}-CAMPAIGN`);expect(saved.logs).toHaveLength(1);expect(saved.powered).toContain('primary');
 await page.screenshot({path:'/tmp/revescape-circuits-desktop.png',fullPage:true});
});

test('endless checkpoint: upgrade, branch selection, extraction, career and resumed rewards',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});
 let state=createAdventure('ENDLESS',42);
 for(let room=0;room<3;room++){for(const step of validateAdventureRoom(adventureRoom(state)).actions)state=applyAdventureAction(state,step.actor,step.action);if(room<2)state=applyAdventureAction(state,0,{type:'CONTINUE'});}
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:`${ADVENTURE_SAVE_KEY}-ENDLESS`,state});
 await page.goto('/');await page.getByTestId('endless-btn').click();
 await expect(page.getByRole('button',{name:'Continue to next room'})).toBeDisabled();
 await page.getByRole('button',{name:'Signal route',exact:true}).click();await expect(page.getByRole('button',{name:'Signal route',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.locator('.upgrade-choices button').first().click();await expect(page.getByRole('button',{name:'Continue to next room'})).toBeEnabled();
 await page.getByRole('button',{name:'Extract safely',exact:true}).click();await expect(page.getByRole('heading',{name:'Expedition recovered.',exact:true})).toBeVisible();
 await expect(page.locator('.adventure-career')).toContainText('1 archived runs');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/revescape-endless-mobile.png',fullPage:true});
});

test('online campaign: two explorers, authoritative room completion, pause, reconnect and shared relay task',async({browser})=>{
 test.setTimeout(120000);const a=await browser.newContext(),b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const one=await a.newPage(),two=await b.newPage();const errors:string[]=[];for(const page of [one,two])page.on('pageerror',e=>errors.push(e.message));
 await one.goto('/');await one.getByTestId('online-expedition-btn').click();await one.getByLabel('Explorer callsign',{exact:true}).fill('Nova');await one.getByRole('button',{name:'Create expedition',exact:true}).click();
 const invite=await one.getByLabel('Expedition invite URL').inputValue();expect(invite).toContain('?expedition=');await two.goto(invite);
 await one.getByRole('button',{name:'Ready for expedition',exact:true}).click();await two.getByRole('button',{name:'Ready for expedition',exact:true}).click();
 await expect(one.getByRole('button',{name:'Move down',exact:true})).toBeEnabled();
 let initial=createAdventure('CAMPAIGN');const directions:Record<string,string>={'-1,0':'ArrowUp','1,0':'ArrowDown','0,-1':'ArrowLeft','0,1':'ArrowRight'};
 async function perform(page:typeof one,action:any){const seq=Number(await page.getByTestId('online-session').getAttribute('data-seq'));await page.waitForTimeout(200);if(action.type==='MOVE')await page.keyboard.press(directions[`${action.dr},${action.dc}`],{delay:210});else if(action.type==='WAIT')await page.getByRole('button',{name:'Wait one beat'}).click();else throw new Error('Unexpected proof step');await expect(page.getByTestId('online-session')).toHaveAttribute('data-seq',String(seq+1));}
 for(const step of validateAdventureRoom(adventureRoom(initial)).actions)await perform(step.actor===0?one:two,step.action);
 await expect(one.getByRole('button',{name:'Continue to next room'})).toBeEnabled();await expect(two.getByRole('button',{name:'Continue to next room'})).toBeDisabled();
 await one.getByRole('button',{name:'Continue to next room'}).click();await expect(two.getByRole('heading',{name:'Maintenance relay',exact:true})).toBeVisible();
 await one.getByRole('button',{name:'Pause expedition',exact:true}).click();await expect(two.getByRole('button',{name:'Move down',exact:true})).toBeDisabled();
 await one.getByRole('button',{name:'Resume expedition',exact:true}).click();await two.reload();await expect(two.getByRole('heading',{name:'Maintenance relay',exact:true})).toBeVisible();
 await two.goto('about:blank');await expect(one.getByText('Waiting for your teammate to reconnect. Progression is paused.')).toBeVisible();await expect(one.getByRole('button',{name:'Move down',exact:true})).toBeDisabled();await two.goto(invite);await expect(one.getByRole('button',{name:'Move down',exact:true})).toBeEnabled({timeout:20000});
 const relay={...initial,roomIndex:1};for(const step of validateAdventureRoom(adventureRoom(relay)).actions)await perform(step.actor===0?one:two,step.action);
 await expect(one.getByRole('button',{name:'Continue to next room'})).toBeEnabled();await one.screenshot({path:'/tmp/revescape-online-desktop.png',fullPage:true});await two.screenshot({path:'/tmp/revescape-online-mobile.png',fullPage:true});expect(errors).toEqual([]);await a.close();await b.close();
});

test('orbital campaign navigation: six real destinations, unlock, cosmetic and pointer travel',async({page})=>{
 const {PerspectiveCamera,Vector3}=await import('three');const {sectorPosition}=await import('../../src/shared/sectors');
 let state=createAdventure('CAMPAIGN');for(let i=0;i<3;i++){for(const step of validateAdventureRoom(adventureRoom(state)).actions)state=applyAdventureAction(state,step.actor,step.action);if(i<2)state=applyAdventureAction(state,0,{type:'CONTINUE'});}
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:`${ADVENTURE_SAVE_KEY}-CAMPAIGN`,state});
 await page.goto('/');await page.getByTestId('adventure-btn').click();await expect(page.getByRole('button',{name:'amber console',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Orbital navigation',exact:true}).click();await page.getByRole('button',{name:'top camera',exact:true}).click();
 const canvas=page.locator('canvas[data-ready="true"]');await expect(canvas).toHaveAttribute('data-selected-sector','docking');await canvas.scrollIntoViewIfNeeded();
 const bounds=(await canvas.boundingBox())!,aspect=bounds.width/bounds.height,camera=new PerspectiveCamera(aspect<1.25?48:39,aspect,0.1,100);
 camera.position.set(0,aspect<1.1?55:48,0.01);camera.lookAt(0,0,0);camera.updateMatrixWorld();const point=new Vector3(...sectorPosition(1,6)).project(camera);
 await canvas.click({position:{x:(point.x+1)*bounds.width/2,y:(1-point.y)*bounds.height/2}});
 await expect(page.getByRole('heading',{name:'Reactor ignition',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Orbital navigation',exact:true})).toBeDisabled();
 await page.screenshot({path:'/tmp/revescape-campaign-navigation.png',fullPage:true});
});
