const point=e=>({x:e.clientX,y:e.clientY});
const valid=e=>e?.pointerType==='touch'&&Number.isFinite(e.pointerId)&&Number.isFinite(e.clientX)&&Number.isFinite(e.clientY);
const pair=points=>{const [a,b]=[...points.values()];return {distance:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};};
const turn=value=>Math.atan2(Math.sin(value),Math.cos(value));

/** One two-finger transaction. A third finger cancels; remaining fingers must lift before retrying. */
export function createTransformGesture({onStart=()=>true,onUpdate=()=>{},onEnd=()=>{},onCancel=()=>{}}={}){
  const points=new Map();let active=false,blocked=false,distance=0,angle=0,totalAngle=0;
  function stop(canceled){if(!active)return;active=false;if(canceled)onCancel();else onEnd();}
  return {
    get active(){return active;},get blocked(){return blocked;},get pointerIds(){return [...points.keys()];},owns:id=>points.has(id),
    down(e){
      if(!valid(e))return false;points.set(e.pointerId,point(e));
      if(blocked)return true;
      if(points.size>2){blocked=true;stop(true);return true;}
      if(points.size!==2)return false;
      const next=pair(points);if(next.distance<12||onStart()===false){blocked=true;return true;}
      active=true;distance=next.distance;angle=next.angle;totalAngle=0;return true;
    },
    move(e){
      if(!points.has(e?.pointerId))return false;
      if(!valid(e)){blocked=true;stop(true);return true;}
      points.set(e.pointerId,point(e));if(blocked)return true;if(!active)return false;
      const next=pair(points);if(next.distance<2)return true;
      totalAngle+=turn(next.angle-angle);angle=next.angle;
      onUpdate({rotation:totalAngle,ratio:next.distance/distance});return true;
    },
    up(e,canceled=false){
      if(!points.has(e?.pointerId))return false;const handled=active||blocked;
      points.delete(e.pointerId);if(active){blocked=true;stop(canceled);}
      if(!points.size)blocked=false;return handled;
    },
    cancel(){stop(true);points.clear();blocked=false;},
  };
}

/** Preserve original proportions and respect the layout manager's public scale bounds. */
export function gestureTransform(initial,{rotation,ratio},{rotate=true,minScale=.0001,maxScale=100,baseScale=null}={}){
  if(!initial||!Array.isArray(initial.scale)||initial.scale.length!==3||initial.scale.some(n=>!Number.isFinite(n)||n<=0)||!Array.isArray(initial.rotation)||initial.rotation.length!==3||initial.rotation.some(n=>!Number.isFinite(n))||!Number.isFinite(rotation)||!Number.isFinite(ratio)||ratio<=0)return null;
  if(baseScale!==null&&(!Array.isArray(baseScale)||baseScale.length!==3||baseScale.some(n=>!Number.isFinite(n)||n<=0)))return null;
  let low=Math.max(.5,...initial.scale.map(n=>minScale/n)),high=Math.min(2,...initial.scale.map(n=>maxScale/n));
  // A fixed design baseline prevents repeated pinch gestures from shrinking or growing forever.
  // Legacy/API sizes outside the child-facing band can return gradually without jumping on touch.
  if(baseScale){low=Math.max(low,...initial.scale.map((n,i)=>Math.min(baseScale[i]*.5,n)/n));high=Math.min(high,...initial.scale.map((n,i)=>Math.max(baseScale[i]*2,n)/n));}
  if(low>high)return null;const factor=Math.max(low,Math.min(high,ratio));
  return {rotation:[initial.rotation[0],initial.rotation[1]+(rotate?rotation:0),initial.rotation[2]],scale:initial.scale.map(n=>Math.max(minScale,Math.min(maxScale,n*factor)))};
}
