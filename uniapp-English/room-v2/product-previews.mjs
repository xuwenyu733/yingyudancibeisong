import {SURFACE_CATALOG} from './surface-catalog.mjs';

const furniture=[
  ['clover-planter','四叶草盆栽','釉面陶器',[0xdba88a,0x78a884,0xfff1d1]],
  ['reading-shelf','阅读书架','木艺与黄铜',[0xd3ab78,0x88b9a0,0xe8c471]],
  ['cloud-table','云朵小桌','奶油云朵木艺',[0xfff1d1,0x88b9a0,0xe8c471]],
  ['moon-ornament','月亮摆件','珠光星月',[0xe8c471,0xb8a5c7,0xfff1d1]],
  ['star-lamp','星星夜灯','黄铜星芒',[0xe8c471,0xfff1d1,0xb8a5c7]],
  ['mushroom-stool','蘑菇小板凳','软垫与刺绣',[0xe5aa8e,0xfff1d1,0xd3ab78]],
  ['beehive-ornament','蜂巢摆件','蜂蜜釉与花饰',[0xe8c471,0xfff1d1,0xd3ab78]],
  ['rocket-toy','小火箭摆件','珐琅与铆钉',[0xe5aa8e,0x88b9a0,0x94b8c1]],
  ['rainbow-arch','彩虹小拱门','多彩云端拱门',[0xe5aa8e,0x88b9a0,0xb8a5c7]],
  ['candy-tree','糖果小树','奶油陶盆与糖饰',[0x88b9a0,0xe5aa8e,0xe8c471]],
].map(([sku,name,finish,colors])=>({sku,name,category:'furniture',finish,colors}));
const builtin=[
  ['sofa','大沙发','软包与抱枕'],['table','书桌','圆角木作'],['lamp','小台灯','暖光灯饰'],['rug','大地毯','织物与流苏'],
  ['lamp-cabinet','小柜子','木柜与黄铜'],['plant-shelf','花架','木艺绿植'],['wall-pictures','装饰画','双联画框'],
  ['floor-pot','地面盆栽','陶盆绿植'],['ottoman-a','软凳A','奶油软垫'],['ottoman-b','软凳B','薄荷软垫'],['front-fence','前栅栏','奶油木栅'],
].map(([sku,name,finish])=>({sku,name,category:sku==='rug'?'flooring':sku==='wall-pictures'?'wall':'builtin',finish,colors:[0xe8c38b,0xfff1d1,0xa7c77b]}));
const finishes={honey:'奶油釉面',checker:'蜜桃釉面',diamond:'薄荷镶花',mosaic:'海盐马赛克',terrazzo:'樱花水磨石',parquet:'胡桃木拼花',marble:'金脉大理石',royal:'鎏金宫廷拼花',botanical:'原木植物画',daisy:'藤编花饰',rainbow:'彩虹云饰',butterfly:'玻璃感标本框',moon:'月光与珍珠',clock:'木作机械钟',ocean:'海景浮雕',sakura:'樱花金边折扇',mirror:'金边与宝石',crystal:'黄铜与水晶',celestial:'珐琅星轨',phoenix:'金边凤羽长屏'};
export const PRODUCT_PREVIEW_ITEMS=Object.freeze([...furniture,...SURFACE_CATALOG.map(item=>({...item,finish:finishes[item.motif]})),...builtin].map(item=>Object.freeze(item)));
export const PRODUCT_PREVIEW_INFO=new Map(PRODUCT_PREVIEW_ITEMS.map(item=>[item.sku,item]));
