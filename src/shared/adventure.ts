import { parseShorthandGrid, cloneGrid } from './board';
import { moveCoop } from './coop';
import { HumanState, spawnHuman } from './movement';
import { canTraverseDeck, getDeckTopology, deckAt } from './levels';
import { planRouteAStar } from './agent';
import { canEnterTile } from './solver';
import type { Coordinate, Grid } from './types';

export const ADVENTURE_SAVE_KEY = 'reverse-escape-adventure-v1';
export type CompanionCommand = 'FOLLOW' | 'HOLD' | 'INTERACT' | 'REGROUP' | 'HELP' | 'SCOUT';
export { DOCKING_ROOMS, CAMPAIGN_ROOMS, CAMPAIGN_SECTORS } from './adventureContent';
import { AdventureRoom, CAMPAIGN_ROOMS, DOCKING_ROOMS, CAMPAIGN_SECTORS } from './adventureContent';
export type { AdventureRoom } from './adventureContent';
export interface AdventureState {
  version: 2; runId: string; mode: 'CAMPAIGN' | 'ENDLESS'; seed: number; roomIndex: number;
  players: [HumanState, HumanState]; command: CompanionCommand; target: Coordinate | null;
  clock: number; powered: string[]; logs: string[]; salvage: string[]; roomFailures: number;
  mastery: Record<string, { stars: number; moves: number; salvage: boolean }>;
  routeChoice: 'SALVAGE' | 'SIGNAL'; nextRoute?: 'SALVAGE' | 'SIGNAL';
  discovered: string[]; message: string; completed: string[]; integrity: number; floors: number;
  upgrades: string[]; rewardChoices: string[]; phase: 'PLAYING' | 'CHECKPOINT' | 'FAILED' | 'COMPLETE' | 'EXTRACTED';
}
export function adventureRoom(state: AdventureState): AdventureRoom {
  return state.mode === 'CAMPAIGN' ? CAMPAIGN_ROOMS[Math.min(state.roomIndex, CAMPAIGN_ROOMS.length - 1)] : generateEndlessRoom(state.routeChoice === 'SIGNAL' ? (state.seed ^ 0x5a17c9) >>> 0 : state.seed, state.roomIndex);
}
export function createAdventure(mode: AdventureState['mode'], seed = 1): AdventureState {
  return observe({ version: 2, runId: globalThis.crypto.randomUUID(), mode, seed: seed >>> 0, roomIndex: 0, players: [spawnHuman(), spawnHuman()], command: 'FOLLOW', target: null,
    clock: 0, powered: [], logs: [], salvage: [], roomFailures: 0, mastery: {}, routeChoice: 'SALVAGE',
    discovered: [], message: 'ASTRA online. Move with WASD, arrows, or the direction pad.', completed: [], integrity: 3, floors: 0, upgrades: [], rewardChoices: [], phase: 'PLAYING' });
}
function observe(state: AdventureState, room = adventureRoom(state)): AdventureState {
  const grid = room.grid, topology = getDeckTopology(grid), known = new Set(state.discovered);
  for (const p of state.players) {
    const radius = (p.empRemainingTurns ?? 0) ? 1 : 2;
    const lift = [topology.accessA, topology.accessB].some(a => a?.row === p.row && a.col === p.col);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (Math.abs(p.row-r) + Math.abs(p.col-c) <= radius && (lift || deckAt(topology,r,c) === deckAt(topology,p.row,p.col))) known.add(`${r},${c}`);
  }
  return { ...state, discovered: [...known] };
}
export function commandCompanion(state: AdventureState, command: CompanionCommand, target?: Coordinate): AdventureState {
  if (state.phase !== 'PLAYING') return state;
  if(command==='SCOUT'&&state.mode==='ENDLESS'&&!state.upgrades.includes('scout'))return {...state,message:'Find a scouting upgrade at a floor checkpoint first.'};
  if (command === 'INTERACT' && (!target || !state.discovered.includes(`${target.row},${target.col}`))) return { ...state, message: 'Explore that location first. ASTRA only acts on discovered cells.' };
  return { ...state, command, target: command === 'INTERACT' ? target! : null,
    message: command === 'HOLD' ? 'ASTRA: Holding position until you call me.' : command === 'INTERACT' ? `ASTRA: Moving to (${target!.row}, ${target!.col}). I will hold there.` : command === 'HELP' ? adventureRoom(state).hint : 'ASTRA: Regrouping with you.' };
}
export function moveAdventure(state: AdventureState, index: 0 | 1, dr: number, dc: number, room = adventureRoom(state), advanceClock = true): AdventureState {
  if (state.phase !== 'PLAYING' || state.players[index].lastStep.event === 'EXIT') return state;
  const target = { row: state.players[index].row + dr, col: state.players[index].col + dc };
  if (room.pulses?.some(p => p.row === target.row && p.col === target.col && pulseActive(p, state.clock))) return { ...state, message: 'Pulse barrier active. Wait one beat, then cross when it is safe.' };
  if(room.grid[target.row]?.[target.col]==='EXIT' && room.circuits?.some(c=>!state.powered.includes(c.id))) return {...state,message:'Restore every required relay before extracting.'};
  const result = moveCoop(adventureGrid(state,room), state.players, index, dr, dc);
  if (result.error) return { ...state, message: result.error };
  let next: AdventureState = { ...state, players: result.players as [HumanState, HumanState], clock: state.clock + Number(advanceClock) };
  if (result.state.lastStep.event === 'TRAP_RESET_TRIGGERED') next.roomFailures++;
  if (result.state.lastStep.event === 'TRAP_RESET_TRIGGERED' && state.mode === 'ENDLESS') {
    if (state.upgrades.includes('shield')) {
      next.upgrades = state.upgrades.filter(u => u !== 'shield');
      next.message = 'Hazard shield absorbed the integrity loss. The reset mine is disarmed.';
    } else { next.integrity--; next.message = 'Reset mine: one integrity lost. The mine is now disarmed.'; }
    if (next.integrity <= 0) return { ...next, phase: 'FAILED', message: 'Expedition ended. Your completed floors are recorded in this run.' };
  } else next.message = result.state.lastStep.description;
  const salvage = room.salvage?.find(p => p.row === result.state.row && p.col === result.state.col);
  if (salvage) next.salvage = [...new Set([...next.salvage, `${room.id}:${salvage.row},${salvage.col}`])];
  next = observe(next,room);
  if (next.players.every(p => p.lastStep.event === 'EXIT')) {
    const completedAll = [...new Set([...next.completed, room.id])];
    const completed = state.mode==='ENDLESS'?completedAll.slice(-256):completedAll;
    const moves = next.players.reduce((sum,p)=>sum+p.moves,0);
    const reward = { stars: 1 + Number(moves <= (room.par ?? 70)) + Number(next.roomFailures === 0), moves, salvage: next.salvage.some(id=>id.startsWith(room.id+':')) };
    const old = next.mastery[room.id];
    if(state.mode==='CAMPAIGN')next.mastery = { ...next.mastery, [room.id]: { stars: Math.max(old?.stars ?? 0,reward.stars), moves: Math.min(old?.moves ?? Infinity,moves), salvage: Boolean(old?.salvage || reward.salvage) } };
    if (state.mode === 'CAMPAIGN') return { ...next, completed, phase: state.roomIndex === CAMPAIGN_ROOMS.length - 1 ? 'COMPLETE' : 'CHECKPOINT', message: (state.roomIndex+1)%3===0 ? `${CAMPAIGN_SECTORS[Math.floor(state.roomIndex/3)].name} restored. The next destination is unlocked.` : 'Both explorers extracted. The next room is ready.' };
    const floorDone = (state.roomIndex + 1) % 3 === 0;
    return { ...next, completed, phase: 'CHECKPOINT', floors: next.floors + Number(floorDone), rewardChoices: floorDone ? [...new Set([...endlessRewards(state.seed,state.roomIndex).filter(r=>!['cryo','scout'].includes(r)||!state.upgrades.includes(r)),'repair','shield','scanner'])].slice(0,3) : [], message: floorDone ? 'Safe checkpoint. Choose an upgrade, then extract or push onward.' : 'Room secured. Continue to the next chamber.' };
  }
  return next;
}
/** Goal commands and frontier exploration use A* on observed beliefs, with legal lift and hazard costs. */
export function companionDirection(state: AdventureState): [number, number] | null {
  if (state.phase !== 'PLAYING' || state.command === 'HOLD' || state.command === 'HELP' || state.players[1].lastStep.event === 'EXIT') return null;
  const grid=adventureGrid(state),start=state.players[1],human=state.players[0],topology=getDeckTopology(grid);
  const known=new Set(state.discovered),map=new Map<string,import('./types').TileType>();
  for(const key of known){const [r,c]=key.split(',').map(Number);let tile=grid[r][c];
    if((tile==='EXIT'&&human.lastStep.event!=='EXIT')||(tile==='TRAP_RESET'&&!start.spentTraps.includes(key))||adventureRoom(state).pulses?.some(p=>p.row===r&&p.col===c&&pulseActive(p,state.clock)))tile='WALL';map.set(key,tile);
  }
  let goals:Coordinate[]=[];
  if(state.command==='SCOUT') {
    goals=state.discovered.map(key=>{const [row,col]=key.split(',').map(Number);const gain=[[-1,0],[0,1],[1,0],[0,-1]].filter(([dr,dc])=>row+dr>=0&&row+dr<8&&col+dc>=0&&col+dc<8&&!known.has(`${row+dr},${col+dc}`)).length;return {row,col,gain,distance:Math.abs(row-start.row)+Math.abs(col-start.col)};}).filter(c=>c.gain>0&&c.distance>0).sort((a,b)=>b.gain-a.gain||a.distance-b.distance||a.row-b.row||a.col-b.col);
  } else { const goal=state.command==='INTERACT'?state.target:human;if(goal)goals=[goal]; }
  for(const goal of goals){const route=planRouteAStar(start,goal,map,start.keyMask,start.switchMask,new Set(),new Set(start.spentTraps),new Map(),topology);const next=route?.path[0];if(next)return [next.row-start.row,next.col-start.col];}
  return null;
}
export function tickCompanion(state: AdventureState): AdventureState {
  const direction = companionDirection(state);
  if (!direction) {
    const goal = state.command === 'INTERACT' ? state.target : state.players[0];
    const object = state.command === 'INTERACT' && goal ? [...(adventureRoom(state).circuits??[]),...(adventureRoom(state).terminals??[])].find(o=>o.row===goal.row&&o.col===goal.col) : undefined;
    if(object && state.players[1].row===goal!.row && state.players[1].col===goal!.col && ![...state.powered,...state.logs].includes(object.id)) return interactAdventure(state,1,object.id);
    const companion = state.players[1];
    if (state.phase === 'PLAYING' && !['HOLD','HELP'].includes(state.command) && companion.lastStep.event !== 'EXIT' && goal && (goal.row !== companion.row || goal.col !== companion.col)) {
      const message = 'ASTRA: No safe discovered route to that target. Reveal a route, recover its access core, or give me another command.';
      return state.message === message ? state : { ...state, message };
    }
    return state;
  }
  return moveAdventure(state,1,...direction,adventureRoom(state),false);
}
export function advanceAdventure(state: AdventureState): AdventureState {
  if (state.phase !== 'CHECKPOINT' || state.rewardChoices.length) return state;
  return observe({ ...state, roomIndex: state.roomIndex+1, routeChoice: state.nextRoute ?? state.routeChoice, nextRoute: undefined, clock: 0, powered: [], roomFailures: 0, players: [spawnHuman(),spawnHuman()], discovered: [], command: 'FOLLOW', target: null, phase: 'PLAYING', message: 'New chamber. Inventory and machinery reset; expedition upgrades remain.' });
}
export function chooseReward(state: AdventureState, reward: string): AdventureState {
  if (state.phase !== 'CHECKPOINT' || !state.rewardChoices.includes(reward)) return state;
  return { ...state, integrity: reward === 'repair' || state.upgrades.includes(reward) ? Math.min(5,state.integrity+1) : state.integrity,
    upgrades: reward === 'repair' ? state.upgrades : [...new Set([...state.upgrades,reward])], rewardChoices: [], message: state.upgrades.includes(reward)?'Duplicate module converted into one integrity repair.':'Upgrade installed. Continue or extract safely.' };
}
export function extractAdventure(state: AdventureState): AdventureState {
  return state.mode === 'ENDLESS' && state.phase === 'CHECKPOINT' && (state.roomIndex+1)%3 === 0 ? { ...state, phase: 'EXTRACTED', rewardChoices: [], message: 'Extraction successful. Expedition archived on this device.' } : state;
}
function random(seed: number) { let value = seed || 1; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; }; }
export function endlessRewards(seed: number, index: number): string[] {
  const all = ['repair','shield','scanner','cryo','scout']; const rng = random(seed ^ Math.imul(index+1,7919));
  for (let i=all.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [all[i],all[j]]=[all[j],all[i]]; } return all.slice(0,3);
}
const endlessCache = new Map<string, AdventureRoom>();
export function generateEndlessRoom(seed: number, index: number): AdventureRoom {
  const key = `${seed}:${index}`; const cached = endlessCache.get(key); if (cached) return cached;
  const rng = random(seed ^ Math.imul(index+1,2654435761));
  const tier = Math.min(5,Math.floor(index/3));
  const candidates = tier === 0 ? [CAMPAIGN_ROOMS[0],CAMPAIGN_ROOMS[3]] : tier < 3 ? CAMPAIGN_ROOMS.slice(0,12) : CAMPAIGN_ROOMS;
  const template = candidates[Math.floor(rng()*candidates.length)];
  const value: AdventureRoom = JSON.parse(JSON.stringify(template));
  value.id = `endless-${key}`; value.name = `Floor ${Math.floor(index/3)+1} · Chamber ${index%3+1}`;
  value.objective = `${template.name}: ${template.objective}`;
  value.hint = template.hint;
  // Bounded mutation with an actual cooperative solution witness, rather than a trivial perimeter bypass.
  for(let attempt=0;attempt<Math.min(8,2+tier);attempt++) {
    const r=Math.floor(rng()*8), c=Math.floor(rng()*8);
    if(value.grid[r][c] !== 'EMPTY' || value.salvage?.some(p=>p.row===r&&p.col===c) || value.terminals?.some(p=>p.row===r&&p.col===c) || value.pulses?.some(p=>p.row===r&&p.col===c)) continue;
    const tile = tier>=2 && rng()<0.2 ? 'TRAP_RESET' : rng()<0.3 ? 'GRAVITY_MUD' : 'WALL';
    value.grid[r][c]=tile;
    if(!validateAdventureRoom(value).valid) value.grid[r][c]='EMPTY';
  }
  if(!validateAdventureRoom(value).valid) { value.grid=cloneGrid(template.grid); }
  value.terminals=value.terminals?.map(t=>({...t,id:`${value.id}-${t.id}`}));
  if(endlessCache.size>=100) endlessCache.clear(); endlessCache.set(key,value); return value;
}
export function scanAdventure(state: AdventureState): AdventureState {
  if(state.phase!=='PLAYING' || !state.upgrades.includes('scanner')) return state;
  const discovered=new Set(state.discovered), p=state.players[0];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(Math.abs(r-p.row)+Math.abs(c-p.col)<=4) discovered.add(`${r},${c}`);
  return {...state, discovered:[...discovered], upgrades:state.upgrades.filter(u=>u!=='scanner'), message:'Scan complete. Nearby discoveries shared with ASTRA.'};
}
export function restoreAdventure(raw: unknown): AdventureState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s=raw as AdventureState;
  if(![1,2].includes(s.version) || !['CAMPAIGN','ENDLESS'].includes(s.mode) || !Number.isInteger(s.seed) || s.seed<0 || s.seed>4294967295 || !Number.isInteger(s.roomIndex) || s.roomIndex<0 || s.roomIndex>100000 || (s.mode==='CAMPAIGN' && s.roomIndex>=CAMPAIGN_ROOMS.length)) return null;
  if(!['PLAYING','CHECKPOINT','FAILED','COMPLETE','EXTRACTED'].includes(s.phase) || !['FOLLOW','HOLD','INTERACT','REGROUP','HELP','SCOUT'].includes(s.command) || !Array.isArray(s.players) || s.players.length!==2) return null;
  for(const p of s.players) if(!p || !Number.isInteger(p.row) || p.row<0 || p.row>7 || !Number.isInteger(p.col) || p.col<0 || p.col>7 || !Number.isInteger(p.keyMask) || p.keyMask<0 || p.keyMask>7 || !Number.isInteger(p.switchMask) || p.switchMask<0 || p.switchMask>1 || !Number.isInteger(p.moves) || p.moves<0 || !Array.isArray(p.spentTraps) || !p.spentTraps.every(x=>typeof x==='string') || !p.lastStep || p.lastStep.row!==p.row || p.lastStep.col!==p.col) return null;
  if(!Array.isArray(s.discovered) || !s.discovered.every(x=>typeof x==='string' && /^[0-7],[0-7]$/.test(x)) || !Array.isArray(s.completed) || !s.completed.every(x=>typeof x==='string') || !Array.isArray(s.upgrades) || !s.upgrades.every(x=>['shield','scanner','cryo','scout'].includes(x)) || !Array.isArray(s.rewardChoices) || !s.rewardChoices.every(x=>['repair','shield','scanner','cryo','scout'].includes(x)) || !Number.isInteger(s.integrity) || s.integrity<0 || s.integrity>5 || !Number.isInteger(s.floors) || s.floors<0 || typeof s.message!=='string') return null;
  if(s.target && (!Number.isInteger(s.target.row) || !Number.isInteger(s.target.col) || s.target.row<0 || s.target.row>7 || s.target.col<0 || s.target.col>7)) return null;
  const migrated = { ...s, version: 2 as const, runId: s.runId ?? `legacy-${s.mode}-${s.seed}`, clock: s.clock ?? 0, powered: s.powered ?? [], logs: s.logs ?? [], salvage: s.salvage ?? [], roomFailures: s.roomFailures ?? 0, mastery: s.mastery ?? {}, routeChoice: s.routeChoice ?? 'SALVAGE' as const };
  if(typeof migrated.runId!=='string'||migrated.runId.length>100||!Number.isSafeInteger(migrated.clock)||migrated.clock<0||!Number.isSafeInteger(migrated.roomFailures)||migrated.roomFailures<0||![migrated.powered,migrated.logs,migrated.salvage].every(a=>Array.isArray(a)&&a.length<10000&&a.every(v=>typeof v==='string'&&v.length<200))||!['SALVAGE','SIGNAL'].includes(migrated.routeChoice)||!migrated.mastery||typeof migrated.mastery!=='object'||Array.isArray(migrated.mastery))return null;
  if(Object.values(migrated.mastery).some(m=>!m||!Number.isInteger(m.stars)||m.stars<1||m.stars>3||!Number.isSafeInteger(m.moves)||m.moves<0||typeof m.salvage!=='boolean'))return null;
  if((s.version as number)===1&&s.mode==='CAMPAIGN'&&s.roomIndex===2&&s.phase==='COMPLETE')migrated.phase='CHECKPOINT';
  return migrated;
}

export function pulseActive(p: {period:number;active:number;offset:number}, clock:number) { return (clock+p.offset)%p.period < p.active; }
export function adventureGrid(state: AdventureState, room=adventureRoom(state)):Grid {
  const grid=cloneGrid(room.grid);
  for(const circuit of room.circuits??[])for(const gate of circuit.gates)grid[gate.row][gate.col]=state.powered.includes(circuit.id)?'EMPTY':'WALL';
  return grid;
}
export function waitAdventure(state:AdventureState):AdventureState {
  return state.phase==='PLAYING'?{...state,clock:state.clock+1,message:'Waited one beat. Check the pulse barrier before crossing.'}:state;
}
export function interactAdventure(state:AdventureState,index:0|1,id:string,room=adventureRoom(state)):AdventureState {
  if(state.phase!=='PLAYING')return state;
  const object=[...(room.circuits??[]),...(room.terminals??[])].find(o=>o.id===id),p=state.players[index];
  if(!object||Math.abs(p.row-object.row)+Math.abs(p.col-object.col)>1||(Math.abs(p.row-object.row)+Math.abs(p.col-object.col)===1&&!canTraverseDeck(getDeckTopology(room.grid),p,object)))return {...state,message:'Move beside that console to interact.'};
  const circuit=room.circuits?.find(o=>o.id===id);
  if(circuit){
    if(circuit.requires&&!state.powered.includes(circuit.requires))return {...state,message:`Restore ${circuit.requires} first.`};
    return {...state,powered:[...new Set([...state.powered,id])],clock:state.clock+1,message:`${circuit.name} restored. Connected bulkheads are open.`};
  }
  const terminal=room.terminals!.find(t=>t.id===id)!;
  return {...state,logs:[...new Set([...state.logs,id])],message:terminal.text};
}
export type AdventureAction =
 | {type:'TRAVEL';roomIndex:number} | {type:'MOVE';dr:number;dc:number} | {type:'WAIT'} | {type:'INTERACT';id:string}
 | {type:'COMMAND';command:CompanionCommand;target?:Coordinate} | {type:'CONTINUE'}
 | {type:'REWARD';reward:string} | {type:'EXTRACT'} | {type:'SCAN'} | {type:'ROUTE';choice:'SALVAGE'|'SIGNAL'};
export function applyAdventureAction(state:AdventureState,index:0|1,action:AdventureAction):AdventureState {
  switch(action.type){
    case 'TRAVEL':{if(state.mode!=='CAMPAIGN'||!['CHECKPOINT','COMPLETE'].includes(state.phase)||!Number.isInteger(action.roomIndex)||action.roomIndex<0||action.roomIndex>=CAMPAIGN_ROOMS.length||(action.roomIndex>0&&!state.completed.includes(CAMPAIGN_ROOMS[action.roomIndex-1].id)))return state;return observe({...state,roomIndex:action.roomIndex,players:[spawnHuman(),spawnHuman()],clock:0,powered:[],discovered:[],roomFailures:0,phase:'PLAYING',command:'FOLLOW',target:null,message:'Destination reached. Recover the room systems together.'});}
    case 'MOVE':return moveAdventure(state,index,action.dr,action.dc);
    case 'WAIT':return waitAdventure(state);
    case 'INTERACT':return interactAdventure(state,index,action.id);
    case 'COMMAND':return commandCompanion(state,action.command,action.target);
    case 'CONTINUE':return advanceAdventure(state);
    case 'REWARD':return chooseReward(state,action.reward);
    case 'EXTRACT':return extractAdventure(state);
    case 'SCAN':return scanAdventure(state);
    case 'ROUTE':return state.mode==='ENDLESS'&&state.phase==='CHECKPOINT'?{...state,nextRoute:action.choice}:state;
  }
}
/** Complete-information validation: execute authored cooperative dependencies and search each leg, including waits. */
export function validateAdventureRoom(room:AdventureRoom):{valid:boolean;error?:string;actions:Array<{actor:0|1;action:AdventureAction}>;moves:number} {
  let state:AdventureState={version:2,runId:'validation',mode:'CAMPAIGN',seed:1,roomIndex:0,players:[spawnHuman(),spawnHuman()],command:'HOLD',target:null,clock:0,powered:[],logs:[],salvage:[],roomFailures:0,mastery:{},routeChoice:'SALVAGE',discovered:[],message:'',completed:[],integrity:3,floors:0,upgrades:[],rewardChoices:[],phase:'PLAYING'};
  const actions:Array<{actor:0|1;action:AdventureAction}>=[];
  for(const task of room.solution??[{actor:0 as const,row:7,col:7},{actor:1 as const,row:7,col:7}]) {
    type Node={state:AdventureState;parent:number;action:AdventureAction|null};
    const queue:Node[]=[{state,parent:-1,action:null}],seen=new Set<string>();let found=-1;
    for(let n=0;n<queue.length&&n<12000;n++){
      const current=queue[n].state,p=current.players[task.actor];
      if(p.row===task.row&&p.col===task.col){found=n;break;}
      const options:AdventureAction[]=[...([[-1,0],[0,1],[1,0],[0,-1]].map(([dr,dc])=>({type:'MOVE' as const,dr,dc}))),{type:'WAIT'}];
      for(const action of options){const next=action.type==='MOVE'?moveAdventure(current,task.actor,action.dr,action.dc,room):waitAdventure(current);if(next===current||next.clock===current.clock)continue;
        const q=next.players[task.actor];if(q.lastStep.event==='TRAP_RESET_TRIGGERED')continue;
        const key=`${q.row},${q.col},${q.keyMask},${q.switchMask},${next.clock%12},${q.spentTraps.join(';')}`;
        if(seen.has(key))continue;seen.add(key);queue.push({state:next,parent:n,action});
      }
    }
    if(found<0)return {valid:false,error:`Cannot reach ${task.row},${task.col} with actor ${task.actor}; power=${state.powered}`,actions:[],moves:0};
    const path:Array<{actor:0|1;action:AdventureAction}>=[];let at=found;
    while(queue[at].parent>=0){path.push({actor:task.actor,action:queue[at].action!});at=queue[at].parent;}
    actions.push(...path.reverse());state=queue[found].state;
    if(task.interact){state=interactAdventure(state,task.actor,task.interact,room);if(!state.powered.includes(task.interact))return {valid:false,actions:[],moves:0};actions.push({actor:task.actor,action:{type:'INTERACT',id:task.interact}});}
  }
  return {valid:state.players.every(p=>p.lastStep.event==='EXIT'),actions,moves:state.players.reduce((sum,p)=>sum+p.moves,0)};
}
