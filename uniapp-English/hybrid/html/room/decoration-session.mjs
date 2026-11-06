/** 无UI装修会话。每次等待都有独立取消通道，取消后宿主Promise会明确完成。 */
export function createDecorationSession({manager,prepare,onEvent=()=>{},persistLayout=true}) {
  let active=false,pending=false,generation=0,session=null,disposed=false,cancelPending=null;
  function cancel(){generation++;pending=false;cancelPending?.(false);cancelPending=null;}
  return {
    get active(){return active;},get pending(){return pending;},get dragging(){return false;},get selected(){return null;},
    async enter(){
      if(disposed||active||pending)return false;
      const token=++generation;pending=true;onEvent('decoration-pending');
      const canceled=new Promise(resolve=>{cancelPending=resolve;});
      let ready;try{ready=await Promise.race([prepare(),canceled]);}catch{ready=false;}
      if(disposed||token!==generation)return false;cancelPending=null;pending=false;
      if(!ready)return false;session=manager.snapshot();if(manager.beginEdit&&manager.beginEdit()===false)return false;
      active=true;onEvent('decoration-mode',{active:true});return true;
    },
    exit(save=true){
      if(disposed)return false;
      if(pending){cancel();return true;}
      if(!active)return false;
      if(manager.finishEdit){if(!manager.finishEdit({save,persist:persistLayout}))return false;}
      else if(save){if(!manager.validate().valid||(persistLayout&&!manager.persist()))return false;}
      else manager.restore(session);
      active=false;session=null;onEvent('decoration-mode',{active:false,saved:save});return true;
    },
    refresh(){},dispose(){cancel();if(active&&manager.finishEdit)manager.finishEdit({save:false,persist:false});disposed=true;active=false;session=null;},
  };
}
