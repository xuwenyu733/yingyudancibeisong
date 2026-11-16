import {createPetPreview} from './pet-preview.js';
/** Rename and replace the single current pet through the existing atomic account APIs. */
export function createPetSettings({container,api,perform,requestId}){
 const doc=container.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
 const el=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;if(tag==='button')n.type='button';parent?.append(n);return n;};
 const root=el('section',null,container,'pet-settings');root.setAttribute('aria-label','我的宠物设置');
 const heading=el('strong','',root),actions=el('div',null,root,'pet-settings-actions'),rename=el('button','修改名字',actions),replace=el('button','更换宠物',actions);
 const renameBox=el('div',null,root,'pet-rename');renameBox.hidden=true;
 const label=el('label','宠物新名字',renameBox),input=el('input',null,label);input.type='text';input.maxLength=24;input.setAttribute('aria-label','宠物新名字');input.autocomplete='off';
 el('small','最多12个字，修改名字不消耗积分。',renameBox);const renameActions=el('div',null,renameBox,'pet-settings-actions'),saveName=el('button','保存名字',renameActions),cancelName=el('button','取消改名',renameActions);
 const picker=el('section',null,root,'pet-switcher');picker.hidden=true;picker.setAttribute('aria-label','选择要更换的宠物');el('p','选择后需要确认。更换会替代当前宠物，小屋、名字和成长进度保留。',picker);
 const choices=el('div',null,picker,'pet-switch-choices'),confirmation=el('section',null,picker,'pet-switch-confirmation');confirmation.hidden=true;
 const livePreview=createPetPreview(picker);
 const confirmationText=el('p','',confirmation),confirm=el('button','确认更换',confirmation),cancel=el('button','暂不更换',picker),status=el('output','',root,'pet-settings-status');status.setAttribute('role','status');
 let current={},blocked=false,selected=null,transactionId=null,catalogSignature='',viewSignature='',disposed=false,choiceEvents=null,lastActive=null;
 const nickname=()=>api.getCompanion?.()?.companion?.petName||'团团';
 function say(message){status.textContent=message;}
 function closePicker(){livePreview.hide();picker.hidden=true;confirmation.hidden=true;selected=transactionId=null;replace.setAttribute('aria-expanded','false');replace.focus({preventScroll:true});}
 function updateConfirmation(){
  const item=current.pets?.catalog?.find(x=>x.sku===selected);confirmation.hidden=!item;
  if(!item)return;const price=Number(item.price)||0,balance=Number(current.balance)||0,short=balance<price;
  confirmationText.textContent=`将当前宠物更换为${item.name}，需要 ${price} 积分。当前有 ${balance} 积分。${short?'还差 '+(price-balance)+' 积分。':'确认后只保留这一只宠物。'}`;
  confirm.textContent=`确认更换 · ${price}积分`;confirm.disabled=blocked||short||item.sku===current.pets.active;
 }
 function renderChoices(){
  const products=(current.pets?.catalog||[]).filter(x=>x.sku!==current.pets.active),sig=JSON.stringify([products,current.pets?.active,blocked]);
  if(sig!==catalogSignature){catalogSignature=sig;choiceEvents?.abort();choiceEvents=new win.AbortController();choices.replaceChildren();
   for(const product of products){const b=el('button',null,choices,'pet-switch-choice');b.dataset.petChoice=product.sku;b.disabled=blocked;b.setAttribute('aria-pressed',String(selected===product.sku));
    const img=el('img',null,b);img.src=new URL(`./assets/pets/previews/${encodeURIComponent(product.sku)}.png`,import.meta.url).href;img.alt='';img.draggable=false;
    el('strong',product.name,b);el('span',`${product.price} 积分`,b);
    b.addEventListener('click',()=>{if(blocked)return;selected=product.sku;livePreview.show(product.sku);transactionId=requestId('pet-replace',product.sku);for(const n of choices.children)n.setAttribute('aria-pressed',String(n.dataset.petChoice===selected));updateConfirmation();confirmation.scrollIntoView({block:'nearest'});confirm.focus({preventScroll:true});},{signal:choiceEvents.signal});
   }
  }
  for(const button of choices.children){const pressed=String(button.dataset.petChoice===selected);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);}
  updateConfirmation();
 }
 rename.addEventListener('click',()=>{if(blocked)return;closePicker();renameBox.hidden=false;input.value=nickname();say('');input.focus();input.select();},listen);
 cancelName.addEventListener('click',()=>{renameBox.hidden=true;say('');rename.focus();},listen);
 function save(){if(blocked)return;const name=input.value.trim();if(!name||[...name].length>12||/[<>\u0000-\u001f]/.test(name)){say('请输入1到12个字的名字，不使用尖括号或控制字符。');input.focus();return;}
  void perform(()=>api.updateCompanion({petName:name}),result=>{if(!disposed&&result.ok){renameBox.hidden=true;heading.textContent='我的宠物 · '+nickname();say('名字已保存。');rename.focus({preventScroll:true});}});
 }
 saveName.addEventListener('click',save,listen);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();save();}if(event.key==='Escape'){event.preventDefault();cancelName.click();}},listen);
 replace.setAttribute('aria-expanded','false');replace.addEventListener('click',()=>{if(blocked)return;renameBox.hidden=true;picker.hidden=!picker.hidden;replace.setAttribute('aria-expanded',String(!picker.hidden));say('');if(!picker.hidden)renderChoices();else livePreview.hide();},listen);
 cancel.addEventListener('click',()=>{if(!blocked){closePicker();say('保留原来的宠物，没有扣积分。');}},listen);
 confirm.addEventListener('click',()=>{if(blocked||!selected||confirm.disabled)return;const sku=selected,id=transactionId;void perform(()=>api.purchasePet(sku,id),result=>{if(!disposed&&result.ok){closePicker();say('已更换，房间仍然只有这一只自己的宠物。');}});},listen);
 return {update(shop,{disabled=false}={}){if(disposed)return;current=shop||{};blocked=disabled;const name=nickname(),signature=JSON.stringify([name,blocked,current.balance,current.pets,typeof api.purchasePet,typeof api.updateCompanion]);if(signature===viewSignature)return;viewSignature=signature;
   const active=current.pets?.active;if(lastActive&&active!==lastActive){livePreview.hide();selected=transactionId=null;confirmation.hidden=true;}lastActive=active;
   heading.textContent='我的宠物 · '+name;root.hidden=typeof api.purchasePet!=='function';rename.hidden=typeof api.updateCompanion!=='function';rename.disabled=replace.disabled=saveName.disabled=cancelName.disabled=input.disabled=cancel.disabled=blocked;
   if(!picker.hidden)renderChoices();
  },close(){livePreview.hide();renameBox.hidden=picker.hidden=confirmation.hidden=true;selected=transactionId=null;replace.setAttribute('aria-expanded','false');say('');},dispose(){disposed=true;livePreview.dispose();events.abort();choiceEvents?.abort();root.remove();}};
}
