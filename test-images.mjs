import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {imageStore} from './image-store.ts';
const dir=mkdtempSync(join(tmpdir(),'majlis-images-'));let sql;
function open(){sql=new DatabaseSync(join(dir,'test.sqlite'));sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));const db={prepare(query){let args=[];return {bind(...values){args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}}},async batch(statements){sql.exec('BEGIN');try {for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};return imageStore(db)}
try{
 let store=open();const original=new Uint8Array(8*1024*1024);for(let i=0;i<original.length;i++)original[i]=i%251;
 await store.put('session/image',original,{httpMetadata:{contentType:'image/png'}});
 assert.ok(await store.head('session/image'));assert.equal(await store.get('missing'),null);
 assert.equal(sql.prepare('SELECT count(*) n FROM image_chunks').get().n,32);
 assert.deepEqual((await store.get('session/image')).body,original);
 sql.close();store=open();assert.deepEqual((await store.get('session/image')).body,original);assert.equal((await store.get('session/image')).httpMetadata.contentType,'image/png');
 await store.put('session/image',new Uint8Array([255,216,255]),{httpMetadata:{contentType:'image/jpeg'}});
 assert.equal(sql.prepare('SELECT count(*) n FROM image_chunks').get().n,1);assert.deepEqual((await store.get('session/image')).body,new Uint8Array([255,216,255]));
 console.log('PASS D1 images: 8 MB chunking, byte equality, reopening database, metadata, replacement, missing image');
}finally{sql?.close();rmSync(dir,{recursive:true,force:true})}
