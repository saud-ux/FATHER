import {imageStore} from './image-store';
import {gameGET,gamePOST,imageGET,imagePOST} from './service';
export default {
 async fetch(request:Request,env:any):Promise<Response>{
  env={...env,BUCKET:imageStore(env.DB)};
  const path=new URL(request.url).pathname;
  if(path==='/api/game'){
   if(request.method==='GET')return gameGET(request,env);
   if(request.method==='POST')return gamePOST(request,env);
   return new Response('غير مسموح',{status:405,headers:{Allow:'GET, POST'}});
  }
  if(path==='/api/image'){
   if(request.method==='GET')return imageGET(request,env);
   if(request.method==='POST')return imagePOST(request,env);
   return new Response('غير مسموح',{status:405,headers:{Allow:'GET, POST'}});
  }
  if(path.startsWith('/api/'))return new Response('غير موجود',{status:404});
  const result=await env.ASSETS.fetch(request);
  const headers=new Headers(result.headers);headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');
  return new Response(result.body,{status:result.status,headers});
 }
};
