import {createEstateStore} from '../../estate-state.mjs';
import {SHOP_CATALOG} from '../../economy.mjs';
/** Build historical multi-floor input for migration tests; new game operations
 * deliberately cannot create these old three/four-floor saves. */
export function appendLegacyFloor(store,input={}){
 const archive=store.exportArchive().archive,n=archive.estate.rooms.length+1,cost=[0,0,0,600,1200][n]||0;
 const template=input.template||'cream',room=createEstateStore({storageAdapter:null}).exportArchive().archive.estate.rooms[0];
 room.id='room-'+n;room.name=input.name||n+'楼';room.floor=n-1;room.template=template;room.scene.appearance.wallColor={cream:'cream',mint:'mint',candy:'rose'}[template];room.companion.theme={cream:'light',mint:'eye-care',candy:'candy'}[template];
 room.scene.stored=archive.estate.bank.owned.filter(sku=>SHOP_CATALOG.find(item=>item.sku===sku)?.category!=='flooring');
 archive.estate.bank.balance-=cost;archive.estate.bank.totalSpent+=cost;archive.estate.rooms.push(room);
 if(input.requestId)archive.estate.bank.claims.requests.push({id:input.requestId,operation:'create-room',level:n-1});
 const imported=store.importArchive(archive);return {...imported,room};
}
