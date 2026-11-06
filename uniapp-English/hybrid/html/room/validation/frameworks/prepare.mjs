import {mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
const target=new URL('./app/public/resources/optimized/',import.meta.url);mkdirSync(target,{recursive:true});
for(const name of ['sofa','table','lamp'])copyFileSync(new URL(`../../assets/optimized/${name}.glb`,import.meta.url),new URL(`${name}.glb`,target));
// Simulate uni-app's documented H5 conditional compilation, then compile the
// resulting component with Vue. This is an H5 adapter check, not native testing.
const source=readFileSync(new URL('../../frameworks/UniPetRoom.vue',import.meta.url),'utf8');
const h5=source.replace(/<!--\s*#ifndef H5\s*-->[\s\S]*?<!--\s*#endif\s*-->/g,'').replace(/\/\/\s*#ifndef H5[^\n]*\n[\s\S]*?\/\/\s*#endif[^\n]*/g,'').replace(/^\s*\/\/\s*#(?:ifdef H5|endif)\s*$/gm,'').replace(/<!--\s*#(?:ifdef H5|endif)\s*-->/g,'').replace("from './VuePetRoom.vue'","from '../../../frameworks/VuePetRoom.vue'");
writeFileSync(new URL('./app/UniH5.generated.vue',import.meta.url),h5);
