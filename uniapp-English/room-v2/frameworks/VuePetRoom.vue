<script setup>
import {onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {mountPetHouse} from '../pet-house.js';

const props=defineProps({
  storageKey:{type:String,default:'hamster-room-layout-v3'},
  storageAdapter:{type:Object,default:undefined},
  assetsBaseUrl:{type:[String,URL],default:undefined},assetUrls:{type:Object,default:undefined},
  initialPoints:{type:Number,default:0},quality:{type:String,default:'auto'},timeZone:{type:String,default:undefined},
  panels:{type:Boolean,default:true},controls:{type:Boolean,default:true},styles:{type:Boolean,default:true},
  bridge:{type:[Boolean,Object],default:false},
});
const emit=defineEmits(['ready','state','event','error']);
const host=ref(null),error=ref('');
let controller=null,generation=0;
function cleanup(){generation++;const previous=controller;controller=null;previous?.dispose();}
function remount(){
  cleanup();if(!host.value)return;
  const current=generation;let lastError=null;error.value='';
  const report=failure=>{
    if(current!==generation||failure===lastError)return;lastError=failure;
    error.value=failure?.message||String(failure);emit('error',failure);
  };
  try{
    controller=mountPetHouse({
      container:host.value,storageKey:props.storageKey,storageAdapter:props.storageAdapter,
      assetsBaseUrl:props.assetsBaseUrl,assetUrls:props.assetUrls,initialPoints:props.initialPoints,
      quality:props.quality,timeZone:props.timeZone,panels:props.panels,controls:props.controls,styles:props.styles,bridge:props.bridge,
      onError:report,
      onState:state=>{if(current===generation)emit('state',state);},
      onEvent:(type,detail)=>{if(current===generation)emit('event',{type,detail});},
    });
    controller.ready.then(api=>{if(current===generation)emit('ready',api);}).catch(report);
  }catch(failure){report(failure);controller?.dispose();controller=null;}
}
onMounted(remount);
onBeforeUnmount(cleanup);
watch(()=>[props.storageKey,props.storageAdapter,props.assetsBaseUrl,props.assetUrls,props.initialPoints,props.quality,props.timeZone,props.panels,props.controls,props.styles,props.bridge],remount,{flush:'post'});
defineExpose({getApi:()=>controller?.api??null,remount});
</script>

<template>
  <section class="pet-house-component" aria-label="宠物小屋">
    <div ref="host" class="pet-house-host"></div>
    <p v-if="error" class="pet-house-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.pet-house-component{position:relative;width:100%;height:min(76vh,720px);min-height:360px}
.pet-house-host{width:100%;height:100%}
.pet-house-error{position:absolute;left:16px;right:16px;bottom:10px;padding:12px;border-radius:12px;background:#fff4ee;color:#954a35}
</style>
