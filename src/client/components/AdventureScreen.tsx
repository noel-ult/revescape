import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ArrowDown, ArrowRight, Bot, Compass, Flag, Radio, Shield, ScanLine, RotateCcw } from 'lucide-react';
import { ADVENTURE_SAVE_KEY, AdventureState, adventureRoom, advanceAdventure, chooseReward, commandCompanion, createAdventure, extractAdventure, moveAdventure, restoreAdventure, scanAdventure, tickCompanion } from '../../shared/adventure';
import { AdventureAction, adventureGrid, applyAdventureAction, CAMPAIGN_ROOMS, CAMPAIGN_SECTORS, pulseActive } from '../../shared/adventure';
import { PROFILE_KEY, mergeAdventureProfile, ownedAccents, restoreProfile } from '../../shared/adventureProfile';
import type { ExpeditionPublic } from '../../shared/expeditionProtocol';
import { humanViewStep } from '../../shared/movement';
import { soundFX } from '../lib/sound';
import { PuzzleGrid } from './PuzzleGrid';
import { AccessInventory } from './AccessInventory';

const rewards: Record<string,string> = { scout:'Scout module · ASTRA explores discovered frontiers', repair:'Repair · restore 1 integrity', shield:'Hazard shield · absorb one mine loss', scanner:'Scanner · reveal a wider area once', cryo:'Cryo stabilizer · faster coolant recovery' };
function load(mode: AdventureState['mode']) {
  try { const saved=restoreAdventure(JSON.parse(localStorage.getItem(`${ADVENTURE_SAVE_KEY}-${mode}`) ?? 'null')); if(saved?.mode===mode) return saved; } catch { /* invalid saves start a fresh session */ }
  return createAdventure(mode, Math.floor(Math.random()*4294967296));
}
export function AdventureScreen({mode,onExit,online,onAction,onPause,busy=false}:{mode: AdventureState['mode'];onExit:()=>void;online?:ExpeditionPublic;onAction?:(action:AdventureAction)=>void;onPause?:()=>void;busy?:boolean}) {
  const [localState,setState]=useState(()=>load(mode));
  const state=online?.state??localState;
  const [profile,setProfile]=useState(()=>{try{return restoreProfile(JSON.parse(localStorage.getItem(PROFILE_KEY)??'null'));}catch{return restoreProfile(null);}});
  const dispatch=(action:AdventureAction)=>{if(online)onAction?.(action);else setState(s=>applyAdventureAction(s,0,action));};
  const [storageError,setStorageError]=useState('');
  const [targeting,setTargeting]=useState(false);
  const [journal,setJournal]=useState(false);
  const [mapOpen,setMapOpen]=useState(false);
  const [hintLevel,setHintLevel]=useState(0);
  const [restart,setRestart]=useState(false);
  const [localPaused,setPaused]=useState(false);
  const paused=online?.paused??localPaused;
  const [seed,setSeed]=useState('');
  const [seedError,setSeedError]=useState('');
  const [importText,setImportText]=useState('');
  const [importOpen,setImportOpen]=useState(false);
  const [transferMessage,setTransferMessage]=useState('');
  const lastMove=useRef(0);
  const priorEvent=useRef('');
  const priorPowered=useRef(0);
  useEffect(()=>{const signature=`${state.roomIndex}:${state.players[0].moves}:${state.powered.length}:${state.phase}`;if(priorEvent.current&&priorEvent.current!==signature){if(state.phase==='CHECKPOINT'||state.phase==='COMPLETE')soundFX.playSuccess();else if(state.players[0].lastStep.event==='COLLECT_KEY')soundFX.playKeyPickup();else if(state.powered.length>priorPowered.current)soundFX.playSwitchToggle();else if(state.players[0].lastStep.event==='TRAP_RESET_TRIGGERED')soundFX.playError();}priorPowered.current=state.powered.length;priorEvent.current=signature;},[state]);
  const room=adventureRoom(state), human=state.players[online?.you??0], companion=state.players[online?.you===1?0:1];
  const sector=CAMPAIGN_SECTORS[Math.floor(state.roomIndex/3)]??CAMPAIGN_SECTORS[0];
  const displayGrid=adventureGrid(state);
  const jammed=(human.empRemainingTurns??0)>0;
  const displayedStep=humanViewStep(displayGrid,human);
  const destinations=CAMPAIGN_SECTORS.map((s,i)=>({...s,theme:CAMPAIGN_ROOMS[i*3].theme,objective:s.description,mechanic:'Connected station sector',grid:CAMPAIGN_ROOMS[i*3].grid}));
  const travel=(index:number)=>{if(online&&online.you!==0){setTransferMessage('The host chooses the destination.');return;}if(index>0&&!state.completed.includes(CAMPAIGN_ROOMS[index-1].id)){setTransferMessage('Restore the previous sector to unlock this destination.');return;}dispatch({type:'TRAVEL',roomIndex:index});setMapOpen(false);};
  const active=state.phase==='PLAYING' && !paused && !restart && !importOpen && !busy && !mapOpen && (!online || (online.started&&!online.waiting));
  useEffect(()=>{ if(online)return;try { localStorage.setItem(`${ADVENTURE_SAVE_KEY}-${mode}`,JSON.stringify(state)); setStorageError(''); } catch { setStorageError('Browser storage is unavailable. Export your save before leaving.'); } },[state,mode,online]);
  useEffect(()=>{
    if(!active || online) return;
    const timer=setInterval(()=>{ if(!document.hidden && !document.getElementById('root')?.inert) setState(tickCompanion); },400);
    return ()=>clearInterval(timer);
  },[active,online]);
  const move=useCallback((dr:number,dc:number)=>{
    if(!active || document.getElementById('root')?.inert) return;
    const cooldown=human.lastStep.event==='GRAVITY_SLOW' && !state.upgrades.includes('cryo')?450:180;
    if(performance.now()-lastMove.current<cooldown) return;
    lastMove.current=performance.now();if(online)onAction?.({type:'MOVE',dr,dc});else setState(s=>moveAdventure(s,0,dr,dc));
  },[active,human.lastStep.event,state.upgrades,online,onAction]);
  useEffect(()=>{ const handler=(e:KeyboardEvent)=>{
    if(e.isComposing || (e.target as HTMLElement).closest('input,textarea,select')) return;
    const dir:Record<string,[number,number]>={ArrowUp:[-1,0],w:[-1,0],ArrowDown:[1,0],s:[1,0],ArrowLeft:[0,-1],a:[0,-1],ArrowRight:[0,1],d:[0,1]};
    if(dir[e.key]) { e.preventDefault(); move(...dir[e.key]); }
  }; window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler); },[move]);
  useEffect(()=>{setProfile(previous=>mergeAdventureProfile(previous,state));},[state]);
  useEffect(()=>{try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{setStorageError('Career rewards could not be saved on this device.');}},[profile]);
  const exportSave=()=>{ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`reverse-escape-${mode.toLowerCase()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setTransferMessage('Save exported. Keep this file to move your progress to another device.'); };
  const importSave=()=>{ try { const next=restoreAdventure(JSON.parse(importText));if(!next || next.mode!==mode) throw new Error();setState(next);setImportOpen(false);setImportText('');setTransferMessage('Save restored.'); } catch { setTransferMessage('Invalid save. Paste a supported save for this game mode.'); } };
  return <div className={`expedition-shell accent-${profile.accent}`}>
    <header className="expedition-heading"><div><span className="architect-eyebrow">{mode==='CAMPAIGN'?`${sector.name} / Adventure`:`Endless expedition / ${online?'Verified online':'Local run'}`} · {state.phase.toLowerCase()}</span><h1>{room.name}</h1><p>{online?.seats===2?room.objective.replaceAll('ASTRA','your teammate'):room.objective}</p></div><button className="architect-btn" onClick={onExit}><ArrowLeft size={16}/>Command deck</button></header>
    <div className="adventure-route" aria-label="Mission route">{[0,1,2].map(i=><span key={i} className={state.roomIndex%3===i?'active':''}>{i+1} / {mode==='CAMPAIGN'?CAMPAIGN_ROOMS[Math.floor(state.roomIndex/3)*3+i]?.name:'Chamber'} {state.roomIndex%3>i?'✓':''}</span>)}</div>
    <div className="expedition-layout">
      <section className="expedition-world" aria-label="Adventure room">
        <PuzzleGrid key={`${mode}-${state.roomIndex}-${mapOpen}`} sectorMap={mapOpen} sectors={destinations} selectedSectorId={room.sector} completedSectors={CAMPAIGN_SECTORS.filter((_,i)=>CAMPAIGN_ROOMS.slice(i*3,i*3+3).every(r=>state.completed.includes(r.id))).map(s=>s.id)} onSectorSelect={id=>{const index=CAMPAIGN_SECTORS.findIndex(s=>s.id===id);if(index>=0)travel(index*3);}} grid={displayGrid} theme={room.theme} adventureMarkers={[...(room.circuits??[]).map(c=>({...c,links:c.gates,label:state.powered.includes(c.id)?"✓ "+c.name:c.name,color:state.powered.includes(c.id)?"#88e8cf":"#ffb47f"})),...(room.terminals??[]).map(t=>({...t,label:"Log",color:"#94cfff"})),...(room.pulses??[]).map(p=>({...p,label:pulseActive(p,state.clock)?"PULSE ACTIVE":"SAFE",color:pulseActive(p,state.clock)?"#ff7777":"#88e8cf"})),...(room.salvage??[]).filter(p=>!state.salvage.includes(`${room.id}:${p.row},${p.col}`)).map(p=>({...p,label:"Salvage",color:"#ffdf88"}))].filter(p=>!jammed||Math.abs(p.row-human.row)+Math.abs(p.col-human.col)<=1)} roomLabel={room.name.toUpperCase()} followLabel="Follow explorer" interactionHint={targeting ? "Click a discovered cell to assign ASTRA" : "WASD / arrows to move · Drag to orbit · Scroll to zoom"} currentStep={mapOpen?null:displayedStep} viewMode={jammed&&!mapOpen?'AI_FOG':'WORLD'} opponentStep={mapOpen||jammed&&Math.abs(human.row-companion.row)+Math.abs(human.col-companion.col)>1?null:companion.lastStep} stepDurationMs={180}
          interactive={targeting} onCellInteract={(row,col)=>{ dispatch({type:'COMMAND',command:'INTERACT',target:{row,col}});setTargeting(false); }} />
        <div className="expedition-world-label"><Radio size={14}/>YOU / MINT <span>{online?.seats===2?'TEAMMATE':'ASTRA'} / AMBER</span><span>Deck {human.lastStep.level??0} · ({human.row},{human.col})</span></div>
        {targeting && <div className="adventure-target-note" role="status">Click a discovered tile to send ASTRA there. <button onClick={()=>setTargeting(false)}>Cancel</button></div>}
      </section>
      <aside className="expedition-console">
        <div className="companion-heading"><span className="companion-avatar"><Bot size={26}/></span><div><small>EXPEDITION COMPANION</small><h2>{online?.seats===2?online.members[online.you===0?1:0]?.name??'Teammate':'ASTRA'} <span>{online?.waiting?'WAITING':'ONLINE'}</span></h2></div></div>
        <p className="adventure-status" role="status" data-testid="adventure-status">{state.message}</p>
        {(!online||online.seats===1)&&<div className="companion-commands" role="group" aria-label="Companion commands">
          <button disabled={!active} aria-pressed={state.command==='FOLLOW'} onClick={()=>{setTargeting(false);dispatch({type:'COMMAND',command:'FOLLOW'});}}>Follow me</button>
          <button disabled={!active} aria-pressed={state.command==='HOLD'} onClick={()=>{setTargeting(false);dispatch({type:'COMMAND',command:'HOLD'});}}>Hold position</button>
          <button disabled={!active} aria-pressed={targeting} onClick={()=>setTargeting(!targeting)}>Interact here</button>
          <button disabled={!active} onClick={()=>{setTargeting(false);dispatch({type:'COMMAND',command:'REGROUP'});}}>Regroup</button>
          {(mode==='CAMPAIGN'||state.upgrades.includes('scout'))&&<button disabled={!active} aria-pressed={state.command==='SCOUT'} onClick={()=>dispatch({type:'COMMAND',command:'SCOUT'})}>Scout ahead</button>}
          <button disabled={!active} onClick={()=>{setJournal(true);setHintLevel(n=>Math.min(3,n+1));}}>Help with this room</button>
        </div>}
        <div className="adventure-pad" role="group" aria-label="Movement controls">{[[-1,0,'Move up',ArrowUp],[0,-1,'Move left',ArrowLeft],[1,0,'Move down',ArrowDown],[0,1,'Move right',ArrowRight]].map(([dr,dc,label,Icon],i)=>{const Glyph=Icon as typeof ArrowUp;return <button key={i} disabled={!active || human.lastStep.event==='EXIT'} aria-label={label as string} onClick={()=>move(dr as number,dc as number)}><Glyph size={22}/></button>;})}</div>
        <p className="adventure-control-note">WASD / arrow keys · {human.moves} moves · {state.discovered.length}/64 discovered</p>
        <AccessInventory keyMask={human.keyMask} switchMask={human.switchMask}/>
        {mode==='ENDLESS' && <div className="endless-readout"><span><Shield size={15}/>Integrity {state.integrity}/5</span><span>{state.floors} floors secured</span><small>Seed {state.seed} · difficulty {Math.min(9,1+Math.floor(state.roomIndex/3))}</small>{state.upgrades.map(u=><small key={u}>{rewards[u]}</small>)}{state.upgrades.includes('scanner')&&<button className="architect-btn" disabled={!active} onClick={()=>dispatch({type:'SCAN'})}><ScanLine size={15}/>Use scanner</button>}</div>}
        <button className="architect-btn" onClick={()=>online?onPause?.():setPaused(!paused)} disabled={state.phase!=='PLAYING'}>{paused?'Resume expedition':'Pause expedition'}</button>
      </aside>
    </div>
    <section className="adventure-machinery architect-panel" aria-label="Room machinery"><div><h2>Systems & discoveries</h2><p>Beat {state.clock} · Stand beside a console to operate it. Wait advances pulse timing safely.</p></div><button className="architect-btn" disabled={!active} onClick={()=>dispatch({type:'WAIT'})}>Wait one beat</button>
      {(room.circuits??[]).map(c=><button key={c.id} className="architect-btn" disabled={!active||state.powered.includes(c.id)} onClick={()=>dispatch({type:'INTERACT',id:c.id})}>{state.powered.includes(c.id)?'✓ Powered':`Restore ${c.name}`} ({c.row},{c.col})</button>)}
      {(room.terminals??[]).filter(t=>state.discovered.includes(`${t.row},${t.col}`)).map(t=><button className="architect-btn" key={t.id} disabled={!active} onClick={()=>dispatch({type:'INTERACT',id:t.id})}>{state.logs.includes(t.id)?'Read':'Recover'} {t.title} ({t.row},{t.col})</button>)}
      {(room.pulses??[]).map((p,i)=><span className={pulseActive(p,state.clock)?'pulse-danger':'pulse-safe'} key={i}>Barrier ({p.row},{p.col}): {pulseActive(p,state.clock)?'ACTIVE — wait':'SAFE TO CROSS'}</span>)}
    </section>
    {mode==='CAMPAIGN'&&<section className="adventure-sector-strip" aria-label="Campaign sectors">{CAMPAIGN_SECTORS.map((s,i)=><button disabled={!['CHECKPOINT','COMPLETE'].includes(state.phase)||(i>0&&!state.completed.includes(CAMPAIGN_ROOMS[i*3-1].id))||!!online&&online.you!==0} onClick={()=>travel(i*3)} className={i===Math.floor(state.roomIndex/3)?'selected':''} key={s.id}><small>SECTOR {i+1}</small><strong>{s.name}</strong><span>{CAMPAIGN_ROOMS.slice(i*3,i*3+3).filter(r=>state.completed.includes(r.id)).length}/3 rooms restored</span></button>)}</section>}
    {mode==='ENDLESS'&&state.phase==='CHECKPOINT'&&<div className="checkpoint-actions" role="group" aria-label="Next route"><button className="architect-btn" aria-pressed={(state.nextRoute??state.routeChoice)==='SALVAGE'} onClick={()=>dispatch({type:'ROUTE',choice:'SALVAGE'})}>Maintenance route</button><button className="architect-btn" aria-pressed={(state.nextRoute??state.routeChoice)==='SIGNAL'} onClick={()=>dispatch({type:'ROUTE',choice:'SIGNAL'})}>Signal route</button><span>Choose a different seeded puzzle branch for the next room.</span></div>}
    {state.phase!=='PLAYING' && <section className="expedition-checkpoint" aria-label="Checkpoint"><span className="architect-eyebrow">{state.phase==='FAILED'?'SIGNAL LOST':state.phase==='EXTRACTED'?'SAFE RETURN':'MISSION UPDATE'}</span><h2>{state.phase==='COMPLETE'?'Station restored. Welcome home.':state.phase==='FAILED'?'Your expedition has ended.':state.phase==='EXTRACTED'?'Expedition recovered.':'Both explorers are safe.'}</h2><p>{state.message}</p><p>{mode==='CAMPAIGN'&&state.mastery[room.id]?`${state.mastery[room.id].stars}/3 mastery stars · ${state.mastery[room.id].moves} combined moves`: `${state.floors} floors secured`} · {state.salvage.filter(id=>id.startsWith(room.id+':')).length} salvage recovered</p>
      {state.rewardChoices.length>0 && <div className="upgrade-choices">{state.rewardChoices.map(r=><button className="architect-btn" key={r} disabled={busy||!!online&&online.you!==0} onClick={()=>dispatch({type:'REWARD',reward:r})}>{state.upgrades.includes(r)?'Module already installed · repair 1 integrity':rewards[r]}</button>)}</div>}
      {state.phase==='CHECKPOINT' && <div className="checkpoint-actions"><button className="architect-btn architect-btn-primary" disabled={state.rewardChoices.length>0||busy||!!online&&online.you!==0} onClick={()=>{setTargeting(false);dispatch({type:'CONTINUE'});}}>Continue to next room<ArrowRight size={16}/></button>{mode==='ENDLESS'&&(state.roomIndex+1)%3===0&&<button className="architect-btn" onClick={()=>dispatch({type:'EXTRACT'})}><Flag size={16}/>Extract safely</button>}</div>}
    </section>}
    <div className="adventure-utilities">{mode==='CAMPAIGN'&&<button className="architect-btn" disabled={!mapOpen&&!['CHECKPOINT','COMPLETE'].includes(state.phase)} onClick={()=>{setTargeting(false);setMapOpen(!mapOpen);}}>{mapOpen?'Return to room':'Orbital navigation'}</button>}<button className="architect-btn" onClick={()=>setJournal(!journal)}><Compass size={15}/>{journal?'Close journal':'Mission journal'}</button><button className="architect-btn" disabled={!!online} onClick={()=>setRestart(!restart)}><RotateCcw size={15}/>Restart {mode==='ENDLESS'?'run':'room'}</button><button className="architect-btn" disabled={!!online} onClick={exportSave}>Export save</button><button className="architect-btn" disabled={!!online} onClick={()=>{setImportOpen(!importOpen);setTransferMessage('');}}>Import save</button></div>
    {paused && <p role="status" className="architect-message">Expedition paused. ASTRA and movement are stopped.</p>}
    {journal && <section className="architect-panel adventure-journal"><h2>Mission journal</h2><p>{hintLevel<=1?room.objective:room.hint}</p>{hintLevel>=3&&<p>Suggested coordination: {room.solution?.map(t=>`${t.actor===0?'Explorer':'Partner'} to (${t.row},${t.col})${t.interact?' and restore '+t.interact:''}`).join(' → ')}</p>}<button className="architect-btn" onClick={()=>setHintLevel(n=>Math.min(3,n+1))}>Reveal next hint ({Math.min(3,hintLevel+1)}/3)</button><details><summary>Recovered station records</summary>{CAMPAIGN_ROOMS.flatMap(r=>r.terminals??[]).filter(t=>profile.records.some(id=>id===t.id||id.endsWith('-'+t.id))).map(t=><article key={t.id}><h3>{t.title}</h3><p>{t.text}</p></article>)}</details><p>ASTRA uses a deterministic planner and shared discoveries. Follow brings it to your position; Interact sends it to a discovered tile and holds there. Call Regroup after recovering a bypass core. Both explorers must extract.</p><p>{state.completed.length} rooms secured on this run. {mode==='CAMPAIGN'?'Complete all 18 rooms to restore the station. Every three rooms unlock the next sector.':'Every third room offers upgrades and safe extraction. Mines cost integrity; reaching zero ends the run.'}</p><p>Your save stays on this device. Online expeditions verify actions and persist checkpoints on the server. Local progress can be exported. ASTRA uses shared discoveries and deterministic search; the studio scout separately uses frontier exploration and A*.</p></section>}
    <section className="adventure-career architect-panel"><h2>Explorer career</h2><p>{Object.keys(profile.mastery).length}/18 rooms mastered · {Object.values(profile.mastery).reduce((n,m)=>n+m.stars,0)} stars · {profile.records.length} records · Best floor {profile.bestFloor} · {profile.runs} archived runs</p><div className="checkpoint-actions" role="group" aria-label="Console accent">{ownedAccents(profile).map(accent=><button className="architect-btn" key={accent} aria-pressed={profile.accent===accent} onClick={()=>setProfile(p=>({...p,accent}))}>{accent} console</button>)}</div><small>Amber console unlocks at 3 mastered rooms; violet at 9. Cosmetic only.</small></section>
    {restart && <section className="architect-panel adventure-journal"><h2>Restart {mode==='ENDLESS'?'this run':'this room'}?</h2><p>{mode==='ENDLESS'?'This replaces the current endless save. Export it first if you want to keep it.':'Room inventory and positions will reset. Earlier completed rooms remain secured.'}</p>{mode==='ENDLESS'&&<label>Seed (optional)<input aria-label="Endless seed" value={seed} onChange={e=>setSeed(e.target.value)} placeholder="Random seed" inputMode="numeric"/></label>}{seedError&&<p role="alert">{seedError}</p>}<div className="checkpoint-actions"><button className="architect-btn architect-btn-primary" onClick={()=>{if(mode==='ENDLESS'&&seed!==''&&(!/^\d+$/.test(seed)||Number(seed)>4294967295)){setSeedError('Enter a whole seed from 0 to 4294967295.');return;}setState(s=>mode==='ENDLESS'?createAdventure(mode,seed===''?Math.floor(Math.random()*4294967296):Number(seed)):{...createAdventure(mode,s.seed),roomIndex:s.roomIndex,completed:s.completed});setRestart(false);setPaused(false);setTargeting(false);}}>Confirm restart</button><button className="architect-btn" onClick={()=>{setRestart(false);setSeedError('');}}>Keep playing</button></div></section>}
    {importOpen&&<section className="architect-panel adventure-journal"><label>Paste exported save<textarea className="resize-none" aria-label="Exported adventure save" value={importText} onChange={e=>setImportText(e.target.value)} rows={5}/></label><div className="checkpoint-actions"><button className="architect-btn" onClick={importSave}>Restore this save</button><button className="architect-btn" onClick={()=>setImportOpen(false)}>Cancel</button></div></section>}
    {(storageError||transferMessage)&&<p role="status" className="architect-message">{storageError||transferMessage}</p>}
  </div>;
}
