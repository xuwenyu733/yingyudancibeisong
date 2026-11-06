const product=(sku,name,price,description,category,rarity,colors,motif,size={})=>Object.freeze({sku,name,price,description,kind:'furniture',category,rarity,colors:Object.freeze(colors),motif,...size});
export const WALL_PAINTS=Object.freeze([
  {id:'cream',name:'奶油杏',color:0xffedc2,stripe:0xffe3aa},
  {id:'mint',name:'薄荷奶绿',color:0xd9eadc,stripe:0xc2dbc8},
  {id:'rose',name:'玫瑰奶桃',color:0xf4d9d5,stripe:0xeac1be},
  {id:'sky',name:'晴空浅蓝',color:0xd7e7ed,stripe:0xbdd5df},
  {id:'lavender',name:'薰衣草雾',color:0xe7dff1,stripe:0xd3c6e5},
  {id:'sand',name:'暖沙燕麦',color:0xe8dfcc,stripe:0xd5c7ae},
  {id:'sage',name:'鼠尾草绿',color:0xc9d7c2,stripe:0xb1c3a8},
  {id:'midnight',name:'星夜墨蓝',color:0x596e87,stripe:0x4a5d76},
].map(value=>Object.freeze(value)));
export const FLOOR_CATALOG=Object.freeze([
  product('tile-honey-grid','蜂蜜奶油砖',90,'细腻奶油釉面与蜂蜜色勾缝，为小屋铺一层温暖。','flooring','清新',[0xf9e7bf,0xe7c68f,0xfff6df],'honey'),
  product('tile-blush-checker','蜜桃棋盘砖',160,'奶白与蜜桃交替的柔软棋盘，带一圈精致收边。','flooring','清新',[0xf8e6d5,0xe9b9ad,0xfff8e9],'checker'),
  product('tile-mint-diamond','薄荷菱花砖',240,'薄荷菱形嵌花与浅金交点，清爽又有秩序。','flooring','精致',[0xdbe6d5,0x89b5a3,0xe9cf92],'diamond'),
  product('tile-blue-mosaic','海盐星花砖',360,'海盐蓝小砖拼出星花，像把安静的海风带回家。','flooring','精致',[0xe4edf0,0x7bafc4,0xe8c67e],'mosaic'),
  product('tile-sakura-terrazzo','樱花水磨石',520,'奶粉色石面散落樱花、玉石与金色碎片。','flooring','典藏',[0xf2dfdf,0xd69da5,0xa5bfae,0xe6c17d],'terrazzo'),
  product('tile-walnut-parquet','胡桃人字拼',720,'深浅胡桃木交错铺陈，配黄铜细框与精致角花。','flooring','典藏',[0xa47a5c,0xc69b73,0xe2bd8d,0xeacb83],'parquet'),
  product('tile-moon-marble','月辉金脉石',1050,'奶白大理石嵌入月辉蓝纹与金线，四角点缀月桂。','flooring','珍藏',[0xf1eee7,0x9db4cd,0xdfbc6c,0x617c9c],'marble'),
  product('tile-royal-medallion','星宫鎏金拼花',1500,'深蓝与珍珠白的宫廷拼花，中央星徽、双层金边与宝石角饰。','flooring','臻藏',[0xe9e4d7,0x415b78,0xd9b35f,0x9bbac5,0xf8efd3],'royal'),
]);
export const WALL_CATALOG=Object.freeze([
  product('wall-botanical-frame','晨光植物画',80,'双层原木小画框，收藏一枝舒展的绿叶。','wall','清新',[0xe8c392,0xfff3d9,0x789c73,0xa9be85],'botanical',{width:1.0,height:1.25}),
  product('wall-daisy-wreath','雏菊花环',120,'藤编圆环围着奶白雏菊，垂下一枚杏色蝴蝶结。','wall','清新',[0xba986d,0xfff6dd,0xe8bd61,0x8fa978],'daisy',{width:1.15,height:1.35}),
  product('wall-rainbow-cloud','云端小彩虹',180,'五层柔和彩虹搭着蓬松云朵，垂落小小雨滴。','wall','清新',[0xe6a799,0xe8bc89,0xe8d58a,0x9fc3ae,0x9fbdd0,0xfff5df],'rainbow',{width:1.5,height:1.2}),
  product('wall-butterfly-duo','双蝶标本盒',250,'立体蝴蝶与细金触角，装进带圆角的玻璃感陈列框。','wall','精致',[0xbca5cb,0x8dbcb9,0xf4e4cb,0xd1aa64,0x67778b],'butterfly',{width:1.4,height:1.5}),
  product('wall-moon-mobile','月眠星铃',340,'弯月、三串星铃与珍珠串成一首安静的晚安曲。','wall','精致',[0xe6c477,0xffefc9,0xa8bfd3,0xf7f0df],'moon',{width:1.3,height:1.9}),
  product('wall-forest-clock','林间布谷钟',440,'小屋钟罩、松叶屋顶和会说晚安的布谷鸟。','wall','精致',[0xc49770,0x6f9a83,0xf4e4c3,0xbba36b,0x8c6651],'clock',{width:1.45,height:1.9}),
  product('wall-ocean-triptych','潮汐三联画',580,'三幅错落的海景浮雕，贝壳、波浪与金色日落交相呼应。','wall','典藏',[0xe8d7bb,0x70a4ba,0xaed1d2,0xe7ba72,0xf5e7c9],'ocean',{width:2.1,height:1.4}),
  product('wall-sakura-fan','樱雨折扇',760,'层叠扇骨、细金扇缘与十二瓣樱花，配珍珠流苏。','wall','典藏',[0xf1d7d4,0xc38198,0xe4bd71,0x9e829f,0xfff0dc],'sakura',{width:1.85,height:1.65}),
  product('wall-starlight-mirror','星芒鎏金镜',980,'蓝银镜心围绕双层鎏金星芒，镶嵌珍珠与宝石。','wall','珍藏',[0xbed9df,0x688da6,0xdfba62,0xffefcb,0x97bccb],'mirror',{width:1.65,height:1.75}),
  product('wall-crystal-chandelier','极光水晶壁灯',1250,'三层拱形黄铜骨架悬挂冰蓝与紫晶，灯芯温暖柔亮。','wall','珍藏',[0xe1bd75,0xb0d5df,0xb3a6d2,0xffedbf,0x718cae],'crystal',{width:1.7,height:2.15}),
  product('wall-celestial-orrery','星河天仪',1600,'多重星轨交织，太阳、月亮与行星点缀珐琅星盘。','wall','臻藏',[0x3f5676,0xdbc06f,0xa3c6d7,0xd4c0df,0xffe9ad],'celestial',{width:2.0,height:2.0}),
  product('wall-phoenix-tapestry','凤羽流光屏',2100,'六片金边长屏铺陈渐变凤羽，中心宝石、云纹和垂坠珠帘。','wall','臻藏',[0x466f82,0x83b8b2,0xbaa4cc,0xe3be6b,0xf5e6be,0xc6818b],'phoenix',{width:2.15,height:2.25}),
]);
export const SURFACE_CATALOG=Object.freeze([...FLOOR_CATALOG,...WALL_CATALOG]);
export const findSurface=sku=>SURFACE_CATALOG.find(item=>item.sku===sku)||null;
