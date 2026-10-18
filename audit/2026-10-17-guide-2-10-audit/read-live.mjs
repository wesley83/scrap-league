import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DOMParser} from 'linkedom';
import {publicEquivalent} from '../../tools/deploy-pagelove.mjs';
const origin='https://hire-poker-8313.onpagelove.com',sha=b=>createHash('sha256').update(b).digest('hex');
const get=async path=>{
 const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(12000)}),bytes=Buffer.from(await response.arrayBuffer());
 return {path,status:response.status,type:response.headers.get('content-type'),bytes:bytes.length,sha256:sha(bytes),body:bytes};
};
const manifest=await get('/release.json');
if(manifest.status!==200)throw Error('Release manifest unavailable: '+manifest.status);
const release=JSON.parse(manifest.body),entry=await get('/');
const doc=new DOMParser().parseFromString(entry.body.toString(),'text/html');
const base=new URL(doc.querySelector('base').getAttribute('href'),origin+'/');
const paths=[...doc.querySelectorAll('link[rel=stylesheet],link[rel=icon],link[rel=apple-touch-icon]')].map(n=>new URL(n.getAttribute('href'),base).pathname);
for(const n of doc.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]'))paths.push(new URL(n.getAttribute('content')).pathname);
paths.push('/editor/yard-loop','/track/yard-loop','/boards/trial.html','/boards/daily.html');
const requests=[];
for(const path of [...new Set(paths)]){
 try{const r=await get(path);const inventory=release.files.find(x=>new URL(x.url,origin+'/').pathname===path);requests.push({path,status:r.status,type:r.type,bytes:r.bytes,sha256:r.sha256,inventoryMatch:inventory?r.sha256===inventory.hash:null});}
 catch(error){requests.push({path,status:'request-failed',error:error.message});}
}
const local=JSON.parse(await fs.readFile(new URL('../../dist/release.json',import.meta.url)));
const report={utc:new Date().toISOString(),method:'Read-only public HTTP checks; no validation/write or provider-wide readiness claim',liveRelease:release.release,localRelease:local.release,sourceHash:release.sourceHash,entry:{status:entry.status,sha256:entry.sha256,base:base.href},requests,localCandidatePublished:release.release===local.release};
await fs.writeFile(new URL('live-readback.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
