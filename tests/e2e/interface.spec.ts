import {expect,test} from '@playwright/test';
test('new navigation: touch bottom bar opens each game mode without losing its active state',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const nav=page.getByRole('navigation',{name:'Game navigation'});const bounds=(await nav.boundingBox())!;expect(bounds.y+bounds.height).toBeLessThanOrEqual(844);expect(bounds.y).toBeGreaterThan(750);
 await nav.getByRole('button',{name:'Campaign',exact:true}).tap();await expect(page.getByRole('heading',{name:'Arrival concourse',exact:true})).toBeVisible();await expect(nav.getByRole('button',{name:'Campaign',exact:true})).toHaveAttribute('aria-current','page');
 await nav.getByRole('button',{name:'Endless',exact:true}).tap();await expect(page.getByRole('heading',{name:'Floor 1 · Chamber 1',exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Studio',exact:true}).tap();await expect(page.getByRole('heading',{name:'Build a world worth escaping.',exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Challenges',exact:true}).tap();await expect(page.getByRole('heading',{name:'Every platform is a destination.',exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Online',exact:true}).tap();await expect(page.getByRole('heading',{name:'Online expedition',exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Mission control',exact:true}).tap();await expect(page.getByRole('heading',{name:'Your next escape starts here.',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await context.close();
});
