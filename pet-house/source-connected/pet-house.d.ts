import type {BridgeOptions,MountOptions,RoomAPI,RoomController,RoomState} from './room.js';
export * from './room.js';
export {createRoomBridge} from './integration.mjs';
export interface PetHouseOptions extends Omit<MountOptions,'canvas'|'uiRoot'> {
  container:HTMLElement;
  /** 商店/仓库/个人主页，默认true。 */
  panels?:boolean;
  /** 装修按钮及控制面板，默认true。 */
  controls?:boolean;
  /** 自动加载配套样式，默认true。 */
  styles?:boolean;
  /** 默认false；true开启实例内DOM桥接，跨窗口来源须显式配置。 */
  bridge?:boolean|BridgeOptions;
  pointsLabel?:string;
  demo?:boolean;
  /** 宿主扩展API时须保留房间基础接口及dispose生命周期。 */
  extendApi?:(api:RoomAPI)=>RoomAPI;
  onError?:(error:Error&{code?:string})=>void;
}
export interface PetHouseController extends RoomController {
  api:RoomAPI;
  view:RoomView;
}
export function mountPetHouse(options:PetHouseOptions):PetHouseController;
export interface RoomView {
  root:HTMLElement;canvas:HTMLCanvasElement;controlsRoot:HTMLElement|null;
  updateState(state:RoomState):void;ready():void;error(error:unknown):void;dispose():void;
}
export function createRoomView(container:HTMLElement,options?:{controls?:boolean}):RoomView;
export interface ShopPanel {update(state:RoomState):void;open(tab?:'pets'|'furniture'|'flooring'|'wall'|'room'|'storage'|'expansion'|'points'):void;close():void;dispose():void;}
export function createShopPanel(options:{root:HTMLElement;api:RoomAPI;pointsLabel?:string;demo?:boolean}):ShopPanel;
export interface ProfilePanel {update(state:RoomState):void;open():void;close(returnFocus?:boolean):void;dispose():void;}
export function createProfilePanel(options:{root:HTMLElement;api:RoomAPI;pointsLabel?:string}):ProfilePanel;
export const DEFAULT_ASSET_URLS:Readonly<Record<'sofa'|'table'|'lamp',string>>;
