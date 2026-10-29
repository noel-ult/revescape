import { createRequire } from 'node:module';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { createHash, randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import path from 'path';
import type { Server, Socket } from 'socket.io';
import { AdventureAction, AdventureState, applyAdventureAction, createAdventure, restoreAdventure, tickCompanion } from '../shared/adventure';

interface Member {hash:string;name:string;seq:number;ready:boolean}
interface Session {version:1;code:string;seats:1|2;members:Member[];state:AdventureState;started:boolean;paused:boolean;createdAt:number;updatedAt:number;revision:number;rematchVotes?:number[]}
import type { ExpeditionPublic, ExpeditionRanking } from '../shared/expeditionProtocol';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const validToken=(value:unknown):value is string=>typeof value==='string'&&value.length>=16&&value.length<=200;
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validAdventureAction(a:unknown):a is AdventureAction {
 if(!isRecord(a))return false;
 switch(a.type){
 case 'TRAVEL':return Number.isInteger(a.roomIndex)&&(a.roomIndex as number)>=0&&(a.roomIndex as number)<18;
 case 'MOVE':return Number.isInteger(a.dr)&&Number.isInteger(a.dc)&&Math.abs(a.dr as number)+Math.abs(a.dc as number)===1;
 case 'WAIT':case 'CONTINUE':case 'EXTRACT':case 'SCAN':return true;
 case 'INTERACT':return typeof a.id==='string'&&a.id.length<=100;
 case 'REWARD':return ['repair','shield','scanner','cryo','scout'].includes(a.reward as string);
 case 'ROUTE':return ['SALVAGE','SIGNAL'].includes(a.choice as string);
 case 'COMMAND':return ['FOLLOW','HOLD','INTERACT','REGROUP','HELP','SCOUT'].includes(a.command as string)&&(a.command!=='INTERACT'||(isRecord(a.target)&&Number.isInteger(a.target.row)&&Number.isInteger(a.target.col)&&(a.target.row as number)>=0&&(a.target.row as number)<8&&(a.target.col as number)>=0&&(a.target.col as number)<8));
 default:return false;
 }
}
export class ExpeditionStore {
 readonly db:SqliteDatabase;
 constructor(filename:string){if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});this.db=new DatabaseSync(filename);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS expeditions(code TEXT PRIMARY KEY, payload TEXT NOT NULL, updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS expedition_results(code TEXT PRIMARY KEY, mode TEXT NOT NULL, seed INTEGER NOT NULL, floors INTEGER NOT NULL, moves INTEGER NOT NULL, names TEXT NOT NULL, completed INTEGER NOT NULL);`);}
 load(code:string):Session|undefined {const row=this.db.prepare('SELECT payload FROM expeditions WHERE code=?').get(code) as {payload:string}|undefined;if(!row)return;const s=JSON.parse(row.payload) as Session;const state=restoreAdventure(s.state);if(!state||s.version!==1)throw new Error('Checkpoint version unavailable.');return {...s,state};}
 save(s:Session){this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO expeditions VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload,updated=excluded.updated').run(s.code,JSON.stringify(s),s.updatedAt);
 if(['COMPLETE','EXTRACTED','FAILED'].includes(s.state.phase))this.db.prepare('INSERT INTO expedition_results VALUES(?,?,?,?,?,?,?) ON CONFLICT(code) DO NOTHING').run(s.code,s.state.mode,s.state.seed,s.state.floors,s.state.players.reduce((n,p)=>n+p.moves,0),JSON.stringify(s.members.map(m=>m.name)),Date.now());
 this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 rankings():ExpeditionRanking[]{return this.db.prepare("SELECT mode,seed,floors,moves,names,completed FROM expedition_results WHERE mode='ENDLESS' ORDER BY floors DESC,moves ASC,completed ASC LIMIT 25").all().map(row=>({mode:String(row.mode),seed:Number(row.seed),floors:Number(row.floors),moves:Number(row.moves),names:JSON.parse(row.names as string) as string[],completed:Number(row.completed)}));}
 cleanup(){this.db.prepare('DELETE FROM expeditions WHERE updated < ?').run(Date.now()-7*86400_000);}
 close(){this.db.close();}
}
export class ExpeditionManager {
 private sessions=new Map<string,Session>();
 private bindings=new Map<string,{code:string;index:number}>();
 private readyAt=new Map<string,number>();
 private timer:ReturnType<typeof setInterval>;
 private closed=false;
 private creates=new Map<string,{count:number;until:number}>();
 private lastCleanup=0;
 constructor(private io:Server,readonly store:ExpeditionStore,private options:{cooldownMs?:number;tickMs?:number;now?:()=>number}={}){
  this.store.cleanup();this.timer=setInterval(()=>this.tick(),options.tickMs??400);this.timer.unref();
 }
 private now(){return this.options.now?.()??Date.now();}
 private connected(code:string,index:number){return [...this.bindings.entries()].some(([id,b])=>b.code===code&&b.index===index&&this.io.sockets.sockets.has(id));}
 private public(s:Session,index:number):ExpeditionPublic{return {version:1,code:s.code,seats:s.seats,members:s.members.map((m,i)=>({name:m.name,ready:m.ready,connected:this.connected(s.code,i)})),you:index,seq:s.members[index]?.seq??0,state:s.state,started:s.started,paused:s.paused,revision:s.revision,rematchVotes:s.rematchVotes??[],waiting:s.members.length!==s.seats||s.members.some((_,i)=>!this.connected(s.code,i))};}
 private broadcast(s:Session){for(const [id,b] of this.bindings)if(b.code===s.code)this.io.sockets.sockets.get(id)?.emit('expedition:state',this.public(s,b.index));}
 private persist(s:Session){s.updatedAt=this.now();s.revision++;this.store.save(s);this.sessions.set(s.code,s);this.broadcast(s);}
 private bind(socket:Socket,s:Session,index:number){
  this.leave(socket);
  for(const [id,b]of this.bindings)if(b.code===s.code&&b.index===index){this.io.sockets.sockets.get(id)?.emit('expedition:replaced');this.bindings.delete(id);}
  this.bindings.set(socket.id,{code:s.code,index});this.broadcast(s);
 }
 private leave(socket:Socket){const b=this.bindings.get(socket.id);this.bindings.delete(socket.id);if(b){const s=this.sessions.get(b.code);if(s)this.broadcast(s);}}
 register(socket:Socket){
  let allowance=40,updated=this.now();
  const handle=(event:string,fn:(p:Record<string,unknown>)=>unknown)=>socket.on(event,(payload:unknown,ack?: (r:unknown)=>void)=>{
    if(typeof ack!=='function')return;
    const now=this.now();allowance=Math.min(40,allowance+(now-updated)*0.02);updated=now;
    if(allowance<1||!isRecord(payload)||payload.version!==1){ack({ok:false,error:'Unsupported or too frequent request.'});return;}allowance--;
    try{ack({ok:true,...fn(payload) as object});}catch(error){ack({ok:false,error:error instanceof Error?error.message:'Expedition unavailable.'});}
  });
  handle('expedition:create',p=>{
   if(!validToken(p.token)||!['CAMPAIGN','ENDLESS'].includes(p.mode as string)||![1,2].includes(p.seats as number))throw new Error('Choose a valid expedition configuration.');
   const ip=socket.handshake.address;const now=this.now();const quota=this.creates.get(ip);if(quota&&quota.until>now&&quota.count>=10)throw new Error('Too many new expeditions. Try again in a minute.');this.creates.set(ip,quota&&quota.until>now?{...quota,count:quota.count+1}:{count:1,until:now+60000});
   if(this.sessions.size>=100)throw new Error('Expedition capacity reached. Try again later.');
   const code=randomBytes(5).toString('hex').toUpperCase(),seed=randomBytes(4).readUInt32BE();
   const s:Session={version:1,code,seats:p.seats as 1|2,members:[{hash:hash(p.token),name:this.name(p.name),seq:0,ready:false}],state:createAdventure(p.mode as 'CAMPAIGN'|'ENDLESS',seed),started:false,paused:false,createdAt:this.now(),updatedAt:this.now(),revision:0};
   this.store.save(s);this.sessions.set(code,s);this.bind(socket,s,0);return {session:this.public(s,0)};
  });
  handle('expedition:join',p=>{
   if(!validToken(p.token)||typeof p.code!=='string'||!/^[A-F0-9]{10}$/i.test(p.code))throw new Error('Enter a valid expedition code.');
   const code=p.code.toUpperCase();let s=this.sessions.get(code)??this.store.load(code);
   if(!s||this.now()-s.updatedAt>7*86400_000)throw new Error('This expedition has expired. Create a new one.');
   if(this.sessions.size>=100&&!this.sessions.has(code))throw new Error('Expedition capacity reached.');
   s=structuredClone(s);const identity=hash(p.token);let index=s.members.findIndex(m=>m.hash===identity);
   if(index<0){if(s.started||s.members.length>=s.seats)throw new Error('This expedition is full.');index=s.members.length;s.members.push({hash:identity,name:this.name(p.name),seq:0,ready:false});}
   this.persist(s);this.bind(socket,s,index);return {session:this.public(s,index)};
  });
  handle('expedition:ready',()=>{const {s,index}=this.bound(socket);if(s.started)throw new Error('Expedition already started.');const next=structuredClone(s);next.members[index].ready=!next.members[index].ready;
   if(next.members.length===next.seats&&next.members.every((m,i)=>m.ready&&this.connected(next.code,i)))next.started=true;
   this.persist(next);return {session:this.public(next,index)};
  });
  handle('expedition:pause',()=>{const {s,index}=this.bound(socket);if(!s.started)throw new Error('Ready the team first.');const next={...s,paused:!s.paused};this.persist(next);return {session:this.public(next,index)};});
  handle('expedition:action',p=>{
   const {s,index}=this.bound(socket);
   if(!Number.isSafeInteger(p.seq)||!validAdventureAction(p.action))throw new Error('Invalid action.');
   if(p.seq===s.members[index].seq)return {session:this.public(s,index),duplicate:true};
   if(p.seq!==s.members[index].seq+1)throw new Error('Action sequence is stale. Reconnect to resynchronize.');
   if(!s.started||s.paused||s.members.length!==s.seats||s.members.some((_,i)=>!this.connected(s.code,i)))throw new Error('Waiting for the expedition team.');
   if(s.seats===2&&p.action.type==='COMMAND')throw new Error('Your teammate controls their own explorer.');
   if(index!==0&&['CONTINUE','REWARD','EXTRACT','ROUTE','TRAVEL'].includes(p.action.type))throw new Error('The host chooses the next destination and upgrades.');
   const key=`${s.code}:${index}`,now=this.now();if(now<(this.readyAt.get(key)??0))throw new Error('Movement is cooling down.');
   const next=structuredClone(s);next.state=applyAdventureAction(s.state,index as 0|1,p.action);next.members[index].seq=p.seq as number;
   this.persist(next);
   this.readyAt.set(key,now+(this.options.cooldownMs??(p.action.type==='MOVE'&&next.state.players[index].lastStep.event==='GRAVITY_SLOW'&&!s.state.upgrades.includes('cryo')?450:180)));
   return {session:this.public(next,index)};
  });
  handle('expedition:rematch',()=>{
   const {s,index}=this.bound(socket);if(!['COMPLETE','FAILED','EXTRACTED'].includes(s.state.phase))throw new Error('Finish or extract before starting another expedition.');
   const votes=[...new Set([...(s.rematchVotes??[]),index])];
   if(votes.length<s.seats){const next={...s,rematchVotes:votes};this.persist(next);return {session:this.public(next,index)};}
   const next:Session={...s,code:randomBytes(5).toString('hex').toUpperCase(),state:createAdventure(s.state.mode,randomBytes(4).readUInt32BE()),started:false,paused:false,revision:0,rematchVotes:[],createdAt:this.now(),updatedAt:this.now(),members:s.members.map(m=>({...m,seq:0,ready:false}))};
   this.store.save(next);this.sessions.set(next.code,next);for(const binding of this.bindings.values())if(binding.code===s.code)binding.code=next.code;this.sessions.delete(s.code);this.broadcast(next);return {session:this.public(next,index)};
  });
  handle('expedition:leave',()=>{this.leave(socket);return {};});
  handle('expedition:rankings',()=>({rankings:this.store.rankings()}));
  socket.on('disconnect',()=>this.leave(socket));
 }
 private name(value:unknown){return typeof value==='string'?value.trim().slice(0,20)||'Explorer':'Explorer';}
 private bound(socket:Socket){const binding=this.bindings.get(socket.id);const s=binding?this.sessions.get(binding.code):undefined;if(!s||!binding)throw new Error('Join an expedition first.');return {s,index:binding.index};}
 private tick(){if(this.closed)return;if(this.now()-this.lastCleanup>60000){this.lastCleanup=this.now();this.store.cleanup();for(const [key,quota] of this.creates)if(quota.until<this.now())this.creates.delete(key);for(const [code,s]of this.sessions)if(this.now()-s.updatedAt>1800000&&!s.members.some((_,i)=>this.connected(code,i)))this.sessions.delete(code);}
 for(const s of this.sessions.values()){
  if(s.seats!==1||!s.started||s.paused||s.state.phase!=='PLAYING'||!this.connected(s.code,0))continue;
  try{const next=tickCompanion(s.state);if(next!==s.state)this.persist({...s,state:next});}catch{for(const [id,b]of this.bindings)if(b.code===s.code)this.io.sockets.sockets.get(id)?.emit('expedition:error',{error:'Checkpoint storage unavailable. Expedition paused.'});s.paused=true;}
 } }
 close(){this.closed=true;clearInterval(this.timer);this.store.close();}
}
