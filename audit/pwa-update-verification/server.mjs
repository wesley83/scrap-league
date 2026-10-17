// Isolated verification server: no production writes and no application patches.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const port = Number(process.env.PWA_VERIFY_PORT || 4394);
const sha = b => createHash('sha256').update(b).digest('hex');
const historical = name => execFileSync('git', ['show', `d25d58c:dist/${name}`], {cwd:root, maxBuffer:4e6});
const versions = {};
for (const [key, load] of Object.entries({A:historical, B:name=>fs.readFile(path.join(here,'public-B',name))})) {
  versions[key] = {};
  for (const name of ['index.html','sw.js','release.json']) versions[key][name] = await load(name);
  versions[key].release = JSON.parse(versions[key]['release.json']).release;
}
let phase = 'A', offline = false, corrupt = false, delay = 0;
const requests = [];
const types = {'.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon','.ttf':'font/ttf','.svg':'image/svg+xml'};
const metadata = {A:versions.A.release, B:versions.B.release, hashes:Object.fromEntries(Object.entries(versions).map(([key,v])=>[key,Object.fromEntries(['index.html','sw.js','release.json'].map(n=>[n,sha(v[n])]))]))};
await fs.writeFile(path.join(here,'subjects.json'),JSON.stringify(metadata,null,2));
http.createServer(async(req,res)=>{
  try {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Service-Worker-Allowed','/');
    if(u.pathname==='/__verify__/state') {
      if(req.method==='POST') {
        if(['A','B'].includes(u.searchParams.get('phase'))) phase=u.searchParams.get('phase');
        if(u.searchParams.has('offline')) offline=u.searchParams.get('offline')==='true';
        if(u.searchParams.has('corrupt')) corrupt=u.searchParams.get('corrupt')==='true';
        if(u.searchParams.has('delay')) delay=Math.min(5000,Math.max(0,Number(u.searchParams.get('delay'))||0));
      }
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({...metadata,phase,offline,corrupt,delay,requests:requests.slice(-150)}));
    }
    if(u.pathname==='/__verify__/receipt' && req.method==='POST') {
      const chunks=[]; let length=0;
      for await(const c of req){length+=c.length;if(length>2e6)throw Error('Too large');chunks.push(c);}
      const value=JSON.parse(Buffer.concat(chunks));
      await fs.writeFile(path.join(here,'browser-results.json'),JSON.stringify(value,null,2));
      return res.end('Saved');
    }
    if(u.pathname==='/__verify__/client.js') {
      res.setHeader('Content-Type','text/javascript');
      return res.end(await fs.readFile(path.join(here,'client.js')));
    }
    if(u.pathname==='/__verify__/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>PWA update verification</title></head><body style="background:#ece6d5;color:#202721;font:16px system-ui;margin:20px"><h1>PWA update verification</h1><p>Isolated origin. Exact A ${metadata.A} → B ${metadata.B}. Real service workers; labeled synthetic saves.</p><div id="actions" style="display:flex;gap:8px;flex-wrap:wrap"></div><pre id="results" role="status" style="white-space:pre-wrap;max-height:440px;overflow:auto"></pre><div style="display:flex;gap:12px"><iframe id="one" title="Game window one" style="width:49%;height:740px;border:1px solid #666"></iframe><iframe id="two" title="Game window two" style="width:49%;height:740px;border:1px solid #666"></iframe></div><script type="module" src="/__verify__/client.js"></script></body></html>`);
    }
    const name=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
    requests.push({utc:new Date().toISOString(),path:u.pathname,phase,offline,corrupt});
    if(offline){res.writeHead(503);return res.end('Injected unavailable network');}
    if(corrupt && name===`releases/${versions.A.release}/main.js`){res.setHeader('Content-Type','text/javascript');return res.end('// Injected invalid bytes');}
    if(delay && name===`releases/${versions.A.release}/main.js`)await new Promise(resolve=>setTimeout(resolve,delay));
    const target=path.resolve(root,'dist',name);
    if(!target.startsWith(path.join(root,'dist')+path.sep))throw Error('Outside distribution');
    const bytes=versions[phase][name] instanceof Buffer?versions[phase][name]:await fs.readFile(target);
    res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');
    res.end(bytes);
  } catch(e){res.writeHead(500);res.end(e.message);}
}).listen(port,'127.0.0.1',()=>console.log(`PWA verification: http://127.0.0.1:${port}/__verify__/`));
