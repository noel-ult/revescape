import {describe,expect,it} from 'vitest';
import {createAdventure,moveAdventure,chooseReward} from '../../src/shared/adventure';
import {mergeAdventureProfile,ownedAccents,restoreProfile} from '../../src/shared/adventureProfile';
import {createEmptyGrid} from '../../src/shared/board';
describe('Expedition rewards and failure rules',()=>{
 it('retains mastery through new runs, unlocks cosmetics and archives each run exactly once',()=>{
  let p=restoreProfile(null),s=createAdventure('CAMPAIGN');
  for(let i=0;i<9;i++)s.mastery[`room-${i}`]={stars:3,moves:30,salvage:true};
  p=mergeAdventureProfile(p,s);expect(ownedAccents(p)).toEqual(['mint','amber','violet']);p=mergeAdventureProfile(p,createAdventure('CAMPAIGN'));expect(Object.keys(p.mastery)).toHaveLength(9);
  const run={...createAdventure('ENDLESS',42),phase:'EXTRACTED' as const,floors:2};p=mergeAdventureProfile(p,run);p=mergeAdventureProfile(p,run);expect(p.runs).toBe(1);
  p=mergeAdventureProfile(p,{...createAdventure('ENDLESS',42),phase:'FAILED',floors:1});expect(p.runs).toBe(2);expect(p.bestFloor).toBe(2);expect(restoreProfile(p)).toEqual(p);
 });
 it('consumes integrity or a shield on reset and ends the run at zero',()=>{
  const grid=createEmptyGrid();grid[0][1]='TRAP_RESET';const room={id:'hazard',name:'Hazard test',objective:'Escape',hint:'Avoid the mine',theme:'ion' as const,grid};
  let s=createAdventure('ENDLESS');s=moveAdventure(s,0,0,1,room);expect(s.integrity).toBe(2);expect(s.roomFailures).toBe(1);expect(s.players[0].row).toBe(0);
  s={...createAdventure('ENDLESS'),upgrades:['shield']};s=moveAdventure(s,0,0,1,room);expect(s.integrity).toBe(3);expect(s.upgrades).not.toContain('shield');
  s={...createAdventure('ENDLESS'),integrity:1};s=moveAdventure(s,0,0,1,room);expect(s.phase).toBe('FAILED');
  s={...createAdventure('ENDLESS'),phase:'CHECKPOINT',integrity:2,upgrades:['cryo'],rewardChoices:['cryo']};s=chooseReward(s,'cryo');expect(s.integrity).toBe(3);expect(s.upgrades).toEqual(['cryo']);
 });
});
