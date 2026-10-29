import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DOMParser} from 'linkedom';
const root=path.resolve(import.meta.dirname,'../..'),audit=import.meta.dirname,dist=path.join(root,'dist'),sha=b=>createHash('sha256').update(b).digest('hex');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.ttf':'font/ttf','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const exposure=`\nexport const layoutReview={get race(){return race},get workshop(){return workshop},get world(){return world},get settings(){return settings},get view(){return view},input,finish,pause,resume,show,applyPreferences};window.__layoutReview={ready,review:layoutReview,document};\n`;
const footer='<div style="position: fixed; bottom: 0; left: 0; right: 0; padding: 8px; background: #f0f0f0; text-align: center; font-size: 12px; color: #666; z-index: 9999; opacity: 0.8; border-top: 1px solid #ddd">Powered by <a href="https://pagelove.com/" style="color:#4a90d9;text-decoration:none">Pagelove</a></div>';
let insets=false;
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:4445');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/audit/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Phone layout verification</title><style>body{margin:0;background:#d9dfdf;font:14px system-ui}#actions{padding:8px}button{padding:8px;margin:4px}iframe{display:block;width:432px;height:900px;border:0}pre{white-space:pre-wrap;max-height:90px;overflow:auto}</style><div id="actions"></div><pre id="results">Loading</pre><iframe id="game" title="Actual game at CSS viewport" src="/"></iframe><script type="module" src="/audit/lab.js"></script></html>');return;}
 if(u.pathname==='/audit/insets'&&req.method==='POST'){insets=u.searchParams.get('enabled')==='true';res.end(JSON.stringify({insets}));return;}
 if(u.pathname==='/audit/lab.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(audit,'lab.js')));return;}
 if(u.pathname==='/audit/receipt'&&req.method==='POST'){
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4e6)throw Error('Oversized evidence');chunks.push(c);}const value=JSON.parse(Buffer.concat(chunks)),release=JSON.parse(await fs.readFile(path.join(dist,'release.json')));
  const file='browser-'+Date.now()+'.json';await fs.writeFile(path.join(audit,file),JSON.stringify({...value,receiptUTC:new Date().toISOString(),release:release.release,sourceHash:release.sourceHash,verifiers:{serverSha256:sha(await fs.readFile(new URL(import.meta.url))),labSha256:sha(await fs.readFile(path.join(audit,'lab.js')))},scope:'Actual Chromium iframe CSS viewport; local inspection hook and provider-footer fixture declared; no native/physical-device claim'},null,2),{flag:'wx'});res.end(JSON.stringify({file}));return;
 }
 if(u.pathname==='/sw.js'){res.writeHead(404);res.end('Worker verified separately');return;}
 let pathname=decodeURIComponent(u.pathname),html;
 if(/^\/(editor|track)\//.test(pathname)){
  const release=JSON.parse(await fs.readFile(path.join(dist,'release.json'))),entry=release.nativeFiles.find(e=>e.url===pathname);if(!entry)throw Error('Unknown route');const doc=new DOMParser().parseFromString(await fs.readFile(path.join(dist,entry.file),'utf8'),'text/html');
  for(const include of doc.querySelectorAll('p\\:include')){const resource=include.getAttribute('resource');const source=new DOMParser().parseFromString(await fs.readFile(path.join(resource.startsWith('/content/')?root:dist,resource),'utf8'),'text/html');include.replaceWith(source.querySelector(include.getAttribute('selector')));}html=doc.toString();
 }
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(dist+path.sep))throw Error('Invalid path');let bytes=html?Buffer.from(html):await fs.readFile(file);
 if(insets&&pathname.endsWith('.css'))bytes=Buffer.from(bytes.toString().replace(/env\(safe-area-inset-(left|right|top|bottom)(?:,\s*0px)?\)/g,(_,side)=>({left:'24px',right:'24px',top:'20px',bottom:'24px'}[side])));
 if(pathname.endsWith('/main.js'))bytes=Buffer.from(bytes.toString()+exposure);
 if(pathname==='/'||html)bytes=Buffer.from(bytes.toString().replace('</body>',footer+'</body>'));
 res.setHeader('Content-Type',types[path.extname(file)]||(html?'text/html':'application/octet-stream'));res.end(bytes);
}catch(e){res.writeHead(500);res.end(e.message);}}).listen(4445,'127.0.0.1',()=>console.log('Phone layout lab http://127.0.0.1:4445/audit/'));
