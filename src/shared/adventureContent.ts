import { parseShorthandGrid } from './board';
import type { Coordinate, Grid } from './types';

export interface Circuit extends Coordinate { id: string; name: string; gates: Coordinate[]; requires?: string }
export interface Pulse extends Coordinate { period: number; active: number; offset: number }
export interface Terminal extends Coordinate { id: string; title: string; text: string }
export type SolutionTask = { actor: 0 | 1; row: number; col: number; interact?: string };
export interface AdventureRoom {
  schemaVersion?: 2; id: string; name: string; objective: string; hint: string; grid: Grid;
  theme: 'ion' | 'void' | 'ember'; sector?: string; circuits?: Circuit[]; pulses?: Pulse[];
  terminals?: Terminal[]; salvage?: Coordinate[]; solution?: SolutionTask[]; par?: number;
  connections?: { entry: string; exit: string }; deckCells?: Array<Coordinate & { level: number }>;
}
export const CAMPAIGN_SECTORS = [
  {id:'docking',name:'Docking Ring',color:'#88e8cf',description:'Reconnect with ASTRA and recover the arrival decks.'},
  {id:'foundry',name:'Power Foundry',color:'#ffb47f',description:'Restore relay circuits and reopen the reactor.'},
  {id:'cryo',name:'Cryo Research',color:'#83e4ed',description:'Route coolant and cross pulse barriers safely.'},
  {id:'archive',name:'Signal Archive',color:'#c5a3ff',description:'Separate false signals from the station’s records.'},
  {id:'observatory',name:'Sky Observatory',color:'#94cfff',description:'Recover elevated cores and align the telescope arrays.'},
  {id:'nexus',name:'Command Nexus',color:'#ff9f97',description:'Restore all command systems and bring the station home.'},
];
const base = (id:string,name:string,rows:string[],hint:string,theme:AdventureRoom['theme']='ion'):AdventureRoom=>({id,name,grid:parseShorthandGrid(rows),hint,theme,objective:hint,schemaVersion:2});
export const DOCKING_ROOMS: AdventureRoom[] = [
 base('dock-arrival','Arrival concourse',[
 'S . . # . . . .','. # . # . # # .','. # r . . . . .','. . . # # . # .','# . . . . . # .','. . # . # . . .','. . . . . # # #','. . . . . . R E',
 ],'Recover the red core, then bring both explorers to extraction.'),
 base('dock-relay','Maintenance relay',[
 'S . . . . . . .','. . . . . . . .','. w . . . . . .','# # # X # # R #','. . . . . . . .','. . . . . r . .','. . . . . . . .','. . . . . . . E',
 ],'Send ASTRA to hold the pressure pad at (2,1). Cross at (3,3), recover the red core at (5,5), reveal the bypass at (3,6), then Regroup.'),
 base('dock-observatory','Departure observatory',[
 'S . . . . . . .','. . . . U . r .','. # . # . . . .','. # . . . . . .','. V . # . . . .','. . . . . . . .','. c . . . # # #','. . . . . R C E',
 ],'Use both lifts to recover red and cyan cores. Shared cores open the departure doors.','void'),
];
DOCKING_ROOMS[0].solution=[{actor:0,row:2,col:2},{actor:0,row:7,col:7},{actor:1,row:7,col:7}];
DOCKING_ROOMS[1].solution=[{actor:1,row:2,col:1},{actor:0,row:5,col:5},{actor:0,row:7,col:7},{actor:1,row:7,col:7}];
DOCKING_ROOMS[2].solution=[{actor:0,row:1,col:6},{actor:0,row:6,col:1},{actor:0,row:7,col:7},{actor:1,row:7,col:7}];
function circuitRoom(id:string,name:string,sector:string,variant:number):AdventureRoom {
 const rows=[
  'S . . . . . . .','. # . # . # . .','. . . . . . . .',
  '# # # X # # # #','. . . . . . . .','. . # . # . # .','. . . . . . . .','. . . . . . . E',
 ];
 const r=base(id,name,rows,'Restore the relay to open its connected bulkhead. Interact with the relay from its tile or a neighboring tile.',sector==='archive'?'void':sector==='cryo'?'ion':'ember');
 r.sector=sector;
 r.circuits=[{id:'primary',name:sector==='cryo'?'Coolant regulator':'Primary power relay',row:2,col:2,gates:[{row:3,col:3}]}];
 r.grid[2][2]='SWITCH_A';
 r.solution=[{actor:0,row:2,col:2,interact:'primary'},{actor:0,row:7,col:7},{actor:1,row:7,col:7}];
 if(variant>=1){r.circuits.push({id:'secondary',name:'Return circuit',row:4,col:5,gates:[{row:6,col:4}],requires:'primary'});r.grid[4][5]='SWITCH_A';for(let c=0;c<8;c++)r.grid[6][c]='WALL';r.grid[6][4]='GATE_A_CLOSED';r.grid[5][4]='EMPTY';r.solution.splice(1,0,{actor:0,row:4,col:5,interact:'secondary'});}
 if(variant>=2){r.grid[4][1]='KEY_RED';r.grid[7][6]='DOOR_RED';r.grid[6][7]='WALL';r.solution.splice(r.solution.length-2,0,{actor:0,row:4,col:1});}
 r.terminals=[{id:`${id}-log`,title:`${name} station log`,row:1,col:6,text:sector==='nexus'?'The emergency beacon was a request for help. Power, cooling and navigation are restored; the station can finally return.':`The ${sector} crew left a relay diagram. The illuminated line connects the console to its bulkhead. Recover this record to preserve their work.`}];
 r.salvage=[{row:5,col:1}];r.par=45+variant*12;
 return r;
}
function pressureRoom(id:string,name:string,sector:string,variant:number):AdventureRoom {
 const r=base(id,name,[
 'S . . . . . . .','. . . # . . . .','. w . . . . . .','# # # X # # R #','. . . . . . . .','. . . . . r . .','. . . . . . . .','. . . . . . . E',
 ],'Assign ASTRA to (2,1), cross the phase gate, recover the shared red core, then reveal the red bypass at (3,6) and Regroup.',sector==='archive'?'void':'ion');
 r.sector=sector;r.solution=[{actor:1,row:2,col:1},{actor:0,row:5,col:5},{actor:0,row:7,col:7},{actor:1,row:7,col:7}];
 if(variant>0){r.grid[4][2]='GRAVITY_MUD';r.grid[4][3]='GRAVITY_MUD';r.grid[5][6]='EMP_SCRAMBLER';}
 r.terminals=[{id:`${id}-log`,title:'Crew coordination record',row:4,col:7,text:'A single explorer cannot hold a relay and cross its gate at once. The crew used paired scouts to recover access cores, then reunited through the keyed bypass.'}];r.salvage=[{row:5,col:0}];r.par=52;return r;
}
function aerialRoom(id:string,name:string,sector:string,variant:number):AdventureRoom {
 const r=base(id,name,[
 'S . . . . . . .','. . . . U . r .','. # . # . . . .','. . . . . . . .','. V . # . . . .','. . . . . . . .','. c . . . # # #','. . . . . R C E',
 ],'Recover the red and cyan cores from the raised decks, then reunite at extraction. Lift bridges are the only walking connections.',sector==='nexus'?'ember':'void');r.sector=sector;
 r.solution=[{actor:0,row:1,col:6},{actor:0,row:6,col:1},{actor:0,row:7,col:7},{actor:1,row:7,col:7}];
 if(variant>0){r.grid[3][4]='EMP_SCRAMBLER';r.grid[5][4]='GRAVITY_MUD';}
 if(variant===2){r.circuits=[{id:'array',name:'Navigation array',row:2,col:5,gates:[{row:7,col:4}]}];r.grid[2][5]='SWITCH_A';r.grid[7][4]='GATE_A_CLOSED';r.solution.splice(1,0,{actor:0,row:2,col:5,interact:'array'});}
 r.terminals=[{id:`${id}-log`,title:'Observatory transmission',row:5,col:2,text:'The telescope recorded the homeward vector. Preserve its coordinates before restoring the navigation array.'}];r.salvage=[{row:2,col:6}];r.par=70;return r;
}
export const CAMPAIGN_ROOMS:AdventureRoom[]=[...DOCKING_ROOMS,
 circuitRoom('foundry-ignition','Reactor ignition','foundry',0),pressureRoom('foundry-coupling','Paired conduits','foundry',0),circuitRoom('foundry-core','Reactor heart','foundry',2),
 circuitRoom('cryo-intake','Coolant intake','cryo',0),circuitRoom('cryo-pulse','Pulse exchange','cryo',1),pressureRoom('cryo-vault','Cryogenic vault','cryo',1),
 pressureRoom('archive-echo','Echo chamber','archive',0),circuitRoom('archive-records','Memory stacks','archive',1),circuitRoom('archive-beacon','Beacon truth','archive',2),
 aerialRoom('sky-ascent','Telescope ascent','observatory',0),aerialRoom('sky-alignment','Array alignment','observatory',1),aerialRoom('sky-vector','Homeward vector','observatory',2),
 circuitRoom('nexus-power','Command power','nexus',1),pressureRoom('nexus-recovery','Crew recovery','nexus',1),aerialRoom('nexus-home','Return protocol','nexus',2),
];
CAMPAIGN_ROOMS.forEach((r,i)=>{
 r.schemaVersion=2;r.sector=CAMPAIGN_SECTORS[Math.floor(i/3)].id;
 r.connections={entry:i===0?'command-deck':CAMPAIGN_ROOMS[i-1].id,exit:i===17?'command-deck':CAMPAIGN_ROOMS[i+1].id};
 r.par??=55;
 if(i>=6&&i<=8){r.pulses=[{row:4,col:3,period:4,active:2,offset:i%4}];for(let c=0;c<8;c++)if(c!==3)r.grid[4][c]='WALL';r.grid[4][3]='EMPTY';if(r.circuits?.some(c=>c.row===4)){r.grid[5][4]='EMPTY';r.grid[4][5]='SWITCH_A';}if(i===8)r.grid[4][6]='EMPTY';}
 if(i>=9&&i<=11){r.grid[0][6]='DECOY_EXIT';r.grid[2][6]='EMP_SCRAMBLER';}
 r.terminals??=[{id:`r${i}-log`,row:0,col:7,title:'Docking crew log',text:'ASTRA’s last command was to keep the station safe. The crew left access cores on the raised platforms before evacuating.'}];
 r.salvage??=[{row:0,col:6}];
 // Public deck metadata adapts legacy Grid cells without changing its wire format.
 r.deckCells=r.grid.flatMap((row,ri)=>row.flatMap((_,ci)=>((r.grid.some(a=>a.includes('ELEVATOR_A'))&&ri>=1&&ri<=2&&ci>=5&&ci<=6)?[{row:ri,col:ci,level:1}]:(r.grid.some(a=>a.includes('ELEVATOR_B'))&&ri>=5&&ri<=6&&ci>=1&&ci<=2)?[{row:ri,col:ci,level:2}]:[])));
});
export const ADVENTURE_ROOM_BY_ID = new Map(CAMPAIGN_ROOMS.map(r=>[r.id,r]));
