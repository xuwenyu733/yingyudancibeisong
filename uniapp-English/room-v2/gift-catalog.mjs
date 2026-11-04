const names={star:'星星礼物',pumpkin:'节日南瓜灯',lantern:'心愿灯笼',flower:'七彩小花'};
const icons={star:'★',pumpkin:'🎃',lantern:'🏮',flower:'✿'};
export function giftSku(reward){return reward&&Object.hasOwn(names,reward.kind)&&typeof reward.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(reward.id)?`gift-${reward.kind}-${reward.id}`:null;}
export function giftProduct(sku){
  if(typeof sku!=='string')return null;const match=sku.match(/^gift-(star|pumpkin|lantern|flower)-([a-zA-Z0-9][a-zA-Z0-9:_-]{0,127})$/);if(!match)return null;
  const kind=match[1];return {sku,kind:'furniture',category:'gift',giftKind:kind,rewardId:match[2],name:names[kind],price:0,description:'伙伴带回来的独立收藏，可以自由摆放、收纳和装扮。',image:giftPreview(kind)};
}
export function giftPreview(kind){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="150" viewBox="0 0 180 150"><rect width="180" height="150" rx="24" fill="#fff4df"/><ellipse cx="90" cy="125" rx="45" ry="8" fill="#ccab7728"/><text x="90" y="107" text-anchor="middle" font-size="80" fill="#d8ad58">${icons[kind]||'★'}</text></svg>`);}
export function giftCatalog(rewards=[],now=Date.now()){
  return rewards.flatMap(reward=>{const sku=giftSku(reward),product=giftProduct(sku);return product?[{...product,name:reward.name||product.name,expiresAt:reward.expiresAt||null,expired:!!reward.expiresAt&&Date.parse(reward.expiresAt)<=now}]:[];});
}
