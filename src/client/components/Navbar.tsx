import React,{useState} from 'react';
import {Aperture,Box,Compass,Flag,HelpCircle,Home,Layers,Radio,Users,Volume2,VolumeX,Wifi,WifiOff} from 'lucide-react';
import {soundFX} from '../lib/sound';
interface NavbarProps {connected:boolean;roomCode?:string;onGoHome:()=>void;onOpenHelp:()=>void;active?:string;onNavigate?:(destination:string)=>void;}
export const Navbar:React.FC<NavbarProps>=({connected,roomCode,onGoHome,onOpenHelp,active='LANDING',onNavigate})=>{
 const [muted,setMuted]=useState(soundFX.isMuted());
 const destinations=[{id:'LANDING',label:'Mission control',icon:Home},{id:'ADVENTURE',label:'Campaign',icon:Compass},{id:'ENDLESS',label:'Endless',icon:Layers},{id:'ONLINE_EXPEDITION',label:'Online',icon:Users},{id:'SOLO_BUILD',label:'Studio',icon:Box},{id:'SECTORS',label:'Challenges',icon:Flag}];
 return <header className="command-navigation">
  <nav className="navigation-rail" aria-label="Game navigation">
   <button className="navigation-emblem" aria-label="Reverse Escape home" onClick={onGoHome}><Aperture size={30}/></button>
   <div className="navigation-destinations">{destinations.map(({id,label,icon:Icon})=><button key={id} aria-label={label} title={label} aria-current={active===id?'page':undefined} onClick={()=>id==='LANDING'?onGoHome():onNavigate?.(id)}><Icon size={21}/><span>{label}</span></button>)}</div>
   <span className="navigation-rail-caption">RE / MW</span>
  </nav>
  <div className="command-topline"><div className="command-wordmark">REVERSE ESCAPE<span>MIND WARS / EXPEDITION SYSTEM</span></div><div className="command-utilities">
   {roomCode&&<span className="session-chip">ROOM {roomCode}</span>}
   <span className="connection-indicator" role="status" aria-label={connected?'Connected to multiplayer':'Multiplayer offline'}>{connected?<Wifi size={14}/>:<WifiOff size={14}/>}<span>{connected?'NETWORK ONLINE':'OFFLINE'}</span></span>
   <button aria-label="How to play" title="Field guide" onClick={onOpenHelp}><HelpCircle size={18}/><span>Field guide</span></button>
   <button aria-label="Toggle Sound" aria-pressed={!muted} title={muted?'Enable sound':'Mute sound'} onClick={()=>setMuted(soundFX.toggleMute())}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button>
   <button aria-label="Home" title="Mission control" onClick={onGoHome}><Radio size={18}/></button>
  </div></div>
 </header>;
};
