import React,{useEffect,useMemo,useState} from 'react';
import {ArrowRight,ArrowUpRight,Box,CalendarDays,Compass,Flag,Handshake,Layers,Play,Radio,Users} from 'lucide-react';
import type {MatchMode} from '../../shared/types';
import {SHOWCASE_FACILITY} from '../../shared/facility';
import {runAutonomousAgent} from '../../shared/agent';
import {PuzzleGrid} from './PuzzleGrid';
interface LandingPageProps {
 onOpenOnlineExpedition:()=>void;onOpenAdventure:()=>void;onOpenEndless:()=>void;playerName:string;onChangePlayerName:(name:string)=>void;
 onCreateLobby:(duration:45|90,mode?:MatchMode)=>void;onOpenDaily:()=>void;onOpenSectors:()=>void;connected:boolean;pending?:boolean;
 onJoinLobby:(code:string)=>void;onStartSolo:()=>void;onOpenHelp:()=>void;errorMessage?:string|null;
}
export const LandingPage:React.FC<LandingPageProps>=p=>{
 const [joinCode,setJoinCode]=useState(''),[mode,setMode]=useState<MatchMode>('ARCHITECT'),[duration,setDuration]=useState<45|90>(90);
 const run=useMemo(()=>runAutonomousAgent(SHOWCASE_FACILITY),[]),[frame,setFrame]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setFrame(n=>(n+1)%(run.steps.length+5));},650);return()=>clearInterval(timer);},[run]);
 return <div className="mission-launcher">
  <div className="page-masthead"><div><span className="ui-kicker">OPERATIONS / MISSION SELECT</span><h1>Your next escape starts here.</h1></div><button className="text-action" onClick={p.onOpenHelp}>Open field guide<ArrowUpRight size={16}/></button></div>
  <section className="launch-stage" aria-label="Live orbital facility">
   <PuzzleGrid grid={SHOWCASE_FACILITY} currentStep={run.steps[Math.min(frame,run.steps.length-1)]} stepDurationMs={600} roomLabel="ORBITAL STATION / LIVE SCOUT"/>
   <div className="launch-stage-title"><span className="ui-kicker"><i/>MISSION AVAILABLE</span><h2>Recover<br/>the station.</h2><p>Six sectors. One way home.<br/>Explore with ASTRA at your side.</p><button className="launch-action" data-testid="adventure-btn" onClick={p.onOpenAdventure}><Play size={16} fill="currentColor"/>Continue adventure<ArrowRight size={19}/></button></div>
   <div className="launch-stage-stamp"><Radio size={15}/><span>LIVE SCOUT FEED<small>Partial observation / A* planning</small></span></div>
  </section>
  <section className="mission-deck" aria-label="Choose a game mode">
   <button data-testid="endless-btn" onClick={p.onOpenEndless}><span className="mode-art mode-art-endless"><Layers size={32}/><i/><i/><i/></span><span className="mode-copy"><small>ENDURANCE / PROCEDURAL</small><strong>Into the unknown</strong><span>Seeded endless expeditions</span></span><ArrowUpRight size={21}/></button>
   <button data-testid="online-expedition-btn" onClick={p.onOpenOnlineExpedition}><span className="mode-art mode-art-coop"><Users size={32}/><i/><i/></span><span className="mode-copy"><small>CO-OP / SERVER CHECKPOINTS</small><strong>Better together</strong><span>Online campaign & endless</span></span><ArrowUpRight size={21}/></button>
   <button data-testid="solo-challenge-btn" onClick={p.onStartSolo}><span className="mode-art mode-art-studio"><Box size={32}/><i/><i/></span><span className="mode-copy"><small>CREATE / TEST / SHARE</small><strong>Architect studio</strong><span>Build your own escape facility</span></span><ArrowUpRight size={21}/></button>
  </section>
  <div className="challenge-shortcuts"><button data-testid="sector-map-btn" onClick={p.onOpenSectors}><Compass size={17}/><strong>Solo expedition</strong><span>Eight classic challenge rooms</span><ArrowRight size={16}/></button><button data-testid="daily-challenge-btn" onClick={p.onOpenDaily}><CalendarDays size={17}/><strong>Today’s challenge</strong><span>Shared room · verified rankings</span><ArrowRight size={16}/></button></div>
  <section className="match-terminal" aria-label="Multiplayer lobby setup">
   <div className="match-terminal-heading"><div><span className="ui-kicker">PRIVATE MATCH / INVITE A FRIEND</span><h2>Make your move.</h2></div><span className="terminal-network"><i/>{p.connected?'LOBBIES AVAILABLE':'CONNECTING TO SERVER'}</span></div>
   <div className="match-terminal-layout">
    <div className="match-mode-list" role="group" aria-label="Multiplayer mode">
     {([{id:'ARCHITECT',title:'Architect duel',detail:'Build the room that challenges the scout.',icon:Box,test:undefined},{id:'RACE',title:'Live escape race',detail:'Two explorers. Eight sectors. First out wins.',icon:Flag,test:'race-mode-btn'},{id:'COOP',title:'Co-op expedition',detail:'Hold switches, share cores, extract together.',icon:Handshake,test:'coop-mode-btn'}] as const).map(({id,title,detail,icon:Icon,test})=><button key={id} data-testid={test} aria-pressed={mode===id} onClick={()=>setMode(id)}><Icon size={21}/><span><strong>{title}</strong><small>{detail}</small></span><span className="mode-radio"/></button>)}
    </div>
    <div className="match-form">
     <div className="match-create"><label>Architect callsign<input data-testid="player-name-input" aria-label="Architect callsign" maxLength={20} value={p.playerName} onChange={e=>p.onChangePlayerName(e.target.value)}/></label>{mode==='ARCHITECT'&&<label>Build time<select aria-label="Build time" value={duration} onChange={e=>setDuration(Number(e.target.value) as 45|90)}><option value={45}>45s · Quick demo</option><option value={90}>90s · Standard</option></select></label>}<button className="architect-btn architect-btn-primary" data-testid="create-lobby-btn" disabled={!p.connected||p.pending} onClick={()=>p.onCreateLobby(duration,mode)}>{p.pending?'Opening lobby…':p.connected?'Create lobby':'Connecting…'}<ArrowRight size={16}/></button></div>
     <form className="match-join" noValidate onSubmit={e=>{e.preventDefault();if(joinCode.trim())p.onJoinLobby(joinCode.trim().toUpperCase());}}><label>Have an invite?<input aria-label="Invite code" data-testid="join-code-input" placeholder="6-character room code" autoComplete="off" value={joinCode} maxLength={6} onChange={e=>setJoinCode(e.target.value.toUpperCase())}/></label><button className="architect-btn" data-testid="join-lobby-btn" disabled={!p.connected||p.pending}>Join facility<ArrowUpRight size={16}/></button></form>
     {p.errorMessage&&<p role="alert" data-testid="landing-error" className="architect-message">{p.errorMessage}</p>}
    </div>
   </div>
  </section>
  <footer className="launcher-footer"><span>REVERSE ESCAPE / MIND WARS</span><span>A world built to be figured out.</span></footer>
 </div>;
};
