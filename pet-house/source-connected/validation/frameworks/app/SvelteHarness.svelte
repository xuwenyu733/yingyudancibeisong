<script>
  import SveltePetRoom from '../../../frameworks/SveltePetRoom.svelte';
  let {storage,onReady,onError}=$props();
  let account=$state('svelte-account-a'),callbackVersion=$state(0),api=null;
  let callback=$derived(callbackVersion?value=>{api=value;onReady?.(value,'updated');}:value=>{api=value;onReady?.(value,'initial');});
  export function getApi(){return api;}
  export function setAccount(value){api=null;account=value;}
  export function updateCallback(){callbackVersion++;}
</script>
<SveltePetRoom storageKey={account} storageAdapter={storage} initialPoints={1000} quality="low" style="height:100%;min-height:0" onReady={callback} {onError}/>
