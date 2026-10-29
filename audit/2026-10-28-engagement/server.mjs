import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../../dist/', import.meta.url)));
const receipts = new URL('./browser-receipts.jsonl', import.meta.url);
const hook = `
// Isolated loopback review controls; this block is absent from the build.
const lab = document.createElement('details');
lab.id = 'engagement-review';
lab.style.cssText = 'position:fixed;bottom:0;right:0;z-index:10000;background:#fff;color:#142b31;max-width:100%;font:12px sans-serif';
lab.innerHTML = '<summary>Review controls</summary><button id="review-complete">Complete via legal controller</button><button id="review-snapshot">Record current state</button><button id="review-double">Double text</button><pre id="review-state" style="max-height:160px;overflow:auto;max-width:600px"></pre>';
document.body.append(lab);
async function report(extra={}) {
 const payload = { at: new Date().toISOString(), viewport: [innerWidth,innerHeight], view,
   result: race?.result, settings: race?.settingsSnapshot, build:race?.build,
   target:race?.options?.featured, challenge:workshop?.track?.challenge,
   documentWidth:document.documentElement.scrollWidth,
   controls:[...document.querySelectorAll('button,input,select')].filter(e=>e.getBoundingClientRect().width>0 && !lab.contains(e)).map(e=>({label:e.textContent.trim().slice(0,140)||e.getAttribute('aria-label'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),
   text:document.querySelector('#modal')?.open ? document.querySelector('#modal-content').innerText : document.querySelector('.screen:not([hidden])')?.innerText,
   ...extra };
 document.querySelector('#review-state').textContent=JSON.stringify(payload,null,2);
 await fetch('/__receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
document.querySelector('#review-snapshot').onclick=()=>report();
document.querySelector('#review-complete').onclick=async()=>{
 try {
 const captured=race;
 if (!captured || !['racing','countdown'].includes(captured.state)) throw Error('Start a race first.');
 captured.state='racing'; captured.countdown=0;
 const {aiInput}=await import('./simulation.js');
 let steps=0;
 while (captured.state==='racing' && steps++<57601) {
   const p=captured.cars.find(c=>c.id==='player');
   stepRace(captured,aiInput(p,captured.track,'expert',1,captured.cars));
 }
 await finish(); lastTime=performance.now(); accumulator=0;
 await report({method:'Ordinary legal controller, countdown elided; no position, gate or finish injection',steps});
 }catch(error){await report({error:error.message});}
};
function doubleText(){
 const sizes=[...document.querySelectorAll('body *:not(#engagement-review):not(#engagement-review *)')].map(e=>[e,getComputedStyle(e).fontSize]);
 for(const [e,size] of sizes) {
   if (!e.dataset.reviewSize) {e.dataset.reviewSize=e.style.fontSize||'unset'; e.style.fontSize=(parseFloat(size)*2)+'px';}
 }
 report({method:'Computed text sizes doubled via fixture'});
}
document.querySelector('#review-double').onclick=doubleText;
document.addEventListener('keydown',event=>{if(event.altKey && event.code==='KeyD'){event.preventDefault();doubleText();}});
`;
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
 try{
 const url = new URL(req.url,'http://127.0.0.1:4442');
 if(url.pathname==='/__receipt' && req.method==='POST'){
   let data='';for await(const chunk of req){data+=chunk;if(data.length>1000000)throw Error('Receipt limit');}
   JSON.parse(data); await fs.appendFile(receipts,data+'\n');res.writeHead(204);res.end();return;
 }
 const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!target.startsWith(root+path.sep))throw Error('Outside root');
 let body=await fs.readFile(target);
 if(url.pathname==='/' && url.searchParams.has('provider')) body=Buffer.from(body.toString().replace('</body>','<div style="position: fixed; bottom: 0; left: 0; width: 100%; height: 32px; text-align: center; background: #d2d4d3; color: #34464b; z-index: 200"><a href="https://pagelove.com/" style="color: #34464b">Powered by Pagelove</a></div></body>'));
 if(url.pathname.endsWith('/main.js'))body=Buffer.from(body.toString()+hook);
 if(url.pathname==='/sw.js'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch(error){res.writeHead(404);res.end(error.message);}
}).listen(4442,'127.0.0.1',()=>console.log('Isolated engagement review: http://127.0.0.1:4442/'));
