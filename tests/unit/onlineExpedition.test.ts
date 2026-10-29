import {afterEach,describe,expect,it} from 'vitest';
import {createServer} from 'http';
import {Server} from 'socket.io';
import {io,Socket} from 'socket.io-client';
import {mkdtemp,rm} from 'fs/promises';
import {tmpdir} from 'os';
import path from 'path';
import {randomUUID} from 'crypto';
import {ExpeditionManager,ExpeditionStore} from '../../src/server/expeditions';
import {adventureRoom,validateAdventureRoom} from '../../src/shared/adventure';
import type {ExpeditionPublic} from '../../src/shared/expeditionProtocol';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
function request(socket:Socket,event:string,payload:object={}):Promise<any>{return new Promise((resolve,reject)=>socket.timeout(5000).emit(event,{version:1,...payload},(e:Error,r:any)=>e?reject(e):resolve(r)));}
async function setup(file:string){let clock=Date.now();const http=createServer(),server=new Server(http),store=new ExpeditionStore(file),manager=new ExpeditionManager(server,store,{cooldownMs:0,tickMs:100000,now:()=>clock});server.on('connection',socket=>manager.register(socket));await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));const port=(http.address() as {port:number}).port;const sockets:Socket[]=[];
 async function client(){const socket=io(`http://127.0.0.1:${port}`,{transports:['websocket'],reconnection:false});sockets.push(socket);await new Promise<void>(r=>socket.on('connect',()=>r()));return socket;}
 let closed=false;async function close(){if(closed)return;closed=true;for(const s of sockets)s.disconnect();manager.close();await new Promise<void>(r=>server.close(()=>r()));}
 cleanup.push(close);return {client,close,store,advance:()=>{clock+=200;}};
}
describe('Authoritative persisted expeditions',()=>{
 it('finishes all 18 rooms, rejects unauthorized and duplicate actions, then restores both private seats after restart',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'expedition-'));cleanup.push(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'sessions.sqlite');let app=await setup(file);const a=await app.client(),b=await app.client(),outsider=await app.client(),tokenA=randomUUID(),tokenB=randomUUID();
  let r=await request(a,'expedition:create',{token:tokenA,name:'Alpha',mode:'CAMPAIGN',seats:2});expect(r.ok).toBe(true);let s:ExpeditionPublic=r.session;const code=s.code;
  expect(JSON.stringify(s)).not.toContain(tokenA);expect(JSON.stringify(s)).not.toContain('hash');
  expect((await request(b,'expedition:join',{code,token:tokenB,name:'Beta'})).ok).toBe(true);
  expect((await request(outsider,'expedition:action',{seq:1,action:{type:'MOVE',dr:1,dc:0}})).ok).toBe(false);
  expect((await request(outsider,'expedition:join',{code,token:randomUUID()})).ok).toBe(false);
  await request(a,'expedition:ready');r=await request(b,'expedition:ready');s=r.session;expect(s.started).toBe(true);
  const forged=await request(a,'expedition:action',{seq:1,action:{type:'WAIT',state:{row:7,col:7,keyMask:7}}});expect(forged.ok).toBe(true);expect(forged.session.state.players[0].row).toBe(0);expect(forged.session.state.players[0].keyMask).toBe(0);
  const seq=[1,0];
  expect((await request(a,'expedition:action',{seq:9,action:{type:'MOVE',dr:1,dc:0}})).ok).toBe(false);
  expect((await request(a,'expedition:action',{seq:1,action:{type:'MOVE',dr:6,dc:0}})).ok).toBe(false);
  for(let room=0;room<18;room++){
   const proof=validateAdventureRoom(adventureRoom(s.state));expect(proof.valid).toBe(true);
   for(const step of proof.actions){app.advance();r=await request(step.actor===0?a:b,'expedition:action',{seq:++seq[step.actor],action:step.action});expect(r.ok,r.error).toBe(true);s=r.session;}
   expect(s.state.phase).toBe(room===17?'COMPLETE':'CHECKPOINT');
   if(room<17){app.advance();r=await request(a,'expedition:action',{seq:++seq[0],action:{type:'CONTINUE'}});s=r.session;}
  }
  const moves=s.state.players[0].moves;app.advance();r=await request(a,'expedition:action',{seq:seq[0],action:{type:'MOVE',dr:1,dc:0}});expect(r.duplicate).toBe(true);expect(r.session.state.players[0].moves).toBe(moves);
  await app.close();app=await setup(file);const a2=await app.client(),b2=await app.client();r=await request(a2,'expedition:join',{code,token:tokenA});expect(r.session.state.phase).toBe('COMPLETE');expect(r.session.waiting).toBe(true);r=await request(b2,'expedition:join',{code,token:tokenB});expect(r.session.waiting).toBe(false);expect(r.session.seq).toBe(seq[1]);
 },30000);
 it('persists verified endless extraction and pauses while a teammate is disconnected',async()=>{
  const app=await setup(':memory:'),a=await app.client(),b=await app.client();let r=await request(a,'expedition:create',{token:randomUUID(),mode:'ENDLESS',seats:2,name:'Endurance'}),s:ExpeditionPublic=r.session;const token=randomUUID();await request(b,'expedition:join',{code:s.code,token});await request(a,'expedition:ready');r=await request(b,'expedition:ready');s=r.session;
  b.disconnect();await new Promise(r=>setTimeout(r,10));expect((await request(a,'expedition:action',{seq:1,action:{type:'WAIT'}})).ok).toBe(false);
  const b2=await app.client();await request(b2,'expedition:join',{code:s.code,token});const seq=[0,0];
  for(let room=0;room<3;room++){const proof=validateAdventureRoom(adventureRoom(s.state));expect(proof.valid).toBe(true);for(const step of proof.actions){app.advance();r=await request(step.actor===0?a:b2,'expedition:action',{seq:++seq[step.actor],action:step.action});expect(r.ok,r.error).toBe(true);s=r.session;}if(room<2){app.advance();r=await request(a,'expedition:action',{seq:++seq[0],action:{type:'CONTINUE'}});s=r.session;}}
  app.advance();r=await request(a,'expedition:action',{seq:++seq[0],action:{type:'EXTRACT'}});expect(r.session.state.phase).toBe('EXTRACTED');expect(app.store.rankings()).toHaveLength(1);expect(app.store.rankings()[0].floors).toBe(1);
  const oldCode=r.session.code;await request(a,'expedition:rematch');r=await request(b2,'expedition:rematch');expect(r.session.code).not.toBe(oldCode);expect(r.session.started).toBe(false);expect(r.session.seq).toBe(0);expect(r.session.state.roomIndex).toBe(0);expect(app.store.rankings()).toHaveLength(1);
 },20000);
});
