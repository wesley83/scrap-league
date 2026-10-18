// Unmodified old/new release pages in equally sized real browser iframes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),dist=path.join(root,'dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.ttf':'font/ttf','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const footer='<div style="position: fixed; bottom: 0; left: 0; right: 0; padding: 8px; background: #f0f0f0; text-align: center; font-size: 12px; color: #666; z-index: 9999; opacity: 0.8; border-top: 1px solid #ddd">Powered by <a href="https://pagelove.com/" style="color: #4a90d9; text-decoration: none">Pagelove</a></div>';
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:4441');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/compare/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><title>Phone layout before and after</title><style>body{margin:18px;background:#dce4e2;color:#18343b;font:16px system-ui}h1{font-size:22px;margin:0 0 14px}main{display:flex;gap:28px}section{width:294px}h2{font-size:16px;margin:0 0 8px}.view{width:294px;height:612px;overflow:hidden}iframe{width:432px;height:900px;border:0;transform:scale(.68);transform-origin:top left}</style><h1>Same phone viewport: 432 × 900 CSS pixels</h1><main><section><h2>Before</h2><div class="view"><iframe title="Previous layout" src="/previous.html"></iframe></div></section><section><h2>After</h2><div class="view"><iframe title="Responsive repair" src="/"></iframe></div></section></main>');return;}
 if(u.pathname==='/sw.js'){res.writeHead(404);res.end();return;}
 const file=path.resolve(dist,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(dist+path.sep))throw Error('Invalid path');let bytes=u.pathname==='/previous.html'?await fs.readFile(path.join(import.meta.dirname,'previous-index.html')):await fs.readFile(file);
 if(u.pathname==='/'||u.pathname==='/previous.html')bytes=Buffer.from(bytes.toString().replace('</body>',footer+'</body>'));
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(bytes);
}catch(e){res.writeHead(404);res.end(e.message);}}).listen(4441,'127.0.0.1',()=>console.log('Comparison http://127.0.0.1:4441/compare/'));
