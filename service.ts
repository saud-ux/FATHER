function decodeImage(data:string):Uint8Array {
 const native=(Uint8Array as any).fromBase64;
 if(native)return native.call(Uint8Array,data);
 const raw=atob(data),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
import {apply,initialGame,publicView} from './core.ts';
import {referenceSeeds as originalSeeds} from './questions.ts';
import {extraQuestions} from './extra-questions.ts';
const referenceSeeds=[...originalSeeds,...extraQuestions];
const CONTENT_VERSION=3;
const response=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function hash(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function session(req:Request,env:any){const id=new URL(req.url).searchParams.get('s');if(!id||!/^[a-f0-9-]{36}$/.test(id))return null;return await env.DB!.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first()}
export async function authorized(req:Request,row:any){const token=req.headers.get('x-host-key');return !!token&&await hash(token)===row.token_hash}
const previousReference:any={
'reference-1':['أين أُقيم هذا الاجتماع؟','حائل'],
'reference-2':['من هو أول شخص جالس يحمل بيده مسباحًا؟','علي العقلا'],
'reference-3':['من هو هذا الشخص؟ هل تعرفه؟','أسماعيل البرصان'],
'reference-4':['ماذا تُسمّى الجبال خلف بدر الرشيد؟','غراميل الروله']};
export async function installContent(g:any,id:string,env:any){
 if(g.contentVersion===CONTENT_VERSION)return g;
 g=structuredClone(g);
 const removed=new Set(g.questions.filter((q:any)=>q.demo).map((q:any)=>q.id));
 g.questions=g.questions.filter((q:any)=>!q.demo);
 if(removed.has(g.display)){g.display=null;g.reveal=false;g.zoom=false}
 for(const seed of referenceSeeds){
  // Existing v2 sessions keep original questions, deletions and display unchanged.
  if((g.contentVersion||0)>=2&&!seed.id.startsWith('friends-extra-'))continue;
  const existing=g.questions.find((q:any)=>q.id===seed.id);
  // Preserve questions the presenter edited; update only untouched bundled references.
  if(existing){const old=previousReference[seed.id];if(!old||existing.text!==old[0]||existing.answer!==old[1])continue}
  let image=null;
  if(seed.data){const digest=await hash(seed.data);const name=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');image=id+'/'+name;if(!await env.BUCKET.head(image)){const bytes=decodeImage(seed.data);await env.BUCKET.put(image,bytes,{httpMetadata:{contentType:'image/jpeg'}})}}
  const q={id:seed.id,text:seed.text,answer:seed.answer,note:existing?.note&&existing.note!=='الإجابة من نص المرفق كما وردت؛ لم تُستنتج من الصورة. راجع الصياغة قبل اللقاء.'?existing.note:seed.note,review:seed.review,image};
  g.questions=g.questions.filter((q:any)=>q.id!==seed.id).concat(q);
  if(g.display===seed.id)g.reveal=false;
 }
 g.contentVersion=CONTENT_VERSION;return g;
}
export async function gameGET(req:Request,env:any){try{
 let row=await session(req,env);if(!row)return response({error:'لم نعثر على الجلسة. افتح رابط الجلسة الصحيح.'},404);
 let g=JSON.parse(row.data);
 if(new URL(req.url).searchParams.get('host')==='1'){
  if(!await authorized(req,row))return response({error:'رابط المقدّم الخاص مطلوب'},403);
  if(g.contentVersion!==CONTENT_VERSION){const next=await installContent(g,row.id,env);const result=await env.DB.prepare('UPDATE sessions SET data = ?,revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(next),row.id,row.revision).run();if(result.meta.changes){row={...row,revision:row.revision+1};g=next}else{row=await session(req,env);g=JSON.parse(row.data)}}
  return response({revision:row.revision,state:publicView(g),questions:g.questions,used:g.used})
 }
 return response({revision:row.revision,state:publicView(g)})
}catch{return response({error:'تعذر الاتصال بالخادم. حاول مجددًا.'},503)}}
export async function gamePOST(req:Request,env:any){try{const url=new URL(req.url);if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)return response({error:'طلب غير مسموح'},403);if(Number(req.headers.get('content-length')||0)>50000)return response({error:'حجم الطلب كبير'},413);const a=await req.json() as any;
if(a.type==='create'){const id=crypto.randomUUID(),key=crypto.randomUUID()+crypto.randomUUID();const base=initialGame();base.questions=[];const initial=await installContent(base,id,env);await env.DB!.prepare('INSERT INTO sessions(id,token_hash,revision,data) VALUES(?,?,0,?)').bind(id,await hash(key),JSON.stringify(initial)).run();return response({id,key})}
const row=await session(req,env);if(!row||!await authorized(req,row))return response({error:'صلاحية المقدّم مطلوبة'},403);const g=JSON.parse(row.data);if(!a.op||typeof a.op!=='string'||a.op.length>80)return response({error:'معرّف الأمر مطلوب'},400);if(g.recent.includes(a.op))return response({ok:true,duplicate:true});if(a.revision!==row.revision)return response({error:'تغيّرت الجلسة على الجهاز الآخر؛ تم تحديث الحالة، أعد المحاولة.'},409);
if(a.type==='save'&&a.question?.image){if(!new RegExp('^'+row.id+'/[a-f0-9-]{36}$').test(a.question.image)||!await env.BUCKET!.head(a.question.image))return response({error:'الصورة غير محفوظة؛ ارفعها أولًا'},400)}
const next=apply(g,a);next.recent=[...g.recent,a.op].slice(-128);const result=await env.DB!.prepare('UPDATE sessions SET data = ?,revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(next),row.id,row.revision).run();if(!result.meta.changes)return response({error:'تزامن أمر آخر؛ أعد المحاولة بعد التحديث'},409);return response({ok:true,revision:row.revision+1});
}catch(e:any){return response({error:e.message||'تعذر تنفيذ الأمر'},400)}}

export async function imageGET(req:Request,env:any){const row=await session(req,env);if(!row)return new Response('غير موجود',{status:404});const key=new URL(req.url).searchParams.get('key');const g=JSON.parse(row.data);const q=g.questions.find((q:any)=>q.id===g.display);if(!key||!key.startsWith(row.id+'/')||(!await authorized(req,row)&&q?.image!==key))return new Response('غير مسموح',{status:403});const obj=await env.BUCKET!.get(key);if(!obj)return new Response('غير موجود',{status:404});return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}})}
export async function imagePOST(req:Request,env:any){const row=await session(req,env);if(!row||!await authorized(req,row))return new Response('غير مسموح',{status:403});if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return new Response('غير مسموح',{status:403});const type=req.headers.get('content-type')||'';if(!['image/jpeg','image/png','image/webp'].includes(type))return Response.json({error:'استخدم صورة JPEG أو PNG أو WebP'}, {status:400});const bytes=await req.arrayBuffer();if(bytes.byteLength>8*1024*1024)return Response.json({error:'الحد الأقصى للصورة ٨ ميجابايت'}, {status:413});const b=new Uint8Array(bytes);const valid=type==='image/jpeg'?b[0]===255&&b[1]===216:type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';if(!valid)return Response.json({error:'صيغة الصورة غير صحيحة'},{status:400});const key=row.id+'/'+crypto.randomUUID();await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:type}});return Response.json({key},{headers:{'Cache-Control':'no-store'}})}
