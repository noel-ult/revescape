import React,{useState} from 'react';
import {ArrowLeft,Check,Clock,Copy,Link2,ShieldCheck,Users} from 'lucide-react';
import {SECTORS} from '../../shared/sectors';
import {COOP_SECTORS} from '../../shared/coop';
import {MatchState} from '../../shared/types';
interface LobbyScreenProps {matchState:MatchState;playerToken:string;onToggleReady:(ready:boolean)=>void;onChangeDuration:(duration:45|90)=>void;onLeaveLobby:()=>void;}
export const LobbyScreen:React.FC<LobbyScreenProps>=({matchState,playerToken,onToggleReady,onChangeDuration,onLeaveLobby})=>{
 const [copiedCode,setCopiedCode]=useState(false),[copiedLink,setCopiedLink]=useState(false),[copyError,setCopyError]=useState('');
 const race=matchState.mode==='RACE',coop=matchState.mode==='COOP',me=matchState.players.find(p=>p.token===playerToken),host=matchState.hostToken===playerToken;
 const invite=`${location.origin}/?room=${matchState.roomCode}`;
 const copy=async(text:string,link:boolean)=>{try{await navigator.clipboard.writeText(text);setCopyError('');link?setCopiedLink(true):setCopiedCode(true);setTimeout(()=>{setCopiedCode(false);setCopiedLink(false);},2000);}catch{setCopyError('Copy is unavailable. Select and copy the invite URL or room code.');}};
 return <div className="staging-page">
  <div className="page-masthead"><div><span className="ui-kicker">MULTIPLAYER / STAGING AREA</span><h1>{coop?'Coordinate your escape.':race?'Ready for the orbital run?':'Prepare your next mind game.'}</h1></div><button className="architect-btn" onClick={onLeaveLobby}><ArrowLeft size={15}/>Leave lobby</button></div>
  <div className="staging-grid">
   <section className="room-ticket" aria-label="Room invitation"><span className="ui-kicker">YOUR PRIVATE ROOM</span><strong data-testid="lobby-room-code">{matchState.roomCode}</strong><p>Share this code with your friend.<br/>Ready up when your team is here.</p><div className="checkpoint-actions"><button className="architect-btn" onClick={()=>void copy(matchState.roomCode,false)}>{copiedCode?<Check size={15}/>:<Copy size={15}/>} {copiedCode?'Copied':'Copy code'}</button><button className="architect-btn" onClick={()=>void copy(invite,true)}><Link2 size={15}/>{copiedLink?'Link copied':'Copy invite'}</button></div><label>Invite a friend on another device<input aria-label="Shareable invite URL" readOnly value={invite} onFocus={e=>e.target.select()}/></label>{copyError&&<p className="architect-message" role="status">{copyError}</p>}
    {!race&&!coop&&<div className="staging-duration"><span><Clock size={15}/>Build phase</span><p>30 energy each. Identical component limits.</p><div role="group" aria-label="Build duration"><button className="architect-btn" disabled={!host} aria-pressed={matchState.buildDurationSec===45} onClick={()=>onChangeDuration(45)}>45s Demo</button><button className="architect-btn" disabled={!host} aria-pressed={matchState.buildDurationSec===90} onClick={()=>onChangeDuration(90)}>90s Standard</button></div></div>}
   </section>
   <section className="staging-team" aria-label="Match players"><div className="staging-team-heading"><span className="ui-kicker">{coop?'CO-OP EXPEDITION':race?'LIVE ESCAPE RACE':'ARCHITECT DUEL'}</span><span>{matchState.players.length}/2 EXPLORERS</span></div><div className="staging-seats">{[0,1].map(i=>{const player=matchState.players[i],isMe=player?.token===playerToken;return <div data-testid={`lobby-slot-${i}`} className={`staging-seat ${player?.ready?'ready':''}`} key={i}><div className="staging-seat-top"><span>PLAYER {String(i+1).padStart(2,'0')}{isMe?' / YOU':''}</span><span>{player?player.ready?'READY':'NOT READY':'AWAITING PLAYER'}</span></div><div className="staging-avatar"><Users size={34}/></div><h2>{player?.name??'Open seat'}</h2><p>{player?player.connected?'Connected and in the lobby':'Reconnecting…':'Your friend joins here.'}</p></div>;})}</div>
    <p className="staging-brief">{coop?`Work together through ${COOP_SECTORS.length} missions. Hold pressure pads, recover shared cores and both reach extraction.`:race?`Race through ${SECTORS.length} orbital sectors. Every exit is a checkpoint; the first final extraction wins.`:'Build a deceptive, solvable facility. The server runs the same planning scout through both rooms and compares the scores.'}</p>
    <div className="staging-ready">{me?<><span>{me.ready?'Waiting for the other player.':'Both players must be ready to begin.'}</span><button data-testid="lobby-ready-btn" className="architect-btn architect-btn-primary" aria-pressed={me.ready} onClick={()=>onToggleReady(!me.ready)}><ShieldCheck size={18}/>{me.ready?'READY LOCKED (CLICK TO UNREADY)':'READY FOR BATTLE'}</button></>:<p>Joined as Live Spectator ({matchState.spectatorCount} watching)</p>}</div>
   </section>
  </div>
 </div>;
};
