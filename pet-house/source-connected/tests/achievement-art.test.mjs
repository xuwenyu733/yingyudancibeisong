import test from 'node:test';
import assert from 'node:assert/strict';
import {BADGES} from '../profile.mjs';
import {createAchievementEmblem,achievementTitle,ACHIEVEMENT_DESIGNS} from '../achievement-art.mjs';

function fixture(){
  const doc={createElementNS(ns,tag){return {tagName:tag,namespaceURI:ns,ownerDocument:doc,attributes:{},dataset:{},children:[],setAttribute(name,value){this.attributes[name]=String(value);},append(child){this.children.push(child);}};}};
  return doc.createElementNS('http://www.w3.org/2000/svg','div');
}
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
const geometry=art=>JSON.stringify(descendants(art).filter(node=>['path','polygon','circle','ellipse','rect'].includes(node.tagName)).map(node=>[node.tagName,...['d','points','cx','cy','r','rx','ry','x','y','width','height','transform'].map(key=>node.attributes[key]||'')]));

test('all 19 achievements own different object silhouettes with real gender variants',()=>{
  assert.equal(BADGES.length,19);assert.deepEqual(Object.keys(ACHIEVEMENT_DESIGNS),BADGES.map(badge=>badge.id));
  const designs=[],titles=[];
  for(const badge of BADGES){
    const pair=[];
    for(const gender of ['male','female']){
      const parent=fixture(),art=createAchievementEmblem(parent,badge,gender),nodes=descendants(art);
      assert.equal(parent.children[0],art);assert.equal(art.attributes.viewBox,'0 0 120 132');
      assert.equal(art.dataset.kind,'achievement');assert.equal(art.dataset.achievementId,badge.id);assert.equal(art.dataset.gender,gender);
      assert.equal(art.dataset.tier,undefined,'achievements do not inherit the current level rank');assert.equal(art.dataset.stage,undefined);
      assert.ok(nodes.length>20,`${badge.id}/${gender} has material and silhouette detail`);
      assert.equal(nodes.some(node=>['animate','animateTransform','animateMotion','filter','script','text'].includes(node.tagName)),false);
      assert.ok(nodes.find(node=>node.tagName==='title').textContent.includes(badge.description));
      pair.push(geometry(art));designs.push(geometry(art));titles.push(achievementTitle(badge,gender));
      const ids=nodes.filter(node=>node.attributes.id).map(node=>node.attributes.id);
      for(const node of nodes)for(const attr of ['fill','stroke'])if(node.attributes[attr]?.startsWith('url(#'))assert.ok(ids.includes(node.attributes[attr].slice(5,-1)));
    }
    assert.notEqual(pair[0],pair[1],`${badge.id} changes its geometry, not just its palette`);
    const neutral=createAchievementEmblem(fixture(),badge,'none');assert.equal(neutral.dataset.gender,'none');assert.equal(achievementTitle(badge,'none'),badge.name);
  }
  assert.equal(new Set(designs).size,38,'every male/female collectible has a unique silhouette');
  assert.equal(new Set(titles).size,38,'every collectible has its own display name');
});

test('multiple module copies keep all material references local to their SVG',async()=>{
  const a=await import('../achievement-art.mjs?independent=a'),b=await import('../achievement-art.mjs?independent=b');
  const arts=[a.createAchievementEmblem(fixture(),BADGES[0],'male'),b.createAchievementEmblem(fixture(),BADGES[0],'female')];
  const all=arts.flatMap(art=>descendants(art).filter(node=>node.attributes.id).map(node=>node.attributes.id));assert.equal(all.length,new Set(all).size);
  assert.equal(achievementTitle({id:'future',name:'未来成就'},'female'),'未来成就');
  assert.equal(createAchievementEmblem(fixture(),{id:'future',name:'未来成就'},'unexpected').dataset.gender,'none');
});
