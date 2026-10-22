import {createRequire} from 'node:module';
import {mkdir,copyFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
await mkdir('dist',{recursive:true});
await build({entryPoints:['app.tsx'],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',outfile:'dist/app.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'none'});
await copyFile('styles.css','dist/styles.css');
await copyFile('index.html','dist/index.html');
console.log('Ready: dist contains only the public page, JS and CSS.');
