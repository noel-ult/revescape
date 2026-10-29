import type { AdventureState } from './adventure';
export interface ExpeditionPublic {
 version:1; code:string; seats:1|2; members:Array<{name:string;ready:boolean;connected:boolean}>;
 you:number; seq:number; state:AdventureState; started:boolean; paused:boolean; revision:number; waiting:boolean; rematchVotes?:number[];
}
export interface ExpeditionRanking {mode:string;seed:number;floors:number;moves:number;names:string[];completed:number}
