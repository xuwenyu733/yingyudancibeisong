import React from 'react';
import {renderToString as renderReact} from 'react-dom/server';
import {createSSRApp} from 'vue';
import {renderToString as renderVue} from '@vue/server-renderer';
import {render as renderSvelte} from 'svelte/server';
import ReactPetRoom from '../../../frameworks/ReactPetRoom.jsx';
import VuePetRoom from '../../../frameworks/VuePetRoom.vue';
import SveltePetRoom from '../../../frameworks/SveltePetRoom.svelte';
export async function run(){
 const results=[['React',renderReact(React.createElement(ReactPetRoom,{storageAdapter:null}))],['Vue',await renderVue(createSSRApp(VuePetRoom,{storageAdapter:null}))],['Svelte',renderSvelte(SveltePetRoom,{props:{storageAdapter:null}}).body]];
 for(const [name,html]of results){if(!html.includes('宠物小屋')||html.includes('data-room-control="room"'))throw new Error(`${name} attempted a DOM/WebGL mount during SSR`);}
 return results.map(([name])=>name);
}
