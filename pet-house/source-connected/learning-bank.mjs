/** Compatibility IDs for importing trial-version saves. No learning playground is mounted. */
const legacyIds=[
  ...Array.from({length:6},(_,i)=>`count-${i+1}`),
  ...['circle','square','triangle','star'].map(id=>`shape-${id}`),
  ...[2,3].flatMap(level=>Array.from({length:8},(_,i)=>`math-${level}-${i+1}`)),
];
export const QUESTION_BANK=Object.freeze(legacyIds.map(id=>Object.freeze({id})));
const index=new Map(QUESTION_BANK.map(q=>[q.id,q]));
export function questionById(id){return index.get(id)||null;}
export function defaultLearningProgress(){return {level:1,streak:0,answers:0,correct:0,questions:{},attemptIds:[]};}
