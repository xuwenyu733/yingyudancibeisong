import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const sources=['room.css','shop.css','profile-upgrade.css','themes.css','companion-ui.css','companion-fx.css','estate-ui.css','companion-tutorial.css','moving-ceremony.css','creative-ui.css','social.css','design-ui.css'];
writeFileSync(new URL('styles.css',root),'/* 自动合并；修改源样式后执行 node scripts/sync-styles.mjs。 */\n'+sources.map(name=>`/* ${name} */\n${readFileSync(new URL(name,root),'utf8')}`).join('\n'));
