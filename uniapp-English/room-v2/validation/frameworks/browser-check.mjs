import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {startFrameworkPreview} from './serve.mjs';
const {chromium}=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');
const here=dirname(fileURLToPath(import.meta.url)),versions=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8')).dependencies;
const {server,url}=await startFrameworkPreview();let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],missing=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('favicon.ico'))missing.push({url:response.url().replace(new URL(url).origin,''),status:response.status()});});
 await page.goto(url);await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#summary').dataset.result,null,{timeout:120000});
 const result=await page.evaluate(()=>({mode:window.frameworkMode,summary:document.querySelector('#summary').textContent,result:document.querySelector('#summary').dataset.result,checks:[...document.querySelectorAll('#results li')].map(node=>({passed:node.className==='pass',name:node.textContent})),remainingScenes:document.querySelectorAll('.pet-room-view').length}));
 if(result.mode!==(process.env.PET_ROOM_STRICT_MODE==='1'?'strict':'production'))errors.push('Built React runtime does not match the requested validation mode');
 await mkdir(resolve(here,'host'),{recursive:true});await page.screenshot({path:resolve(here,`host/framework-validation-${result.mode}.png`),fullPage:true});
 const record=JSON.stringify({environment:'Chromium with software WebGL; Vite subdirectory build',versions,...result,errors,missing},null,2)+'\n';
 await writeFile(resolve(here,'results.json'),record);await writeFile(resolve(here,`results-${result.mode}.json`),record);
 console.log(JSON.stringify({mode:result.mode,summary:result.summary,failures:result.checks.filter(check=>!check.passed),errors,missing,remainingScenes:result.remainingScenes},null,2));
 if(result.result!=='pass'||errors.length||missing.length)process.exitCode=1;
}finally{await browser?.close();await new Promise(accept=>server.close(accept));}
