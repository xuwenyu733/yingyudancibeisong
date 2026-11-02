// 所有家具的位置 / 旋转 / 缩放集中在这里，坐标单位可视为“米”。
// 世界坐标：Y向上，+Z朝房间前方。沙发GLB正面为+X；原创宠物统一前向+Z。
// 按用户参考图的空间关系重建；原图是2D插画，透视与真实等距投影不会逐像素相同。
export const ROOM = { width:8.8, depth:8.2, wallHeight:5.25, petHeight:1.22 };
export const FURNITURE = {
  sofa: { asset:'optimized/sofa.glb', position:[1.12,0,-2.28], rotation:[0,-Math.PI/2,0], scale:3.7 },
  table: { asset:'optimized/table.glb', position:[-0.55,0,0.87], rotation:[0,0,0], scale:1.9 },
  lamp: { asset:'optimized/lamp.glb', position:[-2.37,1.12,-2.45], rotation:[0,0,0], scale:0.83 },
};
// 座面数据在沙发原始模型局部坐标中定义。以后换沙发，只需重新标定这些点。
export const SOFA = {
  seat:[0.075,0.242,0],
  // 仅接受这个区域内朝上的射线命中；排除高处靠背与两侧扶手。
  seatRegion:{ minX:-0.065,maxX:0.245,minZ:-0.27,maxZ:0.27,minY:0.19,maxY:0.285 },
  approach:[0.58,0,0], // 沙发前方安全落点（模型空间，Y使用世界地面）
};
export const PALETTE = {
  background:0xf6e9c9, floor:0xffedba, floorEdge:0xc99c70,
  wall:0xffedc2, stripe:0xffe3aa, trim:0xcda67b, wood:0xd1a16c,
  rug:0xdfe69b, rugLine:0xb7c477, cream:0xfff6de,
};

// 独立碰撞配置：center/size均为家具局部XYZ，尺寸不取自渲染网格。
// 旋转/缩放由家具matrixWorld统一换算；宠物安全半径只在世界空间加一次。
const collider=(label,center,size,extra={})=>({label,draggable:true,blocksNavigation:true,blocksPlacement:true,boxes:[{center,size}],...extra});
export const COLLIDERS = {
  sofa:collider('沙发',[0,.247,0],[.712,.494,1]),
  table:collider('木质矮桌',[0,.2055,0],[.990,.411,1]),
  lamp:collider('台灯',[0,.5,0],[.871,1,.870]),
  'lamp-cabinet':collider('台灯边柜',[0,.595,0],[1.27,1.05,1.14]),
  'plant-shelf':collider('花架',[0,1.355,0],[.94,2.20,.75]),
  'ottoman-a':collider('黄色软凳',[0,.365,0],[1.24,.69,.99]),
  'ottoman-b':collider('绿色软凳',[0,.365,0],[1.24,.69,.99]),
  'front-fence':collider('矮栅栏',[0,.49,.60],[.095,.89,3.69]),
  // 地面盆栽可拖动；不挡寻路/摆放碰撞，避免旧存档与新碰撞盒冲突导致无法进房。
  'floor-pot':collider('地面盆栽',[0,.35,0],[.55,.70,.55],{blocksNavigation:false,blocksPlacement:false}),
  rug:collider('地毯',[0,.012,0],[5.32,.07,5.22],{blocksNavigation:false,blocksPlacement:false}),
};
export const PLACEMENT_BOUNDS={minX:-4.36,maxX:4.36,minZ:-4.06,maxZ:4.06};
