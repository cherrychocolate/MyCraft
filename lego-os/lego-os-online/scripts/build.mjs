import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);let esbuild;try{esbuild=require('esbuild')}catch{esbuild=require('../../glasses-workbench/node_modules/esbuild')}
await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});
await esbuild.build({entryPoints:['src/index.mjs'],bundle:true,format:'esm',target:'es2022',platform:'browser',outfile:'dist/server/index.js',minify:true});
try {
  await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Built frozen online release; local source is not re-snapshotted.');
