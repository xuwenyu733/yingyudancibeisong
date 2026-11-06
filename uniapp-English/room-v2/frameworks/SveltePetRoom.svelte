<script>
  import {untrack} from 'svelte';
  import {mountPetHouse} from '../pet-house.js';

  let {
    storageKey='hamster-room-layout-v3',storageAdapter,assetsBaseUrl,assetUrls,initialPoints=0,
    quality='auto',timeZone,panels=true,controls=true,styles=true,bridge=false,
    onReady,onState,onEvent,onError,class:className='',style='',
  }=$props();
  let host=$state(null),error=$state(''),revision=$state(0),controller=null;
  export function getApi(){return controller?.api??null;}
  export function remount(){revision++;}
  function invoke(callback){try{untrack(callback);}catch(failure){console.error('Pet room host callback failed',failure);}}

  $effect(()=>{
    const configuration={storageKey,storageAdapter,assetsBaseUrl,assetUrls,initialPoints,quality,timeZone,panels,controls,styles,bridge};
    const target=host;revision;if(!target)return;
    let active=true,lastError=null,owned=null;error='';
    const report=failure=>{
      if(!active||failure===lastError)return;lastError=failure;error=failure?.message||String(failure);
      invoke(()=>onError?.(failure));
    };
    try{
      owned=mountPetHouse({...configuration,container:target,onError:report,
        onState:value=>{if(active)invoke(()=>onState?.(value));},
        onEvent:(type,detail)=>{if(active)invoke(()=>onEvent?.(type,detail));},
      });controller=owned;
      owned.ready.then(api=>{if(active)invoke(()=>onReady?.(api));}).catch(report);
    }catch(failure){report(failure);owned?.dispose();}
    return()=>{active=false;owned?.dispose();if(controller===owned)controller=null;};
  });
</script>

<section class={`pet-house-component ${className}`} aria-label="宠物小屋" {style}>
  <div class="pet-house-host" bind:this={host}></div>
  {#if error}<p class="pet-house-error" role="alert">{error}</p>{/if}
</section>

<style>
  .pet-house-component{position:relative;width:100%;height:min(76vh,720px);min-height:360px}
  .pet-house-host{width:100%;height:100%}
  .pet-house-error{position:absolute;left:16px;right:16px;bottom:10px;padding:12px;border-radius:12px;background:#fff4ee;color:#954a35}
</style>
