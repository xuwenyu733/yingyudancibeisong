<script setup>
import {ref} from 'vue';
// uni-app 编译时仅在 H5 引入依赖 DOM/WebGL 的组件。
// #ifdef H5
import VuePetRoom from './VuePetRoom.vue';
// #endif
const props=defineProps({
  storageKey:{type:String,required:true},initialPoints:{type:Number,default:0},
  storageAdapter:{type:Object,default:undefined},assetsBaseUrl:{default:undefined},assetUrls:{type:Object,default:undefined},
  quality:{type:String,default:'auto'},timeZone:{type:String,default:undefined},
  panels:{type:Boolean,default:true},controls:{type:Boolean,default:true},styles:{type:Boolean,default:true},bridge:{type:[Boolean,Object],default:false},
});
const emit=defineEmits(['ready','state','event','error']),room=ref(null);
defineExpose({getApi:()=>room.value?.getApi?.()??null,remount:()=>room.value?.remount?.()});
</script>
<template>
  <!-- #ifdef H5 -->
  <VuePetRoom ref="room" :storage-key="props.storageKey" :initial-points="props.initialPoints"
    :storage-adapter="props.storageAdapter" :assets-base-url="props.assetsBaseUrl" :asset-urls="props.assetUrls"
    :quality="props.quality" :time-zone="props.timeZone" :panels="props.panels" :controls="props.controls" :styles="props.styles" :bridge="props.bridge"
    @ready="emit('ready',$event)" @state="emit('state',$event)" @event="emit('event',$event)" @error="emit('error',$event)" />
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view>请使用 web-view 页面加载完整小屋，参见接入说明。</view>
  <!-- #endif -->
</template>
