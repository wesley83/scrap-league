import fs from 'node:fs/promises';
import {DOMParser} from 'linkedom';
import {createHash} from 'node:crypto';
const origin='https://hire-poker-8313.onpagelove.com', sha=b=>createHash('sha256').update(b).digest('hex');
const local=JSON.parse(await fs.readFile('dist/release.json','utf8'));
const deployed=JSON.parse(await fs.readFile('audit/deployment.json','utf8'));
if(deployed.release!==local.release)throw Error('Deployment has not completed');
const get=async p=>{const r=await fetch(origin+p,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});const bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200)throw Error(`${p}: ${r.status}`);return {path:p,status:r.status,type:r.headers.get('content-type'),sha256:sha(bytes),bytes,doc:()=>new DOMParser().parseFromString(bytes.toString(),'text/html')};};
const root=await get('/'), doc=root.doc(), prefix='/releases/'+local.release+'/';
const base=new URL(doc.querySelector('base').getAttribute('href'),origin+'/').href;
if(base!==origin+prefix)throw Error('Wrong public release base');
const manifestURL=new URL(doc.querySelector('link[rel="manifest"]').getAttribute('href'),base), manifestResponse=await get(manifestURL.pathname), manifest=JSON.parse(manifestResponse.bytes);
if(new URL(manifest.start_url,manifestURL).href!==origin+'/' || new URL(manifest.scope,manifestURL).href!==origin+'/')throw Error('Wrong PWA start or scope');
const metadata=[];
for(const selector of ['link[rel="icon"][href$="favicon.ico"]','link[rel="apple-touch-icon"]','meta[property="og:image"]','meta[name="twitter:image"]']){const el=doc.querySelector(selector);if(!el)throw Error('Missing '+selector);const url=new URL(el.getAttribute('href')||el.getAttribute('content'),base);const asset=await get(url.pathname); const expected=deployed.publicFiles.find(f=>f.path===url.pathname);if(!expected||asset.sha256!==expected.sha256)throw Error('Wrong metadata asset bytes '+url.pathname);metadata.push({selector,path:asset.path,status:asset.status,type:asset.type,sha256:asset.sha256});}
const content=JSON.parse(await fs.readFile('dist/releases/'+local.release+'/content.json','utf8'));
const routes=[];
for(const track of content.tracks)for(const mode of ['track','editor']){const r=await get('/'+mode+'/'+track.track.slug), d=r.doc();if(!d.querySelector('#game-shell')||d.querySelector('#routed-track')?.getAttribute('data-track-id')!==track.track.id||!d.querySelector('#routed-track article'))throw Error('Wrong composed track '+r.path);routes.push({path:r.path,status:r.status,type:r.type,sha256:r.sha256,trackId:track.track.id,composed:true});}
for(const path of ['/track/unknown-fixture','/editor/','/track/%3Cscript%3E']){const r=await get(path),d=r.doc();if(!d.querySelector('#game-shell')||d.querySelector('#routed-track')?.getAttribute('data-track-id')!=='')throw Error('Unsafe or missing fallback '+path);routes.push({path,status:r.status,type:r.type,sha256:r.sha256,fallback:true});}
const worker=await get('/sw.js'); if(!worker.bytes.toString().includes('CACHE="'+local.release+'"'))throw Error('Wrong worker release');
const publicConfig=await get(prefix+'pagelove.js');if(!/publicBoards:\s*null/.test(publicConfig.bytes.toString()))throw Error('Public boards enabled');
const old=JSON.parse(await fs.readFile('audit/mobile-baseline/deployment.json','utf8'));
const retained=await get('/releases/'+old.release+'/main.js');
const oldExpected=old.publicFiles.find(f=>f.path===retained.path);if(retained.sha256!==oldExpected.sha256)throw Error('Previous-client runtime changed');
const report={utc:new Date().toISOString(),origin,release:local.release,sourceHash:deployed.sourceHash,root:{status:root.status,type:root.type,sha256:root.sha256,base},manifest:{path:manifestURL.pathname,status:manifestResponse.status,type:manifestResponse.type,id:manifest.id,start_url:manifest.start_url,scope:manifest.scope,display:manifest.display,icons:manifest.icons},metadata,routes,worker:{path:worker.path,status:worker.status,type:worker.type,sha256:worker.sha256},publicBoardsDisabled:true,previousRuntimeRetained:{release:old.release,path:retained.path,sha256:retained.sha256},scope:'Public HTTP metadata, exact asset bytes and native composition. Browser install or cold restart is not claimed.'};
await fs.writeFile('audit/deployment-live-readback.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({release:report.release,metadataAssets:metadata.length,routes:routes.length,pwaManifest:true,boardsDisabled:true,oldRuntimeRetained:true}));
