import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {BADGE_TIERS,badgeTierForLevel} from '../profile.mjs';

let playwright;
try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/room.css"><link rel="stylesheet" href="/shop.css"><link rel="stylesheet" href="/profile-upgrade.css"><style>body{margin:0;background:#f5eedb}#host{width:780px;height:850px}#art{display:flex;flex-wrap:wrap}#art>div{width:120px}#art svg{width:120px;height:132px}</style><body><div id="host"></div><div id="art"></div><script type="module">
import {createBadgeEmblem,badgeProgressionTitle} from '/badge-art.mjs';
import {BADGE_TIERS} from '/profile.mjs';
import {createRoomView} from '/view.js';
import {createProfilePanel} from '/scene-profile.js';
window.draw=(gender,tier,category='level')=>{const parent=document.createElement('div');document.querySelector('#art').append(parent);return createBadgeEmblem(parent,BADGE_TIERS[tier],category,gender);};
window.modules={createBadgeEmblem,badgeProgressionTitle,BADGE_TIERS};
window.makeProfile=async({shadow=false}={})=>{
 const host=document.querySelector('#host'),container=shadow?host.attachShadow({mode:'open'}):host;
 const view=createRoomView(container);view.root.querySelector('[data-room-control="loading"]').hidden=true;
 const p={name:'原昵称',gender:'male',avatar:null,level:1,levelName:'小小学员',levelInfo:{progress:.25,need:100,intoLevel:25},badges:[{id:'first-checkin',name:'第一次签到',description:'签到一次',category:'checkin',unlocked:false},{id:'study-1h',name:'学习一小时',description:'学习一小时',category:'study',unlocked:false},{id:'level-3',name:'学有所成',description:'升到三级',category:'level',unlocked:false},{id:'streak-3',name:'坚持三天',description:'连续签到三天',category:'growth',unlocked:false}],checkInDates:[],calendar:{year:2026,month:10,days:[{date:'2026-10-28',day:28,isToday:true}]},todayChecked:true,todayReward:{exp:5,points:3},tomorrowReward:{day:1,exp:5,points:3},makeups:{count:0},balance:1000};
 const state={ready:true,lifecycle:'ready',shop:{balance:1000}},calls={reads:0};
 const api={getProfile:()=>{calls.reads++;return {ok:true,profile:structuredClone(p)};},setProfileGender:gender=>{p.gender=gender;return {ok:true};},setProfileName:name=>{p.name=name;return {ok:true};},setProfileAvatar:()=>({ok:true}),checkIn:()=>({ok:true}),makeUpCheckIn:()=>({ok:true})};
 const panel=createProfilePanel({root:view.root,api});panel.update(state);await new Promise(resolve=>setTimeout(resolve,0));panel.open();await new Promise(resolve=>setTimeout(resolve,0));
 window.fixture={view,panel,p,state,calls,container,async change(patch){Object.assign(p,patch);await new Promise(resolve=>setTimeout(resolve,530));panel.update(state);await new Promise(resolve=>setTimeout(resolve,0));}};return true;
};window.fixtureReady=true;
</script></body></html>`;

test('badge tiers use the actual five level boundaries without early promotion',()=>{
 assert.deepEqual(BADGE_TIERS.map(tier=>tier.minLevel),[1,4,8,12,16]);
 for(let i=0;i<BADGE_TIERS.length;i++){
  const tier=BADGE_TIERS[i];assert.equal(badgeTierForLevel(tier.minLevel).id,tier.id);
  if(i)assert.equal(badgeTierForLevel(tier.minLevel-1).id,BADGE_TIERS[i-1].id);
 }
 assert.equal(badgeTierForLevel(20).id,BADGE_TIERS.at(-1).id);
});

test('badge artwork and profile progression in Chromium',{skip:!playwright&&'Set PET_ROOM_PLAYWRIGHT_MODULE or install Playwright for browser checks'},async t=>{
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=resolve(root,`.${pathname}`);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await playwright.chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{})});
  const url=`http://127.0.0.1:${server.address().port}/`;
  async function pageFor(run){const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));try{await page.goto(url);await page.waitForFunction(()=>window.fixtureReady);await run(page);assert.deepEqual(errors,[],'no unhandled profile/art errors');}finally{await page.close();}}

  await t.test('locked collections show artwork, requirements and the exact next tier progress',()=>pageFor(async page=>{
   await page.evaluate(()=>makeProfile());
   await page.evaluate(()=>fixture.change({xp:25,nextBadgeHint:{id:'study-1h',name:'学习一小时',hint:'再学 45 分钟'}}));
   const first=await page.evaluate(()=>{const root=fixture.view.root;return {title:root.querySelector('.room-profile-unlock-title').textContent,text:root.querySelector('.room-profile-unlock-text').textContent,progress:root.querySelector('.room-profile-unlock-track').getAttribute('aria-valuenow'),states:[...root.querySelectorAll('.room-profile-tier-state')].map(x=>x.textContent),hook:root.querySelector('.room-profile-collection-goal').textContent,locked:[...root.querySelectorAll('.room-profile-badge.locked')].map(x=>({state:x.querySelector('.room-profile-badge-state').textContent,requirement:x.querySelector('.room-profile-badge-desc').textContent,opacity:getComputedStyle(x.querySelector('.room-profile-badge-mark')).opacity,filter:getComputedStyle(x).filter}))};});
   assert.match(first.title,/4级解锁/);assert.match(first.text,/455 经验/);assert.equal(first.progress,'5');assert.deepEqual(first.states,['已点亮','未解锁','未解锁','未解锁','未解锁']);assert.match(first.hook,/学习一小时.*45 分钟/);assert.equal(first.locked.length,4);for(const card of first.locked){assert.equal(card.state,'未解锁 · 预览');assert.ok(card.requirement);assert.ok(Number(card.opacity)>=.7);assert.equal(card.filter,'none');}
   await page.locator('.room-profile-unlock-action').click();
   assert.equal(await page.evaluate(()=>document.activeElement.querySelector('h3')?.textContent),'每日签到','checked-in users can still focus the reward section');
   await page.evaluate(()=>fixture.change({level:16,xp:7800}));
   assert.equal(await page.locator('.room-profile-unlock-goal').isVisible(),false,'top tier does not offer an impossible next unlock');
  }));

  await t.test('male and female artwork grows in detail and remains distinct without animated filters',()=>pageFor(async page=>{
   const result=await page.evaluate(()=>{
    const shapeAttrs=['d','points','cx','cy','r','rx','ry','transform'];
    return ['male','female'].map(gender=>modules.BADGE_TIERS.map((tier,index)=>{
     const art=draw(gender,index),shapes=[...art.querySelectorAll('path,polygon,circle,ellipse')];
     return {gender:art.dataset.gender,tier:art.dataset.tier,stage:art.dataset.stage,title:art.dataset.design,accessibleTitle:art.querySelector('title').textContent,count:shapes.length,shape:JSON.stringify(shapes.map(node=>[node.tagName,...shapeAttrs.map(name=>node.getAttribute(name))])),unsafe:art.querySelectorAll('animate,animateTransform,animateMotion,filter,script').length,animation:getComputedStyle(art).animationName,filter:getComputedStyle(art).filter};
    }));
   });
   for(const [index,gender]of ['male','female'].entries()){
    const list=result[index];assert.equal(new Set(list.map(item=>item.shape)).size,5,`${gender} has five geometry progressions`);assert.equal(new Set(list.map(item=>item.title)).size,5);
    for(let tier=0;tier<list.length;tier++){const item=list[tier];assert.equal(item.gender,gender);assert.equal(item.tier,BADGE_TIERS[tier].id);assert.equal(item.stage,String(tier+1));assert.match(item.accessibleTitle,new RegExp(`${BADGE_TIERS[tier].minLevel}级`));assert.equal(item.unsafe,0);assert.equal(item.animation,'none');assert.equal(item.filter,'none');if(tier)assert.ok(item.count>list[tier-1].count,'more detail is added at every tier');}
   }
   for(let i=0;i<5;i++)assert.notEqual(result[0][i].shape,result[1][i].shape,'gender styles differ by geometry rather than palette alone');
  }));

  await t.test('neutral level artwork stays neutral without gendered portraits',()=>pageFor(async page=>{
   const result=await page.evaluate(()=>{
    const neutral=modules.BADGE_TIERS.map((tier,index)=>{const art=draw('none',index);return {gender:art.dataset.gender,title:art.dataset.design,markup:art.outerHTML};});
    const defaultArt=draw(undefined,0);
    return {neutral,defaultGender:defaultArt.dataset.gender};
   });
   assert.equal(result.defaultGender,'none');for(const art of result.neutral){assert.equal(art.gender,'none');assert.match(art.title,/徽章|勋章/);assert.doesNotMatch(art.markup,/王者|女王|小公主|小骑士/);}
  }));

  await t.test('independently loaded module copies cannot resolve each other’s gradient IDs',()=>pageFor(async page=>{
   const result=await page.evaluate(async()=>{
    const [a,b]=await Promise.all([import('/badge-art.mjs?copy=1'),import('/badge-art.mjs?copy=2')]);
    const parents=[document.createElement('div'),document.createElement('div')];parents.forEach(parent=>document.querySelector('#art').append(parent));
    const arts=[a.createBadgeEmblem(parents[0],modules.BADGE_TIERS[4],'level','male'),b.createBadgeEmblem(parents[1],modules.BADGE_TIERS[4],'level','female')];
    return arts.map(art=>({ids:[...art.querySelectorAll('[id]')].map(node=>node.id),refs:[...art.querySelectorAll('*')].flatMap(node=>['fill','stroke'].map(name=>node.getAttribute(name)).filter(value=>value?.startsWith('url(#')).map(value=>value.slice(5,-1)))}));
   });
   const all=result.flatMap(copy=>copy.ids);assert.equal(new Set(all).size,all.length);for(const copy of result){assert.ok(copy.ids.length>=3);assert.ok(copy.refs.length>0);for(const reference of copy.refs)assert.ok(copy.ids.includes(reference),'every gradient reference belongs to its own artwork');}
  }));

  await t.test('achievement art stays independent of level changes and opens a larger collectible detail',()=>pageFor(async page=>{
   await page.evaluate(()=>makeProfile());
   await page.evaluate(()=>{window.oldAchievement=fixture.view.root.querySelector('[data-profile-badge="study-1h"] svg');});
   await page.evaluate(()=>fixture.change({level:16,xp:7800}));
   assert.equal(await page.evaluate(()=>oldAchievement===fixture.view.root.querySelector('[data-profile-badge="study-1h"] svg')),true,'level progression must not redraw an achievement as a level crest');
   await page.locator('[data-profile-badge="study-1h"]').click();
   const detail=await page.locator('.room-profile-badge-detail').evaluate(node=>({visible:!node.hidden,id:node.querySelector('svg').dataset.achievementId,tier:node.querySelector('svg').getAttribute('data-tier'),text:node.textContent,width:node.querySelector('svg').getBoundingClientRect().width}));
   assert.equal(detail.visible,true);assert.equal(detail.id,'study-1h');assert.equal(detail.tier,null);assert.match(detail.text,/学习一小时/);assert.ok(detail.width>=100);
  }));

  for(const shadow of [false,true])await t.test(`HUD, preview and wall follow profile gender and tier without losing focus${shadow?' in Shadow DOM':''}`,()=>pageFor(async page=>{
   await page.evaluate(shadow=>makeProfile({shadow}),shadow);
   async function inspect(){return page.evaluate(()=>{
    const root=fixture.view.root,tree=root.getRootNode(),active=tree.activeElement||document.activeElement;
    return {hud:{gender:root.querySelector('.room-profile-hud-emblem svg').dataset.gender,tier:root.querySelector('.room-profile-hud-emblem svg').dataset.tier},main:{gender:root.querySelector('.room-profile-main-emblem svg').dataset.gender,tier:root.querySelector('.room-profile-main-emblem svg').dataset.tier},preview:[...root.querySelectorAll('.room-profile-tier-step svg')].map(art=>({gender:art.dataset.gender,tier:art.dataset.tier})),wall:[...root.querySelectorAll('.room-profile-badge-mark svg')].map(art=>({gender:art.dataset.gender,tier:art.getAttribute('data-tier'),achievement:art.dataset.achievementId,design:art.dataset.design})),focus:active?.className,value:root.querySelector('.room-profile-name').value,focusedBadge:active?.dataset.profileBadge,hint:root.querySelector('.room-profile-gender-hint').hidden};
   });}
   function assertSurfaces(result,gender,tier){assert.deepEqual(result.hud,{gender,tier});assert.deepEqual(result.main,{gender,tier});assert.equal(result.preview.length,5);assert.deepEqual(result.preview.map(item=>item.tier),BADGE_TIERS.map(item=>item.id));assert.ok(result.preview.every(item=>item.gender===gender));assert.equal(result.wall.length,4);assert.ok(result.wall.every(item=>item.gender===gender&&item.tier===null),'achievements must never inherit the current level crest');assert.equal(new Set(result.wall.map(item=>item.achievement)).size,4);assert.equal(new Set(result.wall.map(item=>item.design)).size,4);}
   await page.evaluate(()=>{const input=fixture.view.root.querySelector('.room-profile-name');input.focus();input.value='正在输入的昵称';});
   await page.evaluate(()=>fixture.change({gender:'male',level:8,name:'外部更新昵称'}));let result=await inspect();assertSurfaces(result,'male','gold');assert.equal(result.focus,'room-profile-name');assert.equal(result.value,'正在输入的昵称');
   await page.evaluate(()=>fixture.view.root.querySelector('[data-profile-badge="study-1h"]').focus());
   await page.evaluate(()=>fixture.change({gender:'female',level:12}));result=await inspect();assertSurfaces(result,'female','crystal');assert.equal(result.focusedBadge,'study-1h','keyboard focus follows the same achievement when its artwork changes');
   await page.evaluate(()=>fixture.change({gender:'none',level:1}));result=await inspect();assertSurfaces(result,'none','bronze');assert.equal(result.focusedBadge,'study-1h');assert.equal(result.hint,false);
  }));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
