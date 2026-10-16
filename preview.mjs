// Local-only preview of the design package. No game/publishing service.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SCRAP_DESIGN_PORT || 4387);
const types = {'.html':'text/html; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/design-review.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end('Outside preview directory'); return; }
    if (!(await stat(target)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(target));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,'127.0.0.1',() => process.stdout.write(`Scrap League design preview: http://127.0.0.1:${port}\n`));
