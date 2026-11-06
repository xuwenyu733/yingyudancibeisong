import {mountPetHouse} from '../../../pet-house.js';
const data=new Map();
const room=mountPetHouse({container:document.getElementById('app'),storageKey:'iframe-test',initialPoints:1000,quality:'low',
  storageAdapter:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},
  bridge:{roomId:'iframe-test',allowedOrigins:[location.origin],allowedSources:[parent],onEvent:envelope=>parent.postMessage(envelope,location.origin)}});
room.ready.catch(error=>parent.postMessage({testError:error.message},location.origin));
addEventListener('pagehide',()=>room.dispose());
