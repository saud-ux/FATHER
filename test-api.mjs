import {readFileSync} from 'node:fs';
import {imageStore} from './image-store.ts';
import assert from 'node:assert/strict';
import {referenceSeeds} from './questions.ts';
import {DatabaseSync} from 'node:sqlite';
import {gameGET,gamePOST,imageGET,imagePOST} from './service.ts';
// Exercise the real HTTP handlers and D1 image adapter against SQLite.
const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const DB={prepare(query){let args=[];return {bind(...values){args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
const env={DB,BUCKET:imageStore(DB)};
const origin='https://game.test';
const fetch=async(url,init)=>{const req=new Request(url,init);const image=new URL(url).pathname==='/api/image';return (image?(req.method==='POST'?imagePOST:imageGET):(req.method==='POST'?gamePOST:gameGET))(req,env)};
let count=0;function ok(value,label){assert.ok(value,label);count++;console.log('PASS '+label)}
let r=await fetch(origin+'/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'create'})});assert.equal(r.status,200);const{id,key}=await r.json();ok(id&&key,'create durable session with presenter capability');
const base=origin+'/api/game?s='+id;
const get=async(host=false)=>{const r=await fetch(base+(host?'&host=1':''),{headers:host?{'x-host-key':key}:{}});assert.equal(r.status,200);return r.json()};
let state=await get(true);ok(state.questions.length===47&&state.questions.filter(q=>q.review).length===2,'47 questions seeded, including two blocked for review');
const post=async(action,revision=state.revision,op=crypto.randomUUID())=>fetch(base,{method:'POST',headers:{'content-type':'application/json','x-host-key':key},body:JSON.stringify({...action,revision,op})});
async function act(action){const r=await post(action);assert.equal(r.status,200,await r.text());state=await get(true)}
r=await fetch(base+'&host=1');ok(r.status===403,'audience URL cannot retrieve question bank');
r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'cell',index:1,team:1,op:crypto.randomUUID(),revision:0})});ok(r.status===403,'audience cannot mutate board');
await act({type:'show',id:'reference-3'});let pub=await get();ok(!JSON.stringify(pub).includes(state.questions.find(q=>q.id==='reference-3').answer),'answer absent from network payload before reveal');ok(!pub.questions&&!pub.used&&!pub.state.question.note,'public payload contains neither bank nor notes');
const imgKey=state.questions.find(q=>q.id==='reference-3').image;const hiddenKey=state.questions.find(q=>q.id==='reference-1').image;
r=await fetch(origin+'/api/image?s='+id+'&key='+hiddenKey);ok(r.status===403,'undisplayed image is protected');
r=await fetch(origin+'/api/image?s='+id+'&key='+imgKey);ok(r.status===200&&(await r.arrayBuffer()).byteLength>1000,'displayed image served from persistent bucket');
await act({type:'reveal'});pub=await get();ok(pub.state.question.answer===state.questions.find(q=>q.id==='reference-3').answer,'answer only delivered after explicit reveal');
await act({type:'show',id:'reference-2'});pub=await get();ok(pub.state.question.answer===undefined,'switching question removes previously revealed answer');
const before=pub.state.cells;await act({type:'show',id:'reference-1'});pub=await get();ok(JSON.stringify(pub.state.cells)===JSON.stringify(before),'switching question leaves every board cell unchanged');
await act({type:'board'});const op=crypto.randomUUID();let rr=await post({type:'cell',index:10,team:1},state.revision,op);assert.equal(rr.status,200);rr=await post({type:'cell',index:10,team:1},state.revision,op);ok(rr.status===200&&(await rr.json()).duplicate,'replayed operation is acknowledged without duplicate mutation');state=await get(true);
const revision=state.revision;const races=await Promise.all([post({type:'cell',index:11,team:1},revision),post({type:'cell',index:12,team:2},revision)]);ok(races.filter(r=>r.status===200).length===1&&races.filter(r=>r.status===409).length===1,'two-device simultaneous writes: exactly one accepted, stale write rejected');state=await get(true);
for(const index of [11,12,13,14])await act({type:'cell',index,team:1,edit:true});ok(state.state.winner===1&&state.state.wins[0]===1,'winning move counts round exactly once');
await act({type:'cell',index:14,team:1});ok(state.state.wins[0]===1,'double assignment does not increment victory');await act({type:'undo'});ok(state.state.winner===0&&state.state.wins[0]===0,'undo winning move rescinds score');
const reconnect=await get();ok(reconnect.revision===state.revision&&JSON.stringify(reconnect.state)===JSON.stringify(state.state),'fresh client recovers exact stored state after reconnect');
const bytes=Buffer.from(referenceSeeds.find(q=>q.id==='reference-4').data,'base64');r=await fetch(origin+'/api/image?s='+id,{method:'POST',headers:{'x-host-key':key,'content-type':'image/jpeg'},body:bytes});assert.equal(r.status,200);const uploaded=await r.json();await act({type:'save',question:{id:'custom-upload',text:'اختبار صورة',answer:'سري للغاية',note:'خاص',image:uploaded.key}});await act({type:'show',id:'custom-upload'});r=await fetch(origin+'/api/image?s='+id+'&key='+uploaded.key);ok(Buffer.from(await r.arrayBuffer()).equals(bytes),'uploaded image survives save and fresh retrieval byte-for-byte');
await act({type:'round',swap:true});ok(state.used.includes('custom-upload')&&state.state.swapped&&state.state.round===2,'new round retains used questions and swaps axes');


await act({type:'clear'});await act({type:'reset'});state=await get(true);ok(state.questions.length===0,'reset after deliberate content removal does not re-import questions');
const {initialGame}=await import('./core.ts');
const {hash}=await import('./service.ts');
const legacyId=crypto.randomUUID(),legacyKey=crypto.randomUUID();const legacy=initialGame();legacy.cells[7]=1;legacy.wins=[2,1];legacy.round=4;legacy.names=['الأصدقاء','الرفاق'];legacy.used=['reference-3'];legacy.questions.push({id:'reference-1',text:'أين أُقيم هذا الاجتماع؟',answer:'حائل',note:'ملاحظة شخصية لا تُمسح',image:null},{id:'reference-2',text:'صياغة عدّلها المقدّم',answer:'علي العقلا',note:'خاص',image:null},{id:'reference-3',text:'من هو هذا الشخص؟ هل تعرفه؟',answer:'أسماعيل البرصان',note:'',image:null},{id:'reference-4',text:'ماذا تُسمّى الجبال خلف بدر الرشيد؟',answer:'غراميل الروله',note:'',image:null},{id:'own',text:'سؤالي الخاص',answer:'جوابي الخاص',note:'',image:null});
sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(legacyId,await hash(legacyKey),5,JSON.stringify(legacy));
const legacyUrl=origin+'/api/game?s='+legacyId+'&host=1';
const upgraded=await (await fetch(legacyUrl,{headers:{'x-host-key':legacyKey}})).json();
ok(upgraded.questions.length===48&&!upgraded.questions.some(q=>q.demo),'existing session receives uploaded bank exactly once without demos');
ok(upgraded.state.cells[7]===1&&upgraded.state.round===4&&upgraded.state.wins[0]===2&&upgraded.used.includes('reference-3'),'content upgrade preserves board, rounds, wins and used-question history');
ok(upgraded.questions.find(q=>q.id==='reference-2').text==='صياغة عدّلها المقدّم'&&upgraded.questions.some(q=>q.id==='own'),'content upgrade preserves presenter edits and custom questions');
ok(upgraded.questions.find(q=>q.id==='reference-1').note==='ملاحظة شخصية لا تُمسح','content upgrade preserves private presenter notes');
const again=await (await fetch(legacyUrl,{headers:{'x-host-key':legacyKey}})).json();ok(again.revision===upgraded.revision&&again.questions.length===48,'reload never duplicates imported questions or rewrites state');

const upgradedV2=structuredClone(legacy);
upgradedV2.contentVersion=2;upgradedV2.questions=upgradedV2.questions.filter(q=>!q.demo&&q.id!=='reference-1');
upgradedV2.display='reference-3';upgradedV2.reveal=true;upgradedV2.used=['reference-3'];
const v2id=crypto.randomUUID(),v2key=crypto.randomUUID();
sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(v2id,await hash(v2key),7,JSON.stringify(upgradedV2));
const v2base=origin+'/api/game?s='+v2id+'&host=1';
const upgradedV3=await (await fetch(v2base,{headers:{'x-host-key':v2key}})).json();
ok(upgradedV3.questions.filter(q=>q.id.startsWith('friends-extra-')).length===25,'existing v2 session receives all 25 approved questions');
ok(!upgradedV3.questions.some(q=>q.id==='reference-1'),'content update respects previously deleted original questions');
ok(upgradedV3.state.cells[7]===1&&upgradedV3.state.wins[0]===2&&upgradedV3.state.round===4&&upgradedV3.used.includes('reference-3'),'adding questions preserves board, wins, rounds and used history');
ok(upgradedV3.state.question.answer==='أسماعيل البرصان','content update preserves the currently revealed original answer');
const v3again=await (await fetch(v2base,{headers:{'x-host-key':v2key}})).json();
ok(v3again.revision===upgradedV3.revision&&v3again.questions.length===upgradedV3.questions.length,'reconnecting never duplicates the 25 added questions');


const priorV3=structuredClone(upgradedV2);
priorV3.contentVersion=3;
priorV3.questions.push({id:'friends-extra-02',text:'سؤال عدّله المقدّم',answer:'جواب خاص',note:'ملاحظة محفوظة',image:null});
priorV3.used.push('friends-extra-01');
const v3id=crypto.randomUUID(),v3key=crypto.randomUUID();
sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(v3id,await hash(v3key),10,JSON.stringify(priorV3));
const v4url=origin+'/api/game?s='+v3id+'&host=1';
const v4=await (await fetch(v4url,{headers:{'x-host-key':v3key}})).json();
ok(v4.questions.filter(q=>q.id.startsWith('friends-more-')).length===3,'v3 sessions receive exactly the three selected questions');
ok(!v4.questions.some(q=>q.id==='friends-extra-01')&&v4.questions.find(q=>q.id==='friends-extra-02').text==='سؤال عدّله المقدّم','new selection preserves earlier deletions and presenter edits');
ok(v4.used.includes('friends-extra-01')&&v4.state.cells[7]===1&&v4.state.question.answer==='أسماعيل البرصان','three additions preserve used history, board and visible answer');
const v4again=await (await fetch(v4url,{headers:{'x-host-key':v3key}})).json();
ok(v4again.revision===v4.revision&&v4again.questions.length===v4.questions.length,'reloading does not add selected questions twice');

console.log(`All ${count} API integration checks passed.`);
