export type Question={id:string,text:string,answer:string,note:string,image:string|null,demo?:boolean,review?:boolean};
export type Game={cells:number[],names:string[],wins:number[],swapped:boolean,round:number,winner:number,path:number[],history:any[],questions:Question[],used:string[],display:string|null,reveal:boolean,zoom:boolean,started:boolean,recent:string[],contentVersion?:number};
// Pointy-top odd-row offset grid: alternate rows shift half a hex, no cumulative shear.
export function neighbors(i:number){const c=i%5,r=Math.floor(i/5),d=r%2?1:-1;return [[c-1,r],[c+1,r],[c,r-1],[c+d,r-1],[c,r+1],[c+d,r+1]].filter(([x,y])=>x>=0&&x<5&&y>=0&&y<5).map(([x,y])=>y*5+x)}
export function winningPath(cells:number[],team:number,swapped=false){const horizontal=(team===1)!==swapped;const queue:number[][]=[];const seen=new Set<number>();for(let i=0;i<25;i++)if(cells[i]===team&&(horizontal?i%5===0:Math.floor(i/5)===0)){queue.push([i]);seen.add(i)}while(queue.length){const p=queue.shift()!,i=p[p.length-1];if(horizontal?i%5===4:Math.floor(i/5)===4)return p;for(const n of neighbors(i))if(cells[n]===team&&!seen.has(n)){seen.add(n);queue.push([...p,n])}}return []}
export function initialGame():Game{return {cells:Array(25).fill(0),names:['الفريق الأول','الفريق الثاني'],wins:[0,0],swapped:false,round:1,winner:0,path:[],history:[],questions:[{id:'demo-1',text:'مثال مؤقت: ما عاصمة المملكة العربية السعودية؟',answer:'الرياض',note:'هذا سؤال تجريبي، احذفه وأضف أسئلتك.',image:null,demo:true},{id:'demo-2',text:'مثال مؤقت: كم عدد أيام الأسبوع؟',answer:'سبعة أيام',note:'مثال مؤقت للتجربة فقط.',image:null,demo:true}],used:[],display:null,reveal:false,zoom:false,started:false,recent:[]}}
function snapshot(g:Game){return {cells:[...g.cells],wins:[...g.wins],winner:g.winner,path:[...g.path]}}
function reconcile(g:Game){if(g.winner)g.wins[g.winner-1]--;g.winner=0;g.path=[];for(const team of [1,2]){const p=winningPath(g.cells,team,g.swapped);if(p.length){g.winner=team;g.path=p;g.wins[team-1]++;break}}}
export function apply(g:Game,a:any):Game{g=structuredClone(g);if(!a||typeof a.type!=='string')throw Error('أمر غير صالح');switch(a.type){
case 'cell': {if(!Number.isInteger(a.index)||a.index<0||a.index>24||![0,1,2].includes(a.team))throw Error('خلية غير صالحة');if(g.cells[a.index]===a.team)break;if(g.cells[a.index]!==0&&!a.edit)throw Error('تعديل الخلية يحتاج تأكيدًا');if(g.winner&&!a.edit)throw Error('انتهت الجولة؛ ابدأ جولة جديدة أو تراجع');g.history.push(snapshot(g));g.history=g.history.slice(-100);g.cells[a.index]=a.team;reconcile(g);break;}
case 'undo': {const prev=g.history.pop();if(prev)Object.assign(g,prev);break;}
case 'show': {const q=g.questions.find(q=>q.id===a.id);if(!q||q.review)throw Error('راجع السؤال والإجابة قبل عرضه');g.display=q.id;g.reveal=false;g.zoom=false;if(!g.used.includes(q.id))g.used.push(q.id);break;}
case 'reveal': if(g.display)g.reveal=true;break;
case 'board':g.display=null;g.reveal=false;g.zoom=false;break;
case 'zoom':g.zoom=!!a.value;break;
case 'start':g.started=true;break;
case 'names':if(!Array.isArray(a.names)||a.names.length!==2)throw Error('أسماء غير صالحة');g.names=a.names.map((n:string,i:number)=>String(n).trim().slice(0,50)||['الفريق الأول','الفريق الثاني'][i]);break;
case 'round':g.cells=Array(25).fill(0);g.history=[];g.winner=0;g.path=[];g.display=null;g.reveal=false;g.zoom=false;g.round++;if(a.swap)g.swapped=!g.swapped;break;
case 'reset': {const fresh=initialGame();fresh.questions=g.questions;fresh.used=g.used;fresh.names=g.names;fresh.contentVersion=g.contentVersion;g={...fresh,started:g.started};break;}
case 'unused':g.used=[];break;
case 'save': {const q=a.question;if(!q||typeof q.id!=='string'||q.id.length>80)throw Error('معرّف غير صالح');const clean:Question={id:q.id,text:String(q.text||'').trim().slice(0,3000),answer:String(q.answer||'').trim().slice(0,3000),note:String(q.note||'').slice(0,3000),image:q.image||null,review:!!q.review,demo:!!q.demo};if(!clean.text&&!clean.image)throw Error('أضف نصًا أو صورة');if(!clean.answer&&!clean.review)throw Error('أضف الإجابة أو علّم السؤال للمراجعة');if(g.questions.length>=500&&!g.questions.some(q=>q.id===clean.id))throw Error('الحد الأقصى ٥٠٠ سؤال');g.questions=g.questions.filter(q=>q.id!==clean.id).concat(clean);if(g.display===clean.id){g.display=null;g.reveal=false}break;}
case 'delete':g.questions=g.questions.filter(q=>q.id!==a.id);if(g.display===a.id)g.display=null;break;
case 'demos': {const ids=new Set(g.questions.filter(q=>q.demo).map(q=>q.id));g.questions=g.questions.filter(q=>!q.demo);if(ids.has(g.display||''))g.display=null;break;}
case 'clear':g.questions=[];g.used=[];g.display=null;g.reveal=false;break;
default:throw Error('أمر غير معروف');}return g}
export function publicView(g:Game){const q=g.questions.find(q=>q.id===g.display);return {cells:g.cells,names:g.names,wins:g.wins,swapped:g.swapped,round:g.round,winner:g.winner,path:g.path,canUndo:!!g.history.length,started:g.started,zoom:g.zoom,question:q?{id:q.id,text:q.text,image:q.image,...(g.reveal?{answer:q.answer}:{})}:null}}
