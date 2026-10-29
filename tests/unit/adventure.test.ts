import { describe, expect, it } from 'vitest';
import { advanceAdventure, adventureRoom, chooseReward, commandCompanion, createAdventure, DOCKING_ROOMS, extractAdventure, generateEndlessRoom, validateAdventureRoom, applyAdventureAction, CAMPAIGN_ROOMS, interactAdventure, waitAdventure, moveAdventure, restoreAdventure, tickCompanion } from '../../src/shared/adventure';
import { moveCoop } from '../../src/shared/coop';
import { spawnHuman } from '../../src/shared/movement';
import { solveBoardBFS } from '../../src/shared/solver';

const directions=[[-1,0],[0,1],[1,0],[0,-1]];
function route(state: ReturnType<typeof createAdventure>, row:number,col:number) {
  const grid=adventureRoom(state).grid;
  const queue=[{p:state.players[0],path:[] as number[][]}],seen=new Set<string>();
  for(let i=0;i<queue.length;i++) { const {p,path}=queue[i]; if(p.row===row&&p.col===col)return path;
    for(const [dr,dc] of directions) { const next=moveCoop(grid,[p,state.players[1]],0,dr,dc); if(next.error)continue; const n=next.state,key=`${n.row},${n.col},${n.keyMask},${n.switchMask}`; if(seen.has(key))continue;seen.add(key);queue.push({p:n,path:[...path,[dr,dc]]}); }
  } throw new Error('no route');
}
function walk(s: ReturnType<typeof createAdventure>,row:number,col:number) { for(const [dr,dc] of route(s,row,col))s=moveAdventure(s,0,dr,dc);return s; }
function settle(s: ReturnType<typeof createAdventure>) { for(let n=0;n<100;n++){const next=tickCompanion(s);if(next===s)break;s=next;} return s; }
describe('Adventure progression and companion',()=>{
  it('executes all 18 authored cooperative solutions and completes the campaign with mastery',()=>{
    let s=createAdventure('CAMPAIGN');expect(CAMPAIGN_ROOMS).toHaveLength(18);expect(new Set(CAMPAIGN_ROOMS.map(r=>JSON.stringify(r.grid)) ).size).toBeGreaterThan(10);
    for(let i=0;i<18;i++){const result=validateAdventureRoom(adventureRoom(s));expect(result.valid,adventureRoom(s).id).toBe(true);for(const step of result.actions)s=applyAdventureAction(s,step.actor,step.action);expect(s.phase).toBe(i===17?'COMPLETE':'CHECKPOINT');if(i<17)s=advanceAdventure(s);}
    expect(s.completed).toHaveLength(18);expect(Object.keys(s.mastery)).toHaveLength(18);
  },15000);
  it('enforces circuits, adjacency, timed barriers, and terminal records',()=>{
    let s={...createAdventure('CAMPAIGN'),roomIndex:6};
    expect(interactAdventure(s,0,'primary').powered).toHaveLength(0);
    s=walk(s,2,2);s=interactAdventure(s,0,'primary');expect(s.powered).toContain('primary');
    s={...s,players:[{...s.players[0],row:3,col:3,lastStep:{...s.players[0].lastStep,row:3,col:3}},s.players[1]]};
    const pulse=adventureRoom(s).pulses![0];while((s.clock+pulse.offset)%pulse.period>=pulse.active)s=waitAdventure(s);
    const blocked=moveAdventure(s,0,1,0);expect(blocked.players[0].row).toBe(3);expect(blocked.message).toContain('Pulse');
    while((s.clock+pulse.offset)%pulse.period<pulse.active)s=waitAdventure(s);s=moveAdventure(s,0,1,0);expect(s.players[0].row).toBe(4);
    let t=createAdventure('CAMPAIGN');t=walk(t,0,7);const id=adventureRoom(t).terminals![0].id;t=interactAdventure(t,0,id);expect(t.logs).toContain(id);
  });

  it('completes all connected Docking Ring rooms through legal moves and pressure coordination',()=>{
    let s=createAdventure('CAMPAIGN');
    s=walk(s,2,2);s=settle(s);s=walk(s,7,7);s=settle(s);
    expect(s.phase).toBe('CHECKPOINT');s=advanceAdventure(s);expect(s.roomIndex).toBe(1);expect(s.players[0].keyMask).toBe(0);
    s=walk(s,2,1);s=commandCompanion(s,'INTERACT',{row:2,col:1});s=settle(s);expect(s.players[1].row).toBe(2);expect(s.players[1].col).toBe(1);
    s=walk(s,5,5);expect(s.players[1].keyMask).toBe(1);
    s=walk(s,3,6);s=commandCompanion(s,'REGROUP');s=settle(s);s=walk(s,7,7);s=settle(s);expect(s.phase).toBe('CHECKPOINT');
    s=advanceAdventure(s);s=walk(s,1,6);s=settle(s);s=walk(s,6,1);s=settle(s);s=walk(s,7,7);s=settle(s);
    expect(s.phase).toBe('CHECKPOINT');expect(s.completed).toHaveLength(3);expect(advanceAdventure(s).roomIndex).toBe(3);
  });
  it('honors hold, rejects undiscovered targets, retains real inventory on restore',()=>{
    let s=createAdventure('CAMPAIGN');s=commandCompanion(s,'INTERACT',{row:7,col:7});expect(s.command).toBe('FOLLOW');
    s=commandCompanion(s,'HOLD');s=walk(s,2,2);expect(tickCompanion(s)).toBe(s);
    expect(restoreAdventure(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreAdventure({...s,players:[{...spawnHuman(),row:90},spawnHuman()]})).toBeNull();
    expect(restoreAdventure({...s,phase:'HACKED'})).toBeNull();
    const old={...s,version:1,clock:undefined,powered:undefined,logs:undefined,salvage:undefined,mastery:undefined,roomFailures:undefined,routeChoice:undefined};expect(restoreAdventure(old)?.version).toBe(2);
  });
  it('generates reproducible solvable rooms across seeds and capped difficulty',()=>{
    for(let seed=0;seed<8;seed++)for(const index of [0,3,12,90]) {
      const room=generateEndlessRoom(seed,index);expect(validateAdventureRoom(room).valid).toBe(true);
      expect(generateEndlessRoom(seed,index)).toEqual(room);
      expect(room.grid[7][7]).toBe('EXIT');
    }
    expect(DOCKING_ROOMS).toHaveLength(3);
  },30000);
  it('requires an upgrade choice before continuing and supports safe extraction',()=>{
    let s=createAdventure('ENDLESS',42);
    for(let i=0;i<3;i++){for(const step of validateAdventureRoom(adventureRoom(s)).actions)s=applyAdventureAction(s,step.actor,step.action);expect(s.phase).toBe('CHECKPOINT');if(i<2)s=advanceAdventure(s);}
    expect(s.floors).toBe(1);expect(s.rewardChoices).toHaveLength(3);expect(advanceAdventure(s)).toBe(s);
    const reward=s.rewardChoices[0];s=chooseReward(s,reward);expect(s.rewardChoices).toHaveLength(0);
    expect(extractAdventure(s).phase).toBe('EXTRACTED');expect(advanceAdventure(s).roomIndex).toBe(3);
  });
});

it('plays every campaign room with the observed-map ASTRA instead of controlling its moves',()=>{
  function leg(s:ReturnType<typeof createAdventure>,row:number,col:number){
    const queue=[{s,path:[] as any[]}],seen=new Set<string>();
    for(let n=0;n<queue.length&&n<12000;n++){
      const current=queue[n];if(current.s.players[0].row===row&&current.s.players[0].col===col)return current.path;
      for(const action of [...directions.map(([dr,dc])=>({type:'MOVE' as const,dr,dc})),{type:'WAIT' as const}]){
        const next=applyAdventureAction(current.s,0,action),p=next.players[0];if(next.clock===current.s.clock)continue;
        const key=`${p.row},${p.col},${p.keyMask},${p.switchMask},${next.clock%12}`;if(seen.has(key))continue;seen.add(key);queue.push({s:next,path:[...current.path,action]});
      }
    }throw new Error('No route for human');
  }
  let s=createAdventure('CAMPAIGN');
  for(let index=0;index<18;index++){
    const room=adventureRoom(s),pressure=room.solution?.find(t=>t.actor===1&&t.row===2&&t.col===1);
    const walkActual=(row:number,col:number)=>{for(const action of leg(s,row,col)){s=applyAdventureAction(s,0,action);s=tickCompanion(s);}};
    if(pressure){walkActual(2,1);s=commandCompanion(s,'INTERACT',{row:2,col:1});s=settle(s);}
    for(const task of room.solution!.filter(t=>t.actor===0)){
      if(task.row===7&&task.col===7&&pressure){walkActual(3,6);s=commandCompanion(s,'REGROUP');}
      walkActual(task.row,task.col);if(task.interact)s=interactAdventure(s,0,task.interact);
    }
    for(let n=0;n<150&&s.phase==='PLAYING';n++){s=tickCompanion(s);if(s.phase==='PLAYING')s=waitAdventure(s);}
    expect(s.phase,room.id).toBe(index===17?'COMPLETE':'CHECKPOINT');if(index<17)s=advanceAdventure(s);
  }
},30000);
