import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const program=ts.createProgram([path.join(here,'typecheck.ts')],{
  strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,allowSyntheticDefaultImports:true,typeRoots:[path.join(here,'node_modules/@types')],
  paths:{react:[path.join(here,'node_modules/@types/react/index.d.ts')],'react/*':[path.join(here,'node_modules/@types/react/*')],svelte:[path.join(here,'node_modules/svelte/types/index.d.ts')]},
});
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>here,getNewLine:()=> '\n'}));process.exitCode=1;}
else console.log('TypeScript strict: PASS');
