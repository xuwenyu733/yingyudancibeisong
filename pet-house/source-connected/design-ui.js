export function createDesignPanel({doc=document,api}){
 const node=(tag,text,cls)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const overlay=node('div',undefined,'design-overlay');overlay.hidden=true;
 const box=node('section',undefined,'design-box');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','装修码分享与复制');overlay.append(box);
 const title=node('h2','装修码'),close=node('button','关闭');close.type='button';close.setAttribute('aria-label','关闭装修码');
 const header=node('header');header.append(title,close);box.append(header);
 const tabs=node('nav'),shareTab=node('button','分享我的装修'),importTab=node('button','输入装修码');tabs.append(shareTab,importTab);box.append(tabs);
 const share=node('div'),code=node('output','尚未生成','design-code'),publish=node('button','生成 / 更新当前楼层装修码'),copy=node('button','复制装修码');copy.disabled=true;
 share.append(node('p','只分享当前楼层的摆设、墙面和地板。每层楼有自己的装修码，更新时号码不变。个人成就专属纹样不随装修分享。'),code,publish,copy);box.append(share);
 const imp=node('div'),label=node('label','输入主人的4位装修码（可以0开头）'),input=node('input');input.type='text';input.inputMode='numeric';input.maxLength=4;input.autocomplete='off';input.setAttribute('aria-label','4位装修码');label.append(input);
 const search=node('button','查看装修'),preview=node('div',undefined,'design-preview'),apply=node('button','备份并复制摆设');apply.hidden=true;
 imp.append(label,search,preview,apply);box.append(imp);
 const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(status);doc.body.append(overlay);
 let active=false,busy=false,generation=0,selected=null,requestId=null,previousFocus=null,disposed=false;
 function setBusy(value){busy=value;for(const button of [shareTab,importTab,publish,search,close])button.disabled=value;input.disabled=value;apply.disabled=value||!selected?.quote?.canApply;copy.disabled=value||!/^\d{4}$/.test(code.textContent);box.setAttribute('aria-busy',String(value));}
 function message(error){status.textContent=error?.message||'连接暂时不可用，请稍后重试';}
 async function publishing(){if(busy)return;const serial=generation;setBusy(true);status.textContent='正在同步小屋并生成装修码…';try{const result=await api.publishDesign();if(serial!==generation||disposed)return;if(!result.ok)throw result;code.textContent=result.code;status.textContent=`「${result.name}」已发布，版本 ${result.revision}。把这4位数字告诉朋友即可。`;}catch(error){if(serial===generation)message(error);}finally{if(serial===generation)setBusy(false);}}
 function resetPreview(){selected=null;requestId=null;preview.replaceChildren();apply.hidden=true;}
 function mode(value){share.hidden=value!=='share';imp.hidden=value==='share';shareTab.setAttribute('aria-pressed',String(value==='share'));importTab.setAttribute('aria-pressed',String(value!=='share'));}
 async function lookup(){if(busy)return;resetPreview();const value=input.value;if(!/^\d{4}$/.test(value)){status.textContent='请输入完整的4位数字，例如 0007';return;}const serial=generation;setBusy(true);status.textContent='正在查询装修并核对物品…';try{const result=await api.findDesign(value);if(serial!==generation||disposed)return;if(!result.ok)throw result;const quote=await api.previewDesign(result);if(!quote.ok)throw quote;
   selected={...result,quote};requestId='design-'+(doc.defaultView.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
   preview.append(node('h3',`${result.authorName} · ${result.name}`),node('p',`装修码 ${result.code} · 版本 ${result.revision}`));
   if(quote.missing.length||quote.upgrades.length){preview.append(node('p','需要补齐：'));const list=node('ul');for(const item of [...quote.missing,...quote.upgrades])list.append(node('li',`${item.name}：${item.price} 积分`));preview.append(list);}else preview.append(node('p','所需物品均已拥有，无需购买。'));
   for(const item of quote.unavailable)preview.append(node('p',`${item.name}：${item.reason}`));
   preview.append(node('p',`合计 ${quote.total} 积分 · 当前余额 ${quote.balance} 积分`),node('p','复制摆设不包含个人成就专属纹样。复制前会自动备份当前楼层装修。每层最多保留5个备份，空间满时需要先整理。取消不会扣积分。'));
   apply.textContent=quote.needsPurchase?`一键购买缺失物品并复制（${quote.total} 积分）`:'备份并复制摆设';apply.hidden=false;
   status.textContent=quote.unavailable.length?'存在尚未解锁的限定物品或成就，暂时无法复制。':!quote.canApply?'积分不足，完成学习获得积分后再来。':'请核对后确认复制。';
  }catch(error){if(serial===generation)message(error);}finally{if(serial===generation)setBusy(false);}}
 async function applying(){if(busy||!selected?.quote?.canApply)return;const serial=generation;setBusy(true);status.textContent='正在备份原装修并复制…';try{const result=await api.applyDesign(selected,{buyMissing:selected.quote.needsPurchase,requestId});if(serial!==generation||disposed)return;if(!result.ok){if(result.code==='DESIGN_CHANGED')resetPreview();throw result;}apply.hidden=true;selected=null;requestId=null;status.textContent=result.message||'装修已复制，原装修已备份。';}catch(error){if(serial===generation)message(error);}finally{if(serial===generation)setBusy(false);}}
 function closing(){if(busy)return;active=false;++generation;overlay.hidden=true;previousFocus?.focus?.();}
 close.onclick=closing;shareTab.onclick=()=>mode('share');importTab.onclick=()=>{mode('import');input.focus();};publish.onclick=publishing;search.onclick=lookup;apply.onclick=applying;
 input.oninput=()=>{input.value=input.value.replace(/\D/g,'').slice(0,4);resetPreview();status.textContent='';};input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void lookup();}};
 copy.onclick=async()=>{try{await doc.defaultView.navigator.clipboard.writeText(code.textContent);status.textContent='装修码已复制';}catch{status.textContent='请手动复制这4位数字：'+code.textContent;}};
 const keydown=event=>{if(!active)return;if(event.key==='Escape'){event.preventDefault();closing();}if(event.key==='Tab'){const all=[...box.querySelectorAll('button,input')].filter(el=>!el.disabled&&!el.hidden&&!el.closest('[hidden]'));if(!all.length)return;const first=all[0],last=all.at(-1);if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}};doc.addEventListener('keydown',keydown);
 return {open(value='share',{autoPublish=false}={}){if(disposed||busy)return;++generation;previousFocus=doc.activeElement;active=true;overlay.hidden=false;mode(value);code.textContent='尚未生成';status.textContent='';resetPreview();setBusy(false);(value==='share'?publish:input).focus();if(value==='share'&&autoPublish)void publishing();},close:closing,dispose(){disposed=true;++generation;doc.removeEventListener('keydown',keydown);overlay.remove();}};
}
