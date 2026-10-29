import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DOMParser} from 'linkedom';
const root=path.resolve(import.meta.dirname,'../..'), dist=path.join(root,'dist'), audit=import.meta.dirname;
const sha=b=>createHash('sha256').update(b).digest('hex');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const exposure=`\nconst productionInput=input;export const review={setController(c){input=c||productionInput},get boards(){return boards},get race(){return race},get world(){return world},get workshop(){return workshop},get settings(){return settings},get progress(){return progress},get store(){return store},get content(){return content},get view(){return view},showSharedTimes,openLeaderboards,settingsDialog,input,beginRace,startTrack,finish,show,pause,resume,repairGraphics,openWorkshop,applyPreferences,clearInput};window.__scrapAudit={ready,review,document};\n`;
let offline=false;
let fault='none';
let sequence=0;
async function verifierSnapshots(){
 const folder=path.join(audit,'verifier-snapshots');await fs.mkdir(folder,{recursive:true});const records=[];
 for(const file of [new URL(import.meta.url),path.join(root,'tools/handbook-lab.js'),path.join(root,'tools/ui-review-lab.js'),path.join(root,'tools/handbook-soak.js'),...['browser-extra.js','journeys.js','storage-worker.js','proof.js'].map(name=>path.join(audit,name))]){
  const bytes=await fs.readFile(file),digest=sha(bytes),target=path.join(folder,digest+'.txt');
  try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||!(await fs.readFile(target)).equals(bytes))throw error;}
  records.push({source:String(file),sha256:digest,snapshot:'verifier-snapshots/'+digest+'.txt'});
 }return records;
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:4417');
  if(u.pathname==='/__audit__/'){
   res.setHeader('Content-Type',types['.html']);
   res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Guide 2.10 game audit</title><style>body{font:16px system-ui;margin:16px;background:#e9e8db;color:#19343b}button{font:inherit;padding:12px;margin:4px}iframe{display:block;border:0;width:1280px;height:720px}pre{white-space:pre-wrap;max-height:300px;overflow:auto}</style><h1>Guide 2.10 game audit</h1><p>Isolated local fixtures. Instrumented app exports inspection only; synthetic controller results have explicit limits. Receipts are append-only.</p><div id="actions"></div><pre id="results">Loading</pre><iframe id="game" src="/" title="Game under audit"></iframe><script type="module" src="/__audit__/lab.js"></script></html>`);return;
  }
  if(u.pathname==='/__audit__/lab.js'){
   let js=(await fs.readFile(path.join(root,'tools/handbook-lab.js'),'utf8')).replace(/\r\n/g,'\n');
   const mark='  output.textContent = "Running " + name;\n  const start = performance.now();';
   if(js.split(mark).length!==2)throw Error('Unexpected record implementation');
   js=js.replace('await waitFor(() => frame.contentDocument?.querySelector("base"));\n  prefix = frame.contentDocument.querySelector("base").href;',
    `await waitFor(() => frame.contentDocument?.querySelector('base,script[src$="bootstrap.js"]'));\n  prefix = frame.contentDocument.querySelector('base')?.href || new URL('.',frame.contentDocument.querySelector('script[src$="bootstrap.js"]').src).href;`);
   js=js.replace('  const mod = await frame.contentWindow.eval(',`  await waitFor(() => frame.contentDocument.querySelector('#loading')?.hidden && !frame.contentDocument.querySelector('#stage')?.inert);\n  const mod = await frame.contentWindow.eval(`);
   js=js.replace(mark,mark+`\n  const qualified = {utc:new Date().toISOString(),release,entry:frame.contentWindow.location.href,userAgent:navigator.userAgent,actualViewport:[frame.contentWindow.innerWidth,frame.contentWindow.innerHeight],canvas:[api.world.canvas.width,api.world.canvas.height],renderer:api.world.ctx?.constructor.name,safeGraphics:api.world.safeGraphics,view:api.view,sourceReady:!!api.workshop?.track,initialState:'retained isolated audit-origin state; individual fixtures declare resets'};`);
   const save='  output.textContent = JSON.stringify(results, null, 2);';
   if(js.split(save).length!==2)throw Error('Unexpected result implementation');
   js=js.replace(save,`  results.at(-1).qualification = qualified;\n  output.textContent = JSON.stringify(results.map(({name,status,error})=>({name,status,error})),null,2);\n  await fetch('/__audit__/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({release,scope:'controlled browser fixture; normal browser input recorded separately',results:[results.at(-1)]})});`);
   js=js.replace('for (const [name, fn] of Object.entries(actions)) {',`Object.assign(actions, await (await import('/__audit__/extra.js')).extraActions({api:()=>api,frame,doc,win,home,click,button,check,waitFor,delay,connect}));\nfor (const [name, fn] of Object.entries(actions)) {`);
   res.setHeader('Content-Type',types['.js']);res.end(js);return;
  }
  if(u.pathname==='/__audit__/extra.js'){res.setHeader('Content-Type',types['.js']);res.end(await fs.readFile(path.join(audit,'browser-extra.js')));return;}
  if(u.pathname==='/__audit__/journeys.js'){res.setHeader('Content-Type',types['.js']);res.end(await fs.readFile(path.join(audit,'journeys.js')));return;}
  if(u.pathname==='/__audit__/storage-worker.js'){res.setHeader('Content-Type',types['.js']);res.end(await fs.readFile(path.join(audit,'storage-worker.js')));return;}
  if(u.pathname==='/__audit__/proof.js'){res.setHeader('Content-Type',types['.js']);res.end(await fs.readFile(path.join(audit,'proof.js')));return;}
  if(u.pathname==='/__audit__/exports'&&req.method==='POST'){
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>2e6)throw Error('Export receipt too large');chunks.push(c);}
   const record=JSON.parse(Buffer.concat(chunks));if(!/^[a-z0-9-]+$/.test(record.slug))throw Error('Invalid export slug');
   const folder=path.join(audit,'workshop-exports');await fs.mkdir(folder,{recursive:true});
   await fs.writeFile(path.join(folder,record.slug+'-'+Date.now()+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
   res.end(JSON.stringify({saved:true}));return;
  }
  if(u.pathname==='/__audit__/ui.js'||u.pathname==='/__audit__/soak.js'){
   res.setHeader('Content-Type',types['.js']);res.end(await fs.readFile(path.join(root,u.pathname.endsWith('ui.js')?'tools/ui-review-lab.js':'tools/handbook-soak.js')));return;
  }
  if(['/__audit__/receipt','/__audit__/soak-receipt','/__audit__/quality-receipt'].includes(u.pathname)&&req.method==='POST'){
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4e6)throw Error('Receipt too large');chunks.push(c);}
   const bytes=Buffer.concat(chunks),record=JSON.parse(bytes),release=JSON.parse(await fs.readFile(path.join(dist,'release.json'),'utf8'));
   if(record.release!==release.release)throw Error('Stale receipt');
   const filename=`browser-${Date.now()}-${++sequence}.json`;
   await fs.writeFile(path.join(audit,filename),JSON.stringify({...record,receiptUTC:new Date().toISOString(),sourceHash:release.sourceHash,verifiers:await verifierSnapshots(),serverSha256:sha(await fs.readFile(new URL(import.meta.url))),labSha256:sha(await fs.readFile(path.join(root,'tools/handbook-lab.js')))},null,2)+'\n',{flag:'wx'});
   res.end(JSON.stringify({saved:filename}));return;
  }
  if(u.pathname==='/__audit__/fault'&&req.method==='POST'){fault=u.searchParams.get('value');res.end(JSON.stringify({fault}));return;}
  if(u.pathname==='/sw.js'){res.writeHead(404);res.end('Instrumented origin: worker checks use port 4418');return;}
  let pathname=decodeURIComponent(u.pathname);
  if(/^\/(editor|track)\//.test(pathname)){
   const release=JSON.parse(await fs.readFile(path.join(dist,'release.json'),'utf8'));
   const entry=release.nativeFiles.find(e=>e.url===pathname)||release.nativeFiles.find(e=>e.url===`/${pathname.split('/')[1]}/:slug`);
   const doc=new DOMParser().parseFromString(await fs.readFile(path.join(dist,entry.file),'utf8'),'text/html');
   for(const include of doc.querySelectorAll('p\\:include')){
    const resource=include.getAttribute('resource'),base=resource.startsWith('/content/')?root:dist;
    const location=path.resolve(base,'.'+resource);if(!location.startsWith(base+path.sep))throw Error('Invalid include');
    const src=new DOMParser().parseFromString(await fs.readFile(location,'utf8'),'text/html');
    const fragment=src.querySelector(include.getAttribute('selector'));if(!fragment)throw Error('Missing include');include.replaceWith(fragment);
   }
   res.setHeader('Content-Type',types['.html']);res.setHeader('X-Audit-Scope','local composition emulation only');res.end(doc.toString());return;
  }
  const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(dist+path.sep))throw Error('Invalid path');
  if((fault==='css'&&pathname.endsWith('/arcade.css'))||(fault==='main'&&pathname.endsWith('/main.js'))){res.writeHead(503);res.end('Injected dependency fault: '+fault);return;}
  let bytes=await fs.readFile(file);
  if(pathname.endsWith('/main.js'))bytes=Buffer.from(bytes.toString()+exposure+`\nif(new URL(location.href).searchParams.get('proof')==='1')void ready.then(()=>import('/__audit__/proof.js')).then(m=>m.mount(review));\n`);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
 }catch(e){res.writeHead(500);res.end(e.message);}
});
const port=Number(process.env.SCRAP_AUDIT_PORT||4417);
server.listen(port,'127.0.0.1',()=>console.log('Audit lab http://127.0.0.1:'+port+'/__audit__/'));
