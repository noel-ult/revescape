import { AdventureState } from './adventure';
export const PROFILE_KEY='reverse-escape-career-v1';
export interface AdventureProfile {version:1; mastery:AdventureState['mastery']; records:string[]; bestFloor:number; runs:number; archived:string[]; accent:'mint'|'amber'|'violet';}
export function restoreProfile(value:unknown):AdventureProfile {
 const empty:AdventureProfile={version:1,mastery:{},records:[],bestFloor:0,runs:0,archived:[],accent:'mint'};
 if(!value||typeof value!=='object')return empty;
 const p=value as AdventureProfile;
 if(p.version!==1||!p.mastery||typeof p.mastery!=='object'||Array.isArray(p.mastery)||!Array.isArray(p.records)||!p.records.every(v=>typeof v==='string')||!Array.isArray(p.archived)||!p.archived.every(v=>typeof v==='string')||!Number.isSafeInteger(p.bestFloor)||p.bestFloor<0||!Number.isSafeInteger(p.runs)||p.runs<0)return empty;
 const mastery:AdventureState['mastery']={};for(const [id,m] of Object.entries(p.mastery))if(m&&Number.isInteger(m.stars)&&m.stars>=1&&m.stars<=3&&Number.isInteger(m.moves)&&m.moves>=0&&typeof m.salvage==='boolean')mastery[id]=m;
 return {...p,mastery,accent:['mint','amber','violet'].includes(p.accent)?p.accent:'mint'};
}
export function mergeAdventureProfile(profile:AdventureProfile,state:AdventureState):AdventureProfile {
 const mastery={...profile.mastery};if(state.mode==='CAMPAIGN')for(const [id,m] of Object.entries(state.mastery)){const old=mastery[id];mastery[id]={stars:Math.max(old?.stars??0,m.stars),moves:Math.min(old?.moves??Infinity,m.moves),salvage:Boolean(old?.salvage||m.salvage)};}
 const id=state.runId;
 const archive=state.mode==='ENDLESS'&&['FAILED','EXTRACTED'].includes(state.phase)&&!profile.archived.includes(id);
 return {...profile,mastery,records:[...new Set([...profile.records,...state.logs])],bestFloor:Math.max(profile.bestFloor,state.floors),runs:profile.runs+Number(archive),archived:archive?[...profile.archived.slice(-99),id]:profile.archived};
}
export function ownedAccents(profile:AdventureProfile):Array<AdventureProfile['accent']>{const n=Object.keys(profile.mastery).length;return ['mint',...(n>=3?['amber']:[]),...(n>=9?['violet']:[])] as Array<AdventureProfile['accent']>;}
