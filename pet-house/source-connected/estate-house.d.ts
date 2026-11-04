import type {PetHouseOptions,PetHouseController} from './pet-house.js';
import type {RoomAPI} from './room.js';
export interface RoomWorldSave {id:string;roomId:string;name:string;createdAt:string;}
export interface RoomWorldStatus {revision:number;updatedAt:string;checkpointCount:number;}
export interface RoomWorldResult {
  ok:boolean;code?:string;message?:string;roomId?:string;revision?:number;
  save?:RoomWorldSave;saves?:RoomWorldSave[];updatedAt?:string;
  world?:RoomWorldStatus;checkpointCount?:number;
  archive?:Record<string,unknown>;json?:string;relaunchRequired?:boolean;
}
export interface EstateRoom {id:string;name:string;template:string;floor:number;createdAt:string;world:RoomWorldStatus;}
export interface EstateAPI extends RoomAPI {
  getEstate():{ok:boolean;message?:string;estate:{activeRoomId:string;rooms:EstateRoom[];balance:number;busy:boolean}};
  createEstateRoom(input?:{name?:string;template?:string}):Promise<RoomWorldResult>;
  selectEstateRoom(id:string):Promise<RoomWorldResult>;
  listRoomWorldSaves(id?:string):RoomWorldResult;
  saveRoomWorld(id?:string,input?:{name?:string}):RoomWorldResult;
  removeRoomWorldSave(id:string,saveId:string):RoomWorldResult;
  restoreRoomWorld(id:string,saveId:string):Promise<RoomWorldResult>;
  createRoomWorld(id?:string,input?:{name?:string;template?:'cream'|'mint'|'candy';backupName?:string}):Promise<RoomWorldResult>;
  exportRoomWorld(id?:string):RoomWorldResult;
  importRoomWorld(id:string,json:string|Record<string,unknown>):Promise<RoomWorldResult>;
}
export interface EstateController extends Omit<PetHouseController,'api'|'view'> {api:EstateAPI;}
export function mountPetEstate(options:PetHouseOptions):EstateController;
