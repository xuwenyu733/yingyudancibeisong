import type {Component} from 'svelte';
import type {PetHouseOptions,RoomAPI} from '../pet-house.js';
export interface SveltePetRoomProps extends Pick<PetHouseOptions,'storageKey'|'storageAdapter'|'assetsBaseUrl'|'assetUrls'|'initialPoints'|'quality'|'timeZone'|'panels'|'controls'|'styles'|'bridge'|'onState'|'onEvent'|'onError'> {
  onReady?:(api:RoomAPI)=>void;
  class?:string;
  style?:string;
}
declare const SveltePetRoom:Component<SveltePetRoomProps,{getApi():RoomAPI|null;remount():void}>;
export default SveltePetRoom;
