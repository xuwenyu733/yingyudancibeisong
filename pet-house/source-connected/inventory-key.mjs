/** The legacy SKU is instance 1; additional pieces get a stable inventory ID. */
export const MAX_ITEM_COPIES=20;
export function itemBaseSku(value){if(typeof value!=='string')return value;const match=/^(.+)--copy-([2-9]|1[0-9]|20)$/.exec(value);return match?match[1]:value;}
export function itemCopyNumber(value){return itemBaseSku(value)===value?1:Number(value.slice(value.lastIndexOf('-')+1));}
export function nextItemKey(sku,owned){for(let i=1;i<=MAX_ITEM_COPIES;i++){const id=i===1?sku:sku+'--copy-'+i;if(!owned.includes(id))return id;}return null;}
