import {mountRoom} from '../room.js';
import {createRoomView} from '../view.js';
const button=document.querySelector('#run'),status=document.querySelector('#status'),results=document.querySelector('#results'),checks=document.querySelector('#checks'),host=document.querySelector('#host');
let room,view;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
button.addEventListener('click',async()=>{
  button.disabled=true;room?.dispose();view?.dispose();checks.replaceChildren();
  const report={version:'2.3.0',status:'running',checks:[],startedAt:new Date().toISOString()};
  const data=new Map();let failWrite=false;
  const storageAdapter={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(failWrite)throw new Error('模拟存储失败');data.set(key,value);}};
  const publish=()=>{results.textContent=JSON.stringify(report,null,2);document.body.dataset.selfTest=report.status;};
  async function check(name,task){status.textContent=name;await task();report.checks.push({name,status:'passed'});const li=document.createElement('li');li.textContent='通过 · '+name;checks.append(li);publish();}
  function mount(){view=createRoomView(host,{controls:false});room=mountRoom({canvas:view.canvas,storageAdapter,storageKey:'shop-test',initialPoints:1000,persistLayout:false,quality:'low',assetsBaseUrl:new URL('../assets/',import.meta.url).href,onState:s=>view.updateState(s)});return room.ready.then(()=>view.ready());}
  try {
    await check('初次账户 1000 积分，基础房屋及 9 件原家具',async()=>{await mount();assert(room.api.getShop().balance===1000,'初始余额');assert(Object.keys(room.api.getLayout().furniture).length===9,'原家具数');});
    let boughtPosition;
    await check('兑换盆栽，扣 120 分并生成可编辑独立家具',async()=>{const r=await room.api.purchaseFurniture('clover-planter','buy-planter');assert(r.ok,r.message);assert(room.api.getShop().balance===880,'扣积分');boughtPosition=room.api.getLayout().furniture['shop-clover-planter'].position;assert(room.api.getFurniture('shop-clover-planter'),'家具根节点');});
    await check('同一购买请求重放不重复扣分；新请求不能重复买',async()=>{assert((await room.api.purchaseFurniture('clover-planter','buy-planter')).ok,'重放');assert(!(await room.api.purchaseFurniture('clover-planter','buy-again')).ok,'唯一拥有');assert(room.api.getShop().balance===880,'余额不变');});
    await check('600 分真实扩建，地板和行走边界同步扩大',async()=>{const r=await room.api.expandRoom('expand-one');assert(r.ok,r.message);assert(room.api.getShop().balance===280,'扩建扣费');assert(room.api.getShop().width===10.8,'房宽');assert(Math.abs(room.api.getFurniture('room-shell').scale.x-10.8/8.8)<1e-8,'地板缩放');assert(room.api.walkTo(-4.9,0),'新扩建区域可寻路');});
    await check('销毁重挂恢复积分、产权、房级及新家具位置',async()=>{room.dispose();view.dispose();await mount();const s=room.api.getShop();assert(s.balance===280&&s.roomLevel===1&&s.owned.includes('clover-planter'),'恢复账户');assert(JSON.stringify(room.api.getLayout().furniture['shop-clover-planter'].position)===JSON.stringify(boughtPosition),'恢复布局');});
    await check('积分不足时不扣费、不扩大房屋',async()=>{const r=await room.api.expandRoom('insufficient');assert(!r.ok,'应该拒绝');assert(room.api.getShop().roomLevel===1&&room.api.getShop().balance===280,'账户未变');});
    await check('学习奖励 10/5/20 入账，重复学习事件不重复发奖',async()=>{const event={eventId:'learning-one',learned:10,reviewed:10,checkIn:true};assert(room.api.creditLearning(event).ok,'奖励');room.api.creditLearning(event);assert(room.api.getShop().balance===450,'幂等奖励170');});
    await check('购买存储失败，积分和暂存的3D家具同时回滚',async()=>{const before=JSON.stringify(room.api.getLayout());failWrite=true;const r=await room.api.purchaseFurniture('cloud-table','buy-failed');assert(!r.ok,'存储应失败');assert(room.api.getShop().balance===450,'余额回滚');assert(!room.api.getFurniture('shop-cloud-table'),'模型撤销');assert(JSON.stringify(room.api.getLayout())===before,'布局回滚');failWrite=false;});
    await check('存储恢复后重试同一失败请求可以成功',async()=>{assert((await room.api.purchaseFurniture('cloud-table','buy-failed')).ok,'重试');assert(room.api.getShop().balance===270,'扣180');});
    await check('扩建存储失败同时回滚房壳尺寸和房级，恢复后可重试',async()=>{room.api.creditLearning({eventId:'learning-two',learned:100,reviewed:100});const before=room.api.getShop().balance;failWrite=true;assert(!(await room.api.expandRoom('expand-two')).ok,'扩建应失败');assert(room.api.getShop().roomLevel===1&&room.api.getShop().balance===before,'账户回滚');assert(Math.abs(room.api.getFurniture('room-shell').scale.x-10.8/8.8)<1e-8,'房壳回滚');failWrite=false;assert((await room.api.expandRoom('expand-two')).ok,'恢复后扩建成功');assert(room.api.getShop().roomLevel===2,'最高级');});
    await check('满级扩建和未知商品均不扣积分',async()=>{const before=room.api.getShop().balance;assert(!(await room.api.expandRoom('over-max')).ok,'满级');assert(!(await room.api.purchaseFurniture('unknown','bad-item')).ok,'未知商品');assert(room.api.getShop().balance===before,'不扣费');});
    await check('v2.8.2 装修会话中允许直接购买并摆进房间，退出后家具保留',async()=>{assert(await room.api.setDecorationMode(true),'进入装修');const during=await room.api.purchaseFurniture('moon-ornament','during-edit');assert(during.ok,during.message||'装修中不可购买');assert(room.api.getFurniture('shop-moon-ornament'),'装修中购买后家具在房间');assert(room.api.setDecorationMode(false),'退出装修');assert(room.api.getFurniture('shop-moon-ornament'),'退出装修后家具保留');});
    report.status='passed';report.summary={passed:report.checks.length,failed:0};status.textContent=`全部通过：${report.checks.length} 项`;report.finalState=room.api.getState();
  }catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};status.textContent='失败：'+error.message;}
  finally {report.finishedAt=new Date().toISOString();publish();button.disabled=false;}
});
window.addEventListener('pagehide',()=>{room?.dispose();view?.dispose();});
