import type {CSSProperties} from 'react';
import type {BridgeOptions,RoomAPI,RoomState,StorageAdapter,MountOptions} from '../room.js';
export interface ReactPetRoomProps {
  storageKey?:string;storageAdapter?:StorageAdapter|null;assetsBaseUrl?:string|URL;assetUrls?:Record<string,string|URL>;
  initialPoints?:number;quality?:MountOptions['quality'];timeZone?:string;
  panels?:boolean;controls?:boolean;styles?:boolean;bridge?:boolean|BridgeOptions;
  onReady?:(api:RoomAPI)=>void;onState?:(state:RoomState)=>void;
  onEvent?:(type:string,detail:Record<string,unknown>)=>void;onError?:(error:Error&{code?:string})=>void;
  className?:string;style?:CSSProperties;
}
export default function ReactPetRoom(props:ReactPetRoomProps):import('react').ReactElement;
