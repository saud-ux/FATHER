// Store persistent images in D1; no R2 account or billing activation required.
// Chunks keep every row well below D1's 2 MB limit. An 8 MB image uses 35 queries.
export function imageStore(db:any){
 return {
  async head(key:string){return db.prepare('SELECT key FROM image_objects WHERE key=?').bind(key).first()},
  async put(key:string,input:ArrayBuffer|Uint8Array,options:any){
   const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
   const statements=[db.prepare('DELETE FROM image_chunks WHERE key=?').bind(key)];
   for(let start=0,part=0;start<bytes.length;start+=262144,part++){
    statements.push(db.prepare('INSERT INTO image_chunks(key,part,bytes) VALUES(?,?,?)').bind(key,part,bytes.slice(start,start+262144).buffer));
   }
   statements.push(db.prepare('INSERT OR REPLACE INTO image_objects(key,mime,size) VALUES(?,?,?)').bind(key,options?.httpMetadata?.contentType||'image/jpeg',bytes.length));
   await db.batch(statements);
  },
  async get(key:string){
   const meta=await db.prepare('SELECT mime,size FROM image_objects WHERE key=?').bind(key).first();if(!meta)return null;
   const rows=await db.prepare('SELECT bytes FROM image_chunks WHERE key=? ORDER BY part').bind(key).all();
   const bytes=new Uint8Array(meta.size);let offset=0;
   for(const row of rows.results){const chunk=new Uint8Array(row.bytes);bytes.set(chunk,offset);offset+=chunk.length}
   if(offset!==meta.size)throw new Error('الصورة المحفوظة غير مكتملة');
   return {body:bytes,httpMetadata:{contentType:meta.mime}};
  }
 };
}
