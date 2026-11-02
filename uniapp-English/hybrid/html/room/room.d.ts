export type Vector3Data=[number,number,number];
export interface LayoutData {version:3;furniture:Record<string,{position:Vector3Data;rotation:Vector3Data;scale:Vector3Data}>;definitions:Record<string,unknown>;lampSupport:string|null;}
export interface RoomState {shop:ShopState;protocolVersion:1;version:string;lifecycle:string;ready:boolean;character:Record<string,unknown>|null;lampOn:boolean;petState:string;petPosition:Vector3Data|null;petYaw:number;desiredSeated:boolean;seatId:string|null;sitting:number;poseStage:string;watering:boolean;waterTarget:string|null;decoration:boolean;selected:string|null;error:{code:string;message:string}|null;metrics:{fps:number;triangles:number;drawCalls:number;quality:string;maxPixelRatio:number;autoDowngraded?:boolean};}
export interface ProfileBadge {id:string;name:string;description:string;category:'checkin'|'study'|'level'|'growth';unlocked:boolean;/** 解锁日期 YYYY-MM-DD；未解锁为 null，v2.7/batch1 */unlockedAt?:string|null;}
export interface ProfileCalendarDay {date:string;day:number;checked:boolean;isToday:boolean;}
export interface MakeupsState {month:string|null;count:number;}
export interface ProfileState {
  gender:'male'|'female';name:string;xp:number;level:number;levelName:string;
  totalStudySeconds:number;streakDays:number;totalCheckIns:number;lastCheckIn:string|null;
  todayChecked:boolean;todayReward:{day:number;exp:number;points:number}|null;
  tomorrowReward:{day:number;exp:number;points:number};
  calendar:{year:number;month:number;days:ProfileCalendarDay[]};
  checkInDates:string[];
  stats:{monthDays:number;last30Days:number;weekly:{days:{date:string;checked:boolean}[];checkedDays:number}};
  nextBadgeHint:{id:string;name:string;hint:string}|null;
  levelInfo:{current:number;next:number;reached:boolean;intoLevel:number;need:number;progress:number};
  badges:ProfileBadge[];balance:number;valid:boolean;error:{code:string;message:string}|null;
  /** 补签卡：本月已用次数与单次价格，v2.7/batch1 */
  makeups:MakeupsState;makeupCost:number;
}
export interface RoomAPI {
  getShop():ShopState;purchaseFurniture(sku:string,requestId?:string):Promise<ShopResult>;expandRoom(requestId?:string):Promise<ShopResult>;
  creditLearning(event:{eventId:string;learned?:number;reviewed?:number;checkIn?:boolean}):ShopResult;
  getState():RoomState;getLayout():LayoutData|null;setLamp(on:boolean):boolean;toggleSofa():boolean;walkTo(x:number,z:number):boolean;
  setDecorationMode(enabled:boolean):boolean|Promise<boolean>;
  setFurnitureTransform(id:string,transform:{position?:Vector3Data;rotation?:Vector3Data;scale?:number|Vector3Data}):boolean;
  setFurnitureCollider(id:string,patch:{center?:Vector3Data;size?:Vector3Data;blocksNavigation?:boolean;blocksPlacement?:boolean},boxIndex?:number):boolean;
  importLayout(layout:LayoutData|string,options?:{persist?:boolean}):{ok:boolean;reason:string};getFurniture(id:string):unknown;dispose():void;
  getProfile():{ok:boolean;code?:string;message?:string;profile?:ProfileState};
  /** 补签昨天（花 makeupCost 积分，每月限 3 次），v2.7/batch1 */
  makeUpCheckIn():{ok:boolean;code?:string;message?:string;makeup?:string;streak?:number;totalCheckIns?:number;pointsApplied?:boolean;cost?:number;balance?:number;stretched?:boolean;unchanged?:boolean};
  /** 导出存档快照 JSON（格式见 archive.mjs），v2.7/batch1 */
  exportArchive():{ok:boolean;code?:string;message?:string;archive?:{format:number;version:string;exportedAt:string;meta:Record<string,unknown>;profile:Record<string,unknown>;economy:Record<string,unknown>}};
  /** 校验并写入存档（重新挂载后生效），v2.7/batch1 */
  importArchive(json:string|object):{ok:boolean;code?:string;message?:string;relaunchRequired?:boolean;meta?:Record<string,unknown>};
  checkIn():{ok:boolean;code?:string;message?:string;streak?:number;exp?:number;points?:number;levelUps?:number[];pendingPoints?:number;pointsSettled?:boolean;newBadges?:number;capped?:boolean;state?:Record<string,unknown>};
  setProfileGender(gender:'male'|'female'):{ok:boolean;code?:string;message?:string};
  setProfileName(name:string):{ok:boolean;code?:string;message?:string};
  addStudyTime(seconds:number):{ok:boolean;code?:string;message?:string};
}
/** 角色工厂可用的外观预设：'kid'（默认，幼态化）或 'classic'（v2 经典比例） */
export type CharacterAppearance='kid'|'classic';
export interface CharacterDesignInfo {targetAudience:string;appeal:string[];appearance:CharacterAppearance;paletteKeys:string[];}
export interface CharacterDefinition {
  model:{isObject3D:boolean};
  pose:{update(dt:number):void;sit():void;stand():void;readonly amount:number;readonly contactY:number;readonly stage?:string;duration?:{sit:number;stand:number};setLocomotion?(input:{speed:number;phase:number;weight:number}):void;setWatering?(weight?:number):void;setCelebrate?(weight?:number):void;dispose?():void};
  metadata?:Record<string,unknown>&{design?:CharacterDesignInfo;animations?:{name:string;duration:number;loop:boolean}[]};dispose?():void;
}
export interface MountOptions {
  /** 核心默认0；独立演示页面显式使用1000体验积分。实际积分须由宿主校验。 */
  initialPoints?:number;
  /** 签到“今天”所用的 IANA 时区（如 'Asia/Shanghai'、'UTC'）；缺省用设备本地时区。 */
  timeZone?:string;
  canvas:HTMLCanvasElement;uiRoot?:HTMLElement|null;assetsBaseUrl?:string|URL;quality?:'auto'|'low'|'balanced'|'high';storageKey?:string;
  storageAdapter?:{getItem(key:string):string|null;setItem(key:string,value:string):void}|null;persistLayout?:boolean;restoreLayout?:boolean;
  characterFactory?:(options:Record<string,unknown>)=>CharacterDefinition|Promise<CharacterDefinition>;characterOptions?:Record<string,unknown>;
  signal?:AbortSignal;loadTimeoutMs?:number;onEvent?:(type:string,detail:Record<string,unknown>)=>void;onState?:(state:RoomState)=>void;debug?:boolean;
}
export interface RoomController {api:RoomAPI;ready:Promise<RoomAPI>;dispose():void;version:string;protocolVersion:number;}
export function mountRoom(options:MountOptions):RoomController;
export interface ShopItem {sku:string;name:string;description:string;price:number;kind:'furniture';}
export interface RoomTier {level:number;name:string;width:number;depth:number;price:number;}
export interface ShopState {balance:number;owned:string[];roomLevel:number;roomName:string;width:number;depth:number;catalog:ShopItem[];tiers:RoomTier[];nextTier:RoomTier|null;busy:boolean;valid:boolean;error:{code:string;message:string}|null;/** 累计消费统计（购买+扩建），v2.7 用于消费勋章判定 */totalSpent:number;}
export interface ShopResult {ok:boolean;code:string;message:string;state?:Record<string,unknown>;}
