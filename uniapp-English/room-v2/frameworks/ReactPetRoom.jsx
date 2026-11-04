import React, {useEffect, useRef, useState} from 'react';
import {mountPetHouse} from '../pet-house.js';

/** Full room UI. Callback changes do not remount the scene. Keep adapter/URL maps stable. */
export default function ReactPetRoom({
  storageKey='hamster-room-layout-v3',storageAdapter,assetsBaseUrl,assetUrls,initialPoints=0,
  quality='auto',timeZone,panels=true,controls=true,styles=true,bridge=false,
  onReady,onState,onEvent,onError,className,style,
}) {
  const host=useRef(null),callbacks=useRef({onReady,onState,onEvent,onError});
  const [error,setError]=useState('');
  useEffect(()=>{callbacks.current={onReady,onState,onEvent,onError};},[onReady,onState,onEvent,onError]);
  useEffect(()=>{
    let active=true,controller=null,lastError=null;
    const report=failure=>{
      if(!active||failure===lastError)return;lastError=failure;
      setError(failure?.message||String(failure));
      try{callbacks.current.onError?.(failure);}catch(callbackError){console.error('Pet room onError callback failed',callbackError);}
    };
    setError('');
    try{
      controller=mountPetHouse({
        container:host.current,storageKey,storageAdapter,assetsBaseUrl,assetUrls,initialPoints,
        quality,timeZone,panels,controls,styles,bridge,onError:report,
        onState:state=>{if(active)callbacks.current.onState?.(state);},
        onEvent:(type,detail)=>{if(active)callbacks.current.onEvent?.(type,detail);},
      });
      // StrictMode deliberately runs setup → cleanup → setup. The first instance's
      // late ready/rejection must never publish an API after cleanup.
      controller.ready.then(api=>{
        if(!active)return;
        try{callbacks.current.onReady?.(api);}catch(callbackError){console.error('Pet room onReady callback failed',callbackError);}
      }).catch(report);
    }catch(failure){report(failure);controller?.dispose();}
    return ()=>{active=false;controller?.dispose();controller=null;};
  },[storageKey,storageAdapter,assetsBaseUrl,assetUrls,initialPoints,quality,timeZone,panels,controls,styles,bridge]);
  return <section className={className} aria-label="宠物小屋" style={{position:'relative',width:'100%',height:'min(76vh,720px)',minHeight:360,...style}}>
    <div ref={host} style={{width:'100%',height:'100%'}} />
    {error&&<p role="alert" style={{position:'absolute',left:16,right:16,bottom:10,padding:12,borderRadius:12,background:'#fff4ee',color:'#954a35'}}>{error}</p>}
  </section>;
}
