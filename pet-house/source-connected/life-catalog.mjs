export const LIFE_CATALOG=Object.freeze({
 materials:{wood:'木板',cloth:'布料',pigment:'颜料',crystal:'星砂',flour:'面粉',water:'清水',carrot:'胡萝卜',berry:'草莓',mint:'薄荷',cookies:'胡萝卜饼干',juice:'草莓果汁',tea:'薄荷茶'},
 market:[{id:'seed-carrot',name:'胡萝卜种子',price:1},{id:'seed-berry',name:'草莓种子',price:1},{id:'seed-mint',name:'薄荷种子',price:1},{id:'wood',name:'木板',price:2},{id:'cloth',name:'布料',price:2},{id:'pigment',name:'颜料',price:2},{id:'crystal',name:'星砂',price:3},{id:'flour',name:'面粉',price:1},{id:'water',name:'清水',price:1}],
 crops:[{id:'carrot',name:'胡萝卜',emoji:'🥕',growMs:60_000},{id:'berry',name:'草莓',emoji:'🍓',growMs:90_000},{id:'mint',name:'薄荷',emoji:'🌿',growMs:120_000}],
 recipes:[{id:'cookies',name:'胡萝卜饼干',emoji:'🍪',cost:{carrot:2,flour:1}},{id:'juice',name:'草莓果汁',emoji:'🥤',cost:{berry:2,water:1}},{id:'tea',name:'薄荷茶',emoji:'🍵',cost:{mint:2,water:1}}],
 blueprints:[
  {id:'clover-planter',name:'四叶草盆栽',cost:{wood:2,pigment:1}},
  {id:'cloud-table',name:'云朵小桌',cost:{wood:3,cloth:1}},
  {id:'reading-shelf',name:'阅读书架',cost:{wood:4,pigment:1}},
  {id:'star-lamp',chapter:1,name:'星星夜灯',cost:{wood:2,crystal:1}},
  {id:'moon-ornament',chapter:1,name:'月亮摆件',cost:{wood:2,crystal:1}},
  {id:'rocket-toy',chapter:1,name:'小火箭摆件',cost:{wood:3,pigment:1}},
  {id:'candy-tree',chapter:2,name:'糖果小树',cost:{wood:2,pigment:1}},
  {id:'rainbow-arch',chapter:2,name:'彩虹小拱门',cost:{wood:3,cloth:1,pigment:1}},
  {id:'mushroom-stool',chapter:2,name:'蘑菇小板凳',cost:{wood:2,cloth:1}},
 ],
 quests:[
  {id:'welcome',name:'邻居的阅读角',npc:'📚 小鹿',text:'让桌子、灯和植物一起陪伴阅读。',requires:['table','lamp','floor-pot'],reward:{stars:4,wood:3,cloth:2},gift:'阅读角纪念星星'},
  {id:'forest',name:'森林书房',npc:'🌿 小松鼠',text:'在这一层摆上四叶草盆栽和阅读书架。',requires:['clover-planter','reading-shelf'],reward:{stars:5,wood:4,crystal:1},gift:'森林小花纪念摆件'},
  {id:'stars',name:'星光晚安屋',npc:'🌙 月亮兔',text:'把星星夜灯和月亮摆件放进这一层。',requires:['star-lamp','moon-ornament'],reward:{stars:5,cloth:3,pigment:2},gift:'星光纪念灯笼'},
  {id:'sweet',name:'彩虹茶会',npc:'🍭 糖糖',text:'让糖果小树和彩虹拱门成为房间的一部分。',requires:['candy-tree','rainbow-arch'],reward:{stars:6,wood:4,crystal:2},gift:'彩虹茶会小花'},
  {id:'drawing',name:'墙上的小故事',npc:'🎨 画画熊',text:'在这一层保存一幅有笔画的涂鸦墙作品。',drawing:true,reward:{stars:4,pigment:3,cloth:2},gift:'原创画家纪念星星'},
 ],
 sets:[
  {id:'forest',name:'森林阅读屋',items:['clover-planter','reading-shelf','cloud-table'],gift:'森林阅读屋收藏奖杯',kind:'flower'},
  {id:'stars',name:'星空探险屋',items:['star-lamp','moon-ornament','rocket-toy'],gift:'星空探险收藏奖杯',kind:'star'},
  {id:'sweet',name:'甜甜童话屋',items:['candy-tree','rainbow-arch','mushroom-stool'],gift:'甜甜童话收藏奖杯',kind:'lantern'},
 ],
 jobs:[{id:'designer',name:'小设计师',emoji:'🎨',skill:'完成装修委托、制作家具和集齐套装'},
  {id:'gardener',name:'小园艺师',emoji:'🌻',skill:'种植、浇水和收获作物'},
  {id:'chef',name:'小厨师',emoji:'👩‍🍳',skill:'制作料理和完成邻居订单'}],
 careerTasks:[{id:'designer-craft',job:'designer',name:'亲手制作一件家具',stat:'crafted',need:1,xp:2},{id:'designer-set',job:'designer',name:'集齐一套主题家具',stat:'sets',need:1,xp:5},
  {id:'gardener-harvest',job:'gardener',name:'收获三份作物',stat:'harvested',need:3,xp:3},{id:'gardener-water',job:'gardener',name:'为三块作物浇水',stat:'watered',need:3,xp:5},
  {id:'chef-cook',job:'chef',name:'做好两份料理',stat:'cooked',need:2,xp:4},{id:'chef-order',job:'chef',name:'完成三份邻居订单',stat:'delivered',need:3,xp:8}],
 chapters:[
  {id:'new-neighbor',name:'新邻居搬家啦',npc:'📚 小鹿',steps:[
   {text:'小鹿抱着一箱书站在门口：“你愿意先陪我做什么？”',choices:['先布置阅读角','先认识这间小屋']},
   {text:'“有桌子、有灯、有植物，读书就舒服啦！”请验收“邻居的阅读角”委托。',require:'quest',id:'welcome'},
   {text:'“拍一张新家的照片，我们一起记住今天吧。”到摄影室保存一张作品。',require:'photo',need:1}],gift:'新邻居的欢迎星星',kind:'star'},
  {id:'garden-tea',name:'森林里的下午茶',npc:'🌿 小松鼠',steps:[
   {text:'“下午茶想用自己种出来的食材，你想先种什么？”',choices:['甜甜的草莓','脆脆的胡萝卜','清新的薄荷']},
   {text:'“小苗已经长大啦。”在种植区至少收获一次。',require:'stat',stat:'harvested',need:1},
   {text:'“把心意做成一份料理，再送给等候的邻居吧。”完成一份餐厅订单。',require:'stat',stat:'delivered',need:1}],gift:'森林茶会花环',kind:'flower'},
  {id:'design-show',name:'我的第一次作品展',npc:'🎨 画画熊',steps:[
   {text:'“作品有自己的故事。先亲手制作一件家具吧。”',require:'stat',stat:'crafted',need:1},
   {text:'“一套完整的布置，会让主题更加清楚。”集齐并领取一套家具图册奖励。',require:'stat',stat:'sets',need:1},
   {text:'“让好朋友看看你的作品吧！”把一张摄影作品发布到好友展厅。',require:'stat',stat:'published',need:1}],gift:'第一次作品展纪念灯',kind:'lantern'},
 ],
 themes:[{id:'forest',name:'森林阅读'},{id:'stars',name:'星空探险'},{id:'sweet',name:'甜甜童话'},{id:'original',name:'我的原创'}],
});
export const lifeItemName=id=>LIFE_CATALOG.materials[id]||LIFE_CATALOG.market.find(x=>x.id===id)?.name||id;
export function careerLevel(xp){return [0,5,15,30,60].filter(x=>xp>=x).length;}
export function currentLifeOrder(state){const recipe=LIFE_CATALOG.recipes[state.orderSerial%3];return {id:'order-'+state.orderSerial,recipe:recipe.id,name:recipe.name,npc:['小鹿','月亮兔','小松鼠'][state.orderSerial%3],reward:{stars:5,wood:2,cloth:1}};}
