/** Real activity provides a short alternative to the original story unlocks. */
export function blueprintProgress(blueprint,state){
 const chapter=blueprint.chapter||0,legacy=(state.story?.completed?.length||0)>=chapter;
 if(!chapter||legacy||state.crafted?.includes(blueprint.id))return {unlocked:true,label:legacy&&chapter?'故事进度已解锁':'可以开始制作',current:1,need:1};
 const stat=chapter===1?'crafted':'cooked',current=Math.min(1,state.stats?.[stat]||0);
 return {unlocked:current>=1,current,need:1,label:chapter===1?'亲手制作任意1件家具':'亲手做好任意1份料理',tab:chapter===1?'craft':'kitchen',filter:chapter===1?'forest':undefined};
}
export const blueprintTheme=id=>['clover-planter','reading-shelf','cloud-table'].includes(id)?'forest':['star-lamp','moon-ornament','rocket-toy'].includes(id)?'space':'sweet';
export const BLUEPRINT_THEMES=[{id:'forest',name:'森林阅读',icon:'♧'},{id:'space',name:'星空探索',icon:'✦'},{id:'sweet',name:'甜甜童话',icon:'✿'}];
