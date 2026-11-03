export type Vector3Data=[number,number,number];
export type JSONValue=null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export interface StorageAdapter {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem?(key:string):void;}
export interface RoomError {code:string;message:string;}
export interface InteractionPlan {
  readonly version:1;readonly event:string;readonly sounds:readonly string[];
  readonly actions:ReadonlyArray<Readonly<Record<string,unknown>>>;
  readonly bubble:string|null;readonly celebration:Readonly<{kind:string;name:string}>|null;
  readonly suppressed:boolean;
}
export interface FurnitureDrawing {version:1;strokes:{tool:'brush'|'eraser';color:string;size:number;points:[number,number][]}[];}
export interface GrowthState {id:'baby'|'young'|'adult';stage:string;days:number;learningSeconds:number;next:{stage:string;daysRequired:number;learningSecondsRequired:number}|null;tasks:{id:string;label:string;current:number;target:number;done:boolean}[];progress:number;}
export interface FurnitureStyle {drawing?:FurnitureDrawing|null;skinId?:string;color?:string;sticker?:'none'|'star'|'heart'|'flower';doodle?:'none'|'rainbow'|'smile';achievementSkin?:boolean;}
export interface CompanionPatch {petName?:string;roomName?:string;sound?:{muted?:boolean;volume?:'quiet'|'standard'|'loud'};outfit?:{hat?:'none'|'star'|'unicorn'|'ears';scarf?:'none'|'mint'|'rose';backpack?:'none'|'school'};theme?:'light'|'eye-care'|'candy';nightMode?:boolean;surprises?:boolean;tourDone?:boolean;voiceEnabled?:boolean;}
export interface CompanionState {version:1;petName:string;roomName:string;ownerName:string;sound:{muted:boolean;volume:'quiet'|'standard'|'loud'};outfit:{hat:'none'|'star'|'unicorn'|'ears';scarf:'none'|'mint'|'rose';backpack:'none'|'school'};theme:'light'|'eye-care'|'candy';nightMode:boolean;surprises:boolean;tourDone:boolean;voiceEnabled:boolean;skins:{id:string;name:string;badgeId:string;colors:string[];unlocked:boolean}[];furnitureStyles:Record<string,FurnitureStyle>;memories:Record<string,{at:string|null;by:string;source:string}>;rewards:{id:string;name:string;kind:string;at:string|null;expiresAt:string|null;sku?:string}[];garden:{flowers:number;stage:string};growth:GrowthState;collection:{pets:{sku:string;name:string;owned:boolean;image:string}[];furniture:{sku:string;name:string;owned:boolean;image:string}[]};furniture:{id:string;name:string}[];}
export interface CompanionResult {ok:boolean;code?:string;message?:string;companion?:CompanionState;unchanged?:boolean;}
export interface WeatherSettings {enabled:boolean;latitude:number|null;longitude:number|null;locationName:string;}
export interface RoomPhoto {id:string;at:string;title:string;dataUrl:string;}
export interface LearningQuestionProgress {attempts:number;correct:number;wrong:number;correctStreak:number;mastered:boolean;lastAt:string;}
export interface LearningProgress {level:number;streak:number;answers:number;correct:number;questions:Record<string,LearningQuestionProgress>;attemptIds:string[];}
export interface CompanionPatch {ageMode?:'kindergarten'|'primary';voiceLanguage?:'zh-CN'|'en-US'|'ja-JP';voiceStyle?:'gentle'|'bright';weather?:Partial<WeatherSettings>;}
export interface CompanionState {ageMode:'kindergarten'|'primary';voiceLanguage:'zh-CN'|'en-US'|'ja-JP';voiceStyle:'gentle'|'bright';weather:WeatherSettings;photos:RoomPhoto[];wallDrawing:FurnitureDrawing|null;learningProgress:LearningProgress;}
export interface LayoutData {version:3;furniture:Record<string,{position:Vector3Data;rotation:Vector3Data;scale:Vector3Data}>;definitions:Record<string,unknown>;lampSupport:string|null;}
export interface RoomState {shop:ShopState;protocolVersion:1;version:string;lifecycle:string;ready:boolean;character:Record<string,unknown>|null;lampOn:boolean;petState:string;petPosition:Vector3Data|null;petYaw:number;desiredSeated:boolean;seatId:string|null;sitting:number;poseStage:string;watering:boolean;waterTarget:string|null;decoration:boolean;selected:string|null;error:{code:string;message:string}|null;metrics:{fps:number;triangles:number;drawCalls:number;quality:string;maxPixelRatio:number;autoDowngraded?:boolean;presentationPaused:boolean;renderCount:number};}
export interface ProfileBadge {id:string;name:string;description:string;category:'checkin'|'study'|'level'|'growth';unlocked:boolean;/** 旧档日期精度，不能据此推造具体时分秒。 */unlockedAt?:string|null;/** 首次获得的ISO时刻，旧档未知为null。 */acquiredAt?:string|null;}
export interface ProfileLevelBadge {id:string;name:string;minLevel:number;rank:number;unlocked:boolean;acquiredAt:string|null;}
export interface ProfileCalendarDay {date:string;day:number;checked:boolean;isToday:boolean;}
export interface MakeupsState {month:string|null;count:number;}
export interface ProfileState {
  gender:'none'|'male'|'female';name:string;avatar:string|null;xp:number;level:number;levelName:string;
  totalStudySeconds:number;streakDays:number;totalCheckIns:number;lastCheckIn:string|null;
  todayChecked:boolean;todayReward:{day:number;exp:number;points:number}|null;
  tomorrowReward:{day:number;exp:number;points:number};
  calendar:{year:number;month:number;days:ProfileCalendarDay[]};
  checkInDates:string[];
  stats:{monthDays:number;last30Days:number;weekly:{days:{date:string;checked:boolean}[];checkedDays:number}};
  nextBadgeHint:{id:string;name:string;hint:string}|null;
  levelInfo:{current:number;next:number;reached:boolean;intoLevel:number;need:number;progress:number};
  badges:ProfileBadge[];levelBadges:ProfileLevelBadge[];balance:number;valid:boolean;error:{code:string;message:string}|null;unlocked?:string[];
  /** 补签卡：本月已用次数与单次价格，v2.7/batch1 */
  makeups:MakeupsState;makeupCost:number;
}
export interface RoomAPI {
  /** 按住画面中的动物拖动时，沿碰撞导航路径跟随地面目标。 */
  saveWallDrawing(drawing:FurnitureDrawing|null):CompanionResult;
  /** 界面配色同步到场景背景与光照，不改变保存的墙色/地砖。 */
  setTheme(mode:'light'|'eye-care'|'candy'):boolean;
  getCompanion():CompanionResult;
  updateCompanion(patch:CompanionPatch):CompanionResult;
  customizeFurniture(id:string,patch:FurnitureStyle):CompanionResult;
  redeemSecret(code:string):CompanionResult;
  speakPetGreeting():{ok:boolean;code?:string;message?:string;unchanged?:boolean};
  playMoveInCeremony():boolean;
  setPresentationPaused(enabled:boolean):boolean;
  setWallColor(color:string):Promise<ShopResult>;applyFlooring(sku:string|null):Promise<ShopResult>;
  purchasePet(sku:string,requestId?:string):Promise<ShopResult>;selectPet(sku:string):Promise<ShopResult>;
  storeFurniture(sku:string,requestId?:string):Promise<ShopResult>;unstoreFurniture(sku:string,requestId?:string):Promise<ShopResult>;
  /** 收起全部家具；保留所有权、积分与收藏。 */
  collectAllFurniture(requestId?:string):Promise<ShopResult&{count?:number}>;
  /** 恢复当前已摆放家具的默认位置，保留仓库和收藏。 */
  resetRoomLayout():Promise<ShopResult>;
  setProfileAvatar(avatar:string|null):ShopResult;
  getShop():ShopState;purchaseFurniture(sku:string,requestId?:string):Promise<ShopResult>;expandRoom(requestId?:string):Promise<ShopResult>;
  /** v2.10：在已解锁档位内切换小屋大小（可换回原来的小房子）。换小放不下会返回 NO_SPACE。 */
  setRoomLevel(level:number,requestId?:string):Promise<ShopResult>;
  creditLearning(event:{eventId:string;learned?:number;reviewed?:number;checkIn?:boolean}):ShopResult;
  getState():RoomState;getLayout():LayoutData|null;setLamp(on:boolean):boolean;toggleSofa():boolean;walkTo(x:number,z:number):boolean;
  setDecorationMode(enabled:boolean):boolean|Promise<boolean>;
  setFurnitureTransform(id:string,transform:{position?:Vector3Data;rotation?:Vector3Data;scale?:number|Vector3Data}):boolean;
  setFurnitureCollider(id:string,patch:{center?:Vector3Data;size?:Vector3Data;blocksNavigation?:boolean;blocksPlacement?:boolean},boxIndex?:number):boolean;
  importLayout(layout:LayoutData|string,options?:{persist?:boolean}):{ok:boolean;reason?:string};getFurniture(id:string):unknown;dispose():void;
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
export interface ShopState {appearance:{wallColor:string;flooring:string|null};wallPaints:{id:string;name:string;color:number;stripe:number}[];}
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
  canvas:HTMLCanvasElement;uiRoot?:HTMLElement|null;assetsBaseUrl?:string|URL;
  /** 按家具ID覆盖模型URL；未提供时使用支持打包器静态分析的本地资源。 */
  assetUrls?:Record<string,string|URL>;
  quality?:'auto'|'low'|'balanced'|'high';storageKey?:string;
  storageAdapter?:StorageAdapter|null;persistLayout?:boolean;restoreLayout?:boolean;
  /** 默认开启；false只关闭自动备份，手动备份及导出仍可用。 */
  autoBackup?:boolean;
  characterFactory?:(options:Record<string,unknown>)=>CharacterDefinition|Promise<CharacterDefinition>;characterOptions?:Record<string,unknown>;
  signal?:AbortSignal;loadTimeoutMs?:number;onEvent?:(type:string,detail:Record<string,unknown>)=>void;onState?:(state:RoomState)=>void;debug?:boolean;
  /** 每次交互的只读动作计划，便于宿主统一呈现声音、气泡和动画。 */
  onInteraction?:(plan:InteractionPlan)=>void;
}
export interface RoomController {api:RoomAPI;ready:Promise<RoomAPI>;dispose():void;version:string;protocolVersion:1;}
export function mountRoom(options:MountOptions):RoomController;
export interface ShopItem {sku:string;name:string;description:string;price:number;kind:'furniture';category?:'flooring'|'wall'|'furniture';rarity?:string;colors?:number[];}
export interface RoomTier {level:number;name:string;width:number;depth:number;price:number;}
export interface PetItem {sku:string;name:string;description:string;price:number;kind:"pet";}
export interface ShopState {pets:{catalog:PetItem[];owned:string[];active:string};stored:string[];storageCatalog:({sku?:string;id?:string;name:string})[];balance:number;owned:string[];roomLevel:number;maxRoomLevel:number;roomName:string;width:number;depth:number;catalog:ShopItem[];tiers:RoomTier[];nextTier:RoomTier|null;busy:boolean;valid:boolean;error:{code:string;message:string}|null;/** 累计消费统计（购买+扩建），v2.7 用于消费勋章判定 */totalSpent:number;}
export interface ShopResult {ok:boolean;code?:string;message?:string;state?:Record<string,unknown>;unchanged?:boolean;balance?:number;cost?:number;sku?:string;replayed?:boolean;}

export type RoomCommandName='setLamp'|'toggleSofa'|'walkTo'|'setDecorationMode'|'setFurnitureTransform'|'setFurnitureCollider'|'getState'|'getLayout'|'importLayout'|'getShop'|'purchaseFurniture'|'purchasePet'|'selectPet'|'expandRoom'|'setRoomLevel'|'creditLearning'|'getProfile'|'checkIn'|'setProfileGender'|'setProfileName'|'setProfileAvatar'|'addStudyTime'|'storeFurniture'|'unstoreFurniture'|'makeUpCheckIn'|'exportArchive'|'importArchive'|'setWallColor'|'applyFlooring';
export interface RoomCommandEnvelope {protocolVersion:1;roomId:string;requestId:string;type:'command';command:RoomCommandName;params?:{[key:string]:JSONValue};}
export interface RoomEventEnvelope {protocolVersion:1;roomId:string;requestId:null;type:'event';event:string;detail:JSONValue;}
export type RoomResultEnvelope={protocolVersion:1;roomId:string;requestId:string|null;type:'result';command:string|null}&({ok:true;result:JSONValue}|{ok:false;error:RoomError});
export type RoomBridgeEnvelope=RoomEventEnvelope|RoomResultEnvelope;
export interface BridgeOptions {
  roomId?:string;
  onEvent?:(envelope:RoomBridgeEnvelope)=>void;
  eventTarget?:EventTarget;
  /** null/false 禁止兼容全局注册；默认 HamsterRoom，仅在传入globalObject时注册。 */
  legacyName?:string|null|false;
  globalObject?:object;
  allowedOrigins?:string[];
  messageTarget?:EventTarget&{parent?:unknown};
  allowedSources?:unknown[];
}
export interface RoomBridge {ready():Promise<boolean>;emit(event:string,detail?:JSONValue):boolean;dispose():boolean;}
