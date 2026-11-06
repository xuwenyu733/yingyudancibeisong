/** Touch-only hold detector; movement and a second pointer always cancel the gesture. */
export function createTouchHold({onHold,delay=550,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let pending=null;
  function cancel(){if(pending){clearTimer(pending.timer);pending=null;}}
  return {
    begin(event){
      cancel();if(!event||!['touch','pen'].includes(event.pointerType)||event.isPrimary===false)return false;
      const item={id:event.pointerId,x:event.clientX,y:event.clientY,timer:null};pending=item;
      item.timer=setTimer(()=>{if(pending!==item)return;pending=null;onHold?.(item.id);},delay);return true;
    },
    move(event){if(pending&&(event.pointerId!==pending.id||Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>5))cancel();},
    end:cancel,cancel,
  };
}
