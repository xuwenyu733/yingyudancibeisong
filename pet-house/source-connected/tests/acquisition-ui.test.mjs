import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfilePanel} from '../scene-profile.js';
import {BADGE_TIERS} from '../profile.mjs';
import {formatAcquisitionTime} from '../acquisition-time.mjs';

// Exercise the actual profile panel through its public API and DOM events.
function fixture({backups}={}){
  let doc,id=0,writes=0;const timers=new Map(),cache=new Map();
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.attrs=new Map();this.listeners=new Map();this.style={setProperty(){}};this.hidden=false;this.value='';this.className='';this._text='';this.classList={contains:name=>this.className.split(' ').includes(name),add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(name=>!names.includes(name)).join(' ');},toggle:(name,value)=>{const next=value===undefined?!this.classList.contains(name):value;if(next)this.classList.add(name);else this.classList.remove(name);return next;}};}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}set textContent(value){writes++;for(const child of this.children)child.parentElement=null;this.children=[];this._text=value==null?'':String(value);}
    get disabled(){return this._disabled||false;}set disabled(value){if(Boolean(value)!==this.disabled)writes++;this._disabled=Boolean(value);}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    insertBefore(node,before){node.remove();node.parentElement=this;const at=this.children.indexOf(before);this.children.splice(at<0?this.children.length:at,0,node);}
    replaceChildren(...nodes){this.textContent='';this.append(...nodes);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    setAttribute(name,value){writes++;this.attrs.set(name,String(value));if(name==='class')this.className=String(value);}
    getAttribute(name){if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]??null;return this.attrs.get(name)??null;}removeAttribute(name){this.attrs.delete(name);}
    addEventListener(name,handler,options={}){const handlers=this.listeners.get(name)||[];handlers.push({handler,options});this.listeners.set(name,handlers);}removeEventListener(name,handler){this.listeners.set(name,(this.listeners.get(name)||[]).filter(item=>item.handler!==handler));}
    dispatchEvent(event){event.target||=this;event.preventDefault||=()=>{};for(const{handler,options}of this.listeners.get(event.type)||[])if(!options.signal?.aborted)handler(event);return true;}
    async fire(type,extra={}){let prevented=false;const event={type,target:this,preventDefault(){prevented=true;},...extra};for(let node=this;node;node=node.parentElement)node.dispatchEvent(event);if(type==='keydown'&&!prevented&&this.tagName==='BUTTON'&&['Enter',' '].includes(extra.key))await this.fire('click');for(let i=0;i<8;i++)await Promise.resolve();}
    matches(selector){if(selector==='[hidden]')return this.hidden;if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);if(attr){const value=this.getAttribute(attr[1]);return attr[2]===undefined?value!==null:value===attr[2];}return this.tagName.toLowerCase()===selector.toLowerCase();}
    querySelectorAll(selector){const result=[];for(const child of this.children){if(child.matches(selector))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}contains(node){return this===node||this.children.some(child=>child.contains(node));}
    getRootNode(){return doc;}focus(){doc.activeElement=this;}scrollIntoView(){}get isConnected(){return this===doc.body||!!this.parentElement?.isConnected;}
  }
  const win={AbortController,listeners:new Map(),addEventListener:Element.prototype.addEventListener,removeEventListener:Element.prototype.removeEventListener,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},localStorage:{getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)},setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(key){timers.delete(key);},requestAnimationFrame(fn){timers.set(++id,fn);return id;},cancelAnimationFrame(key){timers.delete(key);}};
  doc={defaultView:win,listeners:new Map(),addEventListener:Element.prototype.addEventListener,removeEventListener:Element.prototype.removeEventListener,createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag)};doc.body=new Element('body');const root=new Element('div');doc.body.append(root);
  let profile={name:'甜甜',gender:'none',avatar:null,level:4,xp:480,levelName:'进阶学员',totalStudySeconds:0,streakDays:1,totalCheckIns:1,checkInDates:['2026-10-28'],calendar:{year:2026,month:10,days:[{date:'2026-10-28',isToday:true}]},todayChecked:false,todayReward:{exp:5,points:3},tomorrowReward:{day:2,exp:5,points:3},levelInfo:{progress:0,need:280,intoLevel:0},balance:1000,makeups:{count:0},badges:[{id:'first-checkin',name:'初次签到',description:'完成第一次签到',category:'checkin',unlocked:true,unlockedAt:'2026-10-28',acquiredAt:'2026-10-28T01:02:45Z'}],levelBadges:BADGE_TIERS.map(tier=>({...tier,unlocked:tier.minLevel<=4,acquiredAt:tier.id==='bronze'?'2026-10-01T02:03:04Z':tier.id==='silver'?'2026-10-28T03:04:56Z':null}))};
  const calls={checkin:0},api={getProfile:()=>({ok:true,profile:structuredClone(profile)}),checkIn(){calls.checkin++;profile.todayChecked=true;return {ok:true,exp:5,points:3};},setProfileGender(gender){profile.gender=gender;return {ok:true};},setProfileName(){return {ok:true};},setProfileAvatar(){return {ok:true};}};
  if(backups)Object.assign(api,{listBackups:()=>({ok:true,backups:structuredClone(backups)}),createBackup:()=>({ok:true})});
  const ui=createProfilePanel({root,api}),flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};ui.update({ready:true});return {root,doc,ui,api,calls,flush,get writes(){return writes;},get profile(){return profile;},set profile(value){profile=value;}};
}

test('native level crest buttons show saved acquisition time, level threshold and locked state',async()=>{
  const f=fixture();await f.flush();f.ui.open();await f.flush();const steps=f.root.querySelectorAll('.room-profile-tier-step');assert.equal(steps.length,5);assert.ok(steps.every(step=>step.tagName==='BUTTON'));
  await steps[0].fire('click');const detail=f.root.querySelector('.room-profile-tier-detail');assert.equal(detail.hidden,false);assert.match(detail.textContent,/等级门槛：1 级/);assert.ok(detail.textContent.includes(formatAcquisitionTime('2026-10-01T02:03:04Z')));
  await steps[1].fire('keydown',{key:'Enter'});assert.match(detail.textContent,/等级门槛：4 级/);assert.ok(detail.textContent.includes(formatAcquisitionTime('2026-10-28T03:04:56Z')));
  await steps[2].fire('click');assert.match(detail.textContent,/尚未解锁/);assert.doesNotMatch(detail.textContent,/获得时间：/);assert.equal(f.calls.checkin,0);f.ui.dispose();
});

test('HUD still opens the profile, the main level card exposes its time, and checking dates does not sign in',async()=>{
  const f=fixture();await f.flush();await f.root.querySelector('.room-profile-level').fire('click');const panel=f.root.querySelector('.room-profile');assert.equal(panel.hidden,false);
  await f.root.querySelector('.room-profile-current-badge').fire('click');assert.match(f.root.querySelector('.room-profile-tier-detail').textContent,/获得时间：.*:56/);assert.equal(f.calls.checkin,0);
  await f.root.querySelector('.room-profile-tier-detail-close').fire('click');assert.equal(f.root.querySelector('.room-profile-tier-detail').hidden,true);
  const sign=f.root.querySelector('.room-profile-body').querySelectorAll('button').find(button=>button.textContent==='签到');await sign.fire('click');assert.equal(f.calls.checkin,1);f.ui.dispose();
});

test('achievement details prefer second precision, retain legacy date precision, and distinguish unknown records',async()=>{
  const f=fixture();await f.flush();f.ui.open();await f.flush();const click=async()=>{const cell=f.root.querySelector('[data-profile-badge]');assert.ok(cell);await cell.fire('click');return f.root.querySelector('.room-profile-badge-detail').textContent;};
  assert.ok((await click()).includes(formatAcquisitionTime('2026-10-28T01:02:45Z')));
  f.profile.badges[0].acquiredAt=null;f.ui.close();f.ui.open();await f.flush();assert.match(await click(),/获得日期：2026年10月28日（具体时间未记录）/);
  f.profile.badges[0].unlockedAt=null;f.ui.close();f.ui.open();await f.flush();assert.match(await click(),/获得时间未记录/);
  f.profile.badges[0].unlocked=false;f.profile.badges[0].acquiredAt='2026-10-28T01:02:45Z';f.ui.close();f.ui.open();await f.flush();const locked=await click();assert.match(locked,/尚未解锁/);assert.doesNotMatch(locked,/获得时间：/);f.ui.dispose();
});

test('legacy level records explicitly remain unknown and refreshing preserves the selected detail controls',async()=>{
  const f=fixture();f.profile.levelBadges=undefined;await f.flush();f.ui.open();await f.flush();await f.root.querySelector('.room-profile-current-badge').fire('click');const detail=f.root.querySelector('.room-profile-tier-detail'),close=detail.querySelector('button');assert.match(detail.textContent,/获得时间未记录/);
  await f.root.querySelectorAll('.room-profile-gender')[0].fire('click');assert.equal(detail.querySelector('button'),close,'刷新不应重新创建详情按钮或打断焦点');assert.equal(f.calls.checkin,0);f.ui.dispose();
});

test('unchanged background profile refreshes keep DOM, focused dates and enabled buttons stable',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const f=fixture();f.profile.checkInDates=[];await f.flush();f.ui.open();await f.flush();
  const today=f.root.querySelector('[data-checkin-today="true"]');today.focus();
  await f.root.querySelector('.room-profile-current-badge').fire('click');
  const detail=f.root.querySelector('.room-profile-tier-detail'),detailTime=detail.querySelector('.room-acquired-time').textContent,before=f.writes;
  for(let i=0;i<4;i++){now+=600;f.ui.update({ready:true});await f.flush();}
  assert.equal(f.writes,before,'polling identical data must not rewrite the visible panel or pulse disabled styles');
  assert.equal(f.root.querySelector('[data-checkin-today="true"]'),today);assert.equal(f.doc.activeElement,today);
  assert.equal(detail.hidden,false);assert.equal(detail.querySelector('.room-acquired-time').textContent,detailTime);f.ui.dispose();
});

test('a profile change preserves unchanged calendar, weekly and backup nodes',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const f=fixture({backups:[{id:'one',at:'2026-10-28T01:00:00Z',note:'手动备份'}]});
  f.profile.checkInDates=[];f.profile.stats={weekly:{checkedDays:1,days:[{date:'2026-10-28',checked:true}]}};
  await f.flush();f.ui.open();await f.flush();
  const today=f.root.querySelector('[data-checkin-today="true"]'),week=f.root.querySelector('.room-profile-weekly-day'),backup=f.root.querySelector('.room-profile-archive-item');today.focus();
  assert.ok(week);assert.ok(backup);
  f.profile.name='团团';now+=600;f.ui.update({ready:true});await f.flush();
  assert.equal(f.root.querySelector('[data-checkin-today="true"]'),today);assert.equal(f.doc.activeElement,today);
  assert.equal(f.root.querySelector('.room-profile-weekly-day'),week);assert.equal(f.root.querySelector('.room-profile-archive-item'),backup);
  assert.match(f.root.querySelector('.room-profile-level').getAttribute('aria-label'),/团团/);f.ui.dispose();
});

test('a slow background read leaves actions available and cannot overwrite a later check-in',async()=>{
  const f=fixture();await f.flush();f.ui.open();await f.flush();
  const getProfile=f.api.getProfile,stale=getProfile();let release;
  f.api.getProfile=()=>{f.api.getProfile=getProfile;return new Promise(resolve=>{release=()=>resolve(stale);});};
  f.ui.close();f.ui.open();await f.flush();
  const sign=f.root.querySelector('.room-profile-body').querySelectorAll('button').find(button=>button.textContent==='签到');assert.equal(sign.disabled,false,'background reads do not disable actions');
  await sign.fire('click');assert.equal(f.calls.checkin,1);assert.equal(sign.textContent,'今日已签到');
  release();await f.flush();assert.equal(sign.textContent,'今日已签到','older background results are ignored');assert.equal(sign.disabled,true);f.ui.dispose();
});
