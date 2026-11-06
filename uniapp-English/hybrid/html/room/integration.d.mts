import type {BridgeOptions,RoomAPI,RoomBridge,RoomState} from './room.js';
export type {BridgeOptions,RoomBridge,RoomCommandName,RoomCommandEnvelope,RoomEventEnvelope,RoomResultEnvelope,RoomBridgeEnvelope} from './room.js';
export const ROOM_PROTOCOL_VERSION:1;
export function createRoomBridge(options:BridgeOptions&{api:Partial<RoomAPI>;getState:()=>RoomState|Promise<RoomState>}):RoomBridge;
