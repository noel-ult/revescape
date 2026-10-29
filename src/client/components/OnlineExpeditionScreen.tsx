import React, {useCallback,useEffect,useRef,useState} from 'react';
import type {AdventureAction,AdventureState} from '../../shared/adventure';
import type {ExpeditionPublic,ExpeditionRanking} from '../../shared/expeditionProtocol';
import {getPlayerToken,getSavedPlayerName,getSocket,savePlayerName} from '../lib/socket';
import {AdventureScreen} from './AdventureScreen';
const KEY='reverse-escape-online-expedition';
export function OnlineExpeditionScreen({onExit}:{onExit:()=>void}) {
 const [session,setSession]=useState<ExpeditionPublic|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(getSocket().connected);
 const [name,setName]=useState(()=>getSavedPlayerName()||'Explorer'),[mode,setMode]=useState<AdventureState['mode']>('CAMPAIGN'),[seats,setSeats]=useState<1|2>(2),[code,setCode]=useState('');
 const [rankings,setRankings]=useState<ExpeditionRanking[]>([]),[rankingLoaded,setRankingLoaded]=useState(false),[rankingOpen,setRankingOpen]=useState(false),[copied,setCopied]=useState(false);
 const [token]=useState(getPlayerToken),alive=useRef(true),inflight=useRef(false);
 const receive=useCallback((next:ExpeditionPublic)=>{if(!alive.current)return;setSession(old=>old&&old.code===next.code&&old.revision>next.revision?old:next);const url=new URL(location.href);if(url.searchParams.get('expedition')!==next.code){url.searchParams.set('expedition',next.code);url.searchParams.delete('room');history.replaceState({},'',url);}try{sessionStorage.setItem(KEY,next.code);}catch{/* keep session live */}},[]);
 const request=useCallback((event:string,payload:object,done?:(response:any)=>void)=>{
   if(inflight.current)return;inflight.current=true;setBusy(true);setError('');
   getSocket().timeout(8000).emit(event,{version:1,...payload},(timeout:Error|null,response:any)=>{
     inflight.current=false;if(!alive.current)return;setBusy(false);
     if(timeout||!response?.ok){setError(timeout?'The server did not respond. Reconnect to recover the saved checkpoint.':response?.error??'Expedition unavailable.');return;}
     if(response.session)receive(response.session);done?.(response);
   });
 },[receive]);
 useEffect(()=>{
  alive.current=true;const socket=getSocket();
  const resume=()=>{setConnected(true);let saved='';try{saved=sessionStorage.getItem(KEY)??'';}catch{}const urlCode=new URLSearchParams(location.search).get('expedition');if(urlCode||saved)request('expedition:join',{code:urlCode||saved,token,name:getSavedPlayerName()||'Explorer'});};
  const disconnect=()=>{setConnected(false);inflight.current=false;setBusy(false);};
  const replaced=()=>{setSession(null);setError('This expedition seat was opened in another window. Join again to recover it here.');};
  const storageError=(p:{error:string})=>setError(p.error);
  socket.on('connect',resume);socket.on('disconnect',disconnect);socket.on('expedition:state',receive);socket.on('expedition:replaced',replaced);socket.on('expedition:error',storageError);
  if(socket.connected)resume();
  return()=>{alive.current=false;socket.off('connect',resume);socket.off('disconnect',disconnect);socket.off('expedition:state',receive);socket.off('expedition:replaced',replaced);socket.off('expedition:error',storageError);};
 },[token,request,receive]);
 const leave=()=>{getSocket().emit('expedition:leave',{version:1},()=>{});try{sessionStorage.removeItem(KEY);}catch{}const url=new URL(location.href);url.searchParams.delete('expedition');history.replaceState({},'',url);onExit();};
 const loadRankings=()=>{setRankingOpen(true);request('expedition:rankings',{},r=>{setRankings(r.rankings);setRankingLoaded(true);});};
 const action=(a:AdventureAction)=>{if(session&&connected&&!busy)request('expedition:action',{seq:session.seq+1,action:a});};
 const invite=session?`${location.origin}${location.pathname}?expedition=${session.code}`:'';
 return <div>
  <section className={`online-expedition-bar ${session?.started?'online-expedition-compact':''}`} data-testid="online-session" data-seq={session?.seq} data-revision={session?.revision} aria-label="Online expedition session">
    <div><span className="architect-eyebrow">SERVER CHECKPOINTS / {connected?'CONNECTED':'RECONNECTING'}</span><h1>Online expedition</h1><p>{session?`Room ${session.code} · your seat ${session.you+1}/${session.seats}`:'Play the campaign or endless mode with a friend or ASTRA. Progress is verified and saved on the server.'}</p></div>
    {!session&&<div className="online-expedition-config">
      <label>Explorer callsign<input value={name} onChange={e=>{setName(e.target.value);savePlayerName(e.target.value);}} maxLength={20}/></label>
      <label>Expedition<select value={mode} onChange={e=>setMode(e.target.value as AdventureState['mode'])}><option value="CAMPAIGN">Campaign · 18 rooms</option><option value="ENDLESS">Endless expedition</option></select></label>
      <label>Team<select value={seats} onChange={e=>setSeats(Number(e.target.value) as 1|2)}><option value={2}>Two human explorers</option><option value={1}>You and ASTRA</option></select></label>
      <button className="architect-btn architect-btn-primary" disabled={busy||!connected} onClick={()=>request('expedition:create',{token,name,mode,seats})}>Create expedition</button>
      <form noValidate onSubmit={e=>{e.preventDefault();request('expedition:join',{code,token,name});}}><label>Expedition code<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={10}/></label><button className="architect-btn" disabled={busy||!connected||code.length!==10}>Join expedition</button></form>
    </div>}
    {session&&<details className="online-session-details" open={!session.started}><summary>Invite and team controls</summary><div className="online-expedition-controls">
      <label>Invite your teammate<input aria-label="Expedition invite URL" value={invite} readOnly onFocus={e=>e.target.select()}/></label>
      <button className="architect-btn" onClick={async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true);}catch{setError('Clipboard unavailable. Select and copy the invite link.');}}}>{copied?'Invite copied':'Copy invite'}</button>
      <div className="expedition-members">{session.members.map((m,i)=><span key={i}>{m.name} · {m.connected?'connected':'disconnected'} · {m.ready?'ready':'not ready'}</span>)}</div>
      {!session.started&&<button className="architect-btn architect-btn-primary" disabled={busy||!connected} onClick={()=>request('expedition:ready',{})}>{session.members[session.you]?.ready?'Unready':'Ready for expedition'}</button>}
      {['COMPLETE','FAILED','EXTRACTED'].includes(session.state.phase)&&<button className="architect-btn architect-btn-primary" disabled={busy||!connected} onClick={()=>request('expedition:rematch',{})}>{session.rematchVotes?.includes(session.you)?'Waiting for teammate’s vote':'Start another expedition'}</button>}
      <button className="architect-btn" disabled={busy||!connected} onClick={()=>request('expedition:join',{code:session.code,token,name})}>Resync checkpoint</button>
    </div></details>}
    {session?.waiting&&session.started&&<p role="status">Waiting for your teammate to reconnect. Progression is paused.</p>}
    <div className="checkpoint-actions"><button className="architect-btn" onClick={loadRankings} disabled={busy||!connected}>Verified endless results</button><button className="architect-btn" onClick={leave}>Leave online expedition</button></div>
    {error&&<p className="architect-message" role="alert">{error}</p>}
    {rankingOpen&&<section aria-label="Verified endless results"><h2>Verified endless results</h2><p>Server-observed runs · most floors, then fewest moves. Anonymous callsigns.</p>{!rankingLoaded?<p role="status">Loading results…</p>:rankings.length===0?<p>No completed online endless runs yet.</p>:<ol>{rankings.map((r,i)=><li key={`${r.completed}-${i}`}>{r.names.join(' + ')} · {r.floors} floors · {r.moves} moves · seed {r.seed}</li>)}</ol>}<button className="architect-btn" onClick={()=>setRankingOpen(false)}>Close results</button></section>}
  </section>
  {session&&<AdventureScreen key={session.code} mode={session.state.mode} online={session} onAction={action} busy={busy||!connected} onPause={()=>request('expedition:pause',{})} onExit={leave}/>}
 </div>;
}
