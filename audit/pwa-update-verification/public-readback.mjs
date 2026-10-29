import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin='https://hire-poker-8313.onpagelove.com';
const release=JSON.parse(await fs.readFile(new URL('../../dist/release.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const paths=['/','/sw.js','/release.json',...['main.js','offline.js','storage.js','manifest.webmanifest'].map(n=>`/releases/${release.release}/${n}`)];
const results=[];
await fs.mkdir(new URL('./public-B/',import.meta.url),{recursive:true});
let publicIndexHash;
for(const resource of paths){
 const response=await fetch(origin+resource,{cache:'no-store'});
 const bytes=Buffer.from(await response.arrayBuffer());
 const local=await fs.readFile(new URL('../../dist'+(resource==='/'?'/index.html':resource),import.meta.url));
 const item={path:resource,status:response.status,contentType:response.headers.get('content-type'),sha256:sha(bytes),exactLocalBytes:bytes.equals(local)};
 if(resource==='/'){publicIndexHash=sha(bytes);item.validPublishedEntry=bytes.toString().includes(`./releases/${release.release}/`);await fs.writeFile(new URL('./public-B/index.html',import.meta.url),bytes);}
 if(resource==='/sw.js'){
   const split=b=>{const s=b.toString(),n=s.indexOf('\n');return{header:s.slice(0,n),runtime:s.slice(n+1)};};
   const a=split(local),b=split(bytes);
   const inv=s=>JSON.parse(s.slice(s.indexOf(',INVENTORY=')+11).replace(/;$/,''));
   const expected=inv(a.header).map(e=>e.url==='./'?{...e,hash:publicIndexHash}:e);
   item.identicalWorkerLogic=a.runtime===b.runtime;
   item.inventoryMatchesWithPublishedEntry=JSON.stringify(expected)===JSON.stringify(inv(b.header));
   await fs.writeFile(new URL('./public-B/sw.js',import.meta.url),bytes);
 }
 if(resource==='/release.json'){
   const published=JSON.parse(bytes),expected=JSON.parse(local);
   const shellPath=`/releases/${release.release}/native-shell.html`;
   const shell=await fetch(origin+shellPath,{cache:'no-store'});
   const shellBytes=Buffer.from(await shell.arrayBuffer());
   for(const key of ['files','offlineFiles'])expected[key]=expected[key].map(e=>e.url==='./'?{...e,hash:publicIndexHash}:e.url==='.'+shellPath?{...e,hash:sha(shellBytes)}:e);
   item.inventoryMatchesPublishedHtml=shell.ok&&JSON.stringify(expected)===JSON.stringify(published);
   await fs.writeFile(new URL('./public-B/release.json',import.meta.url),bytes);
 }
 results.push(item);
}
const r={utc:new Date().toISOString(),origin,release:release.release,results};
await fs.writeFile(new URL('./public-readback.json',import.meta.url),JSON.stringify(r,null,2));
console.log(JSON.stringify(r,null,2));
if(results.some(r=>r.status!==200||!(r.exactLocalBytes||r.validPublishedEntry||r.inventoryMatchesPublishedHtml||(r.identicalWorkerLogic&&r.inventoryMatchesWithPublishedEntry))))process.exitCode=1;
