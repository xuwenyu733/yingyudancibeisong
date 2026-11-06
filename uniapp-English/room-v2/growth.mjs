/** Growth is derived from saved activity, never from the current date or a visual scale. */
export function growthFor(companion={}){
  const days=Array.isArray(companion.visitDates)?new Set(companion.visitDates).size:Math.max(0,Math.floor(companion.growth?.days||0));
  const learningSeconds=Number.isSafeInteger(companion.learningSeconds)&&companion.learningSeconds>=0?companion.learningSeconds:0;
  const id=days>=30&&learningSeconds>=7200?'adult':days>=7?'young':'baby';
  const stage={baby:'幼年伙伴',young:'少年伙伴',adult:'成年伙伴'}[id];
  const next=id==='adult'?null:id==='baby'?{stage:'少年伙伴',daysRequired:7,learningSecondsRequired:0}:{stage:'成年伙伴',daysRequired:30,learningSecondsRequired:7200};
  const tasks=next?[{id:'visits',label:'一起回家的活跃天数',current:days,target:next.daysRequired,done:days>=next.daysRequired},...(next.learningSecondsRequired?[{id:'learning',label:'一起学习的分钟数',current:Math.floor(learningSeconds/60),target:Math.floor(next.learningSecondsRequired/60),done:learningSeconds>=next.learningSecondsRequired}]:[])]:[];
  const progress=tasks.length?Math.min(...tasks.map(task=>Math.min(1,task.current/task.target))):1;
  return {id,stage,days,learningSeconds,next,tasks,progress};
}
