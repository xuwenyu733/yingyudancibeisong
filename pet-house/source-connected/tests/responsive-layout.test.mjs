import test from 'node:test';
import assert from 'node:assert/strict';
import {measureRoomViewport,visibleRoomViewport} from '../responsive-layout.mjs';

test('phone, iPad, split view and desktop adapt to available area',()=>{
 for(const [width,height,touch,layout] of [[320,568,true,'phone'],[390,844,true,'phone'],[844,390,true,'compact'],[768,1024,true,'tablet'],[1366,1024,true,'tablet'],[507,1024,true,'phone'],[1440,900,false,'desktop'],[2560,1440,false,'desktop']]){
  const state=measureRoomViewport(width,height,{touch});assert.equal(state.layout,layout);assert(state.scale>=.85&&state.scale<=1.25);
 }
 assert.equal(measureRoomViewport(2560,1440).scale,1.2);
});
test('viewport uses layout width, avoids overflow feedback and responds to keyboard',()=>{
 const win={innerWidth:390,innerHeight:844,document:{documentElement:{clientWidth:320,clientHeight:844}},visualViewport:{width:320,height:480,scale:1}};
 assert.deepEqual(visibleRoomViewport(win),{width:320,height:480});
 win.visualViewport.height=844;assert.equal(visibleRoomViewport(win).height,844);
 win.visualViewport={width:160,height:422,scale:2};assert.deepEqual(visibleRoomViewport(win),{width:320,height:844});
});
