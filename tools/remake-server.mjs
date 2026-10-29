// Loopback-only instrumentation. Never copied into the published release.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  dist = path.join(root, "dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1:4398");
      if (url.pathname === "/__remake__/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<!doctype html><html><meta charset="utf-8"><title>Arcade remake verification</title><style>body{font:16px system-ui;background:#e9e8db;color:#19343b;margin:20px}button{font:inherit;padding:12px;margin:5px}iframe{display:block;border:2px solid #456;width:100%;height:720px}pre{white-space:pre-wrap;max-height:260px;overflow:auto}</style><h1>Arcade remake verification</h1><p>Local test instrumentation. Synthetic race control is separate from real input checks.</p><div id="actions"></div><pre id="results">Ready</pre><iframe id="game" src="/" title="Remake game under test"></iframe><script type="module" src="/__remake__/lab.js"></script></html>`,
        );
        return;
      }
      if (url.pathname === "/__remake__/lab.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(await fs.readFile(path.join(root, "tools/remake-lab.js")));
        return;
      }
      if (url.pathname === "/__remake__/receipt" && req.method === "POST") {
        const chunks = [];
        let n = 0;
        for await (const chunk of req) {
          n += chunk.length;
          if (n > 2000000) throw Error("Receipt too large");
          chunks.push(chunk);
        }
        const record = JSON.parse(Buffer.concat(chunks));
        const release = JSON.parse(
          await fs.readFile(path.join(dist, "release.json")),
        );
        if (record.release !== release.release) throw Error("Stale receipt");
        await fs.writeFile(
          path.join(root, "audit/remake-browser.json"),
          JSON.stringify(record, null, 2) + "\n",
        );
        res.end("Saved");
        return;
      }
      if (url.pathname === "/sw.js") {
        res.writeHead(404);
        res.end("Workers tested on the separate uninstrumented origin.");
        return;
      }
      const target = path.resolve(
        dist,
        "." + (url.pathname === "/" ? "/index.html" : url.pathname),
      );
      if (!target.startsWith(dist + path.sep)) throw Error("Outside fixture");
      let bytes = await fs.readFile(target);
      if (target.endsWith(path.sep + "main.js"))
        bytes = Buffer.from(
          bytes.toString() +
            `\nexport const review = {get race(){return race},get world(){return world},get workshop(){return workshop},get settings(){return settings},get progress(){return progress},get store(){return store},get content(){return content},get view(){return view},input,beginRace,startTrack,finish,show,pause,resume,repairGraphics,openWorkshop,applyPreferences,clearInput};\n`,
        );
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(bytes);
    } catch (e) {
      res.writeHead(500);
      res.end(e.message);
    }
  })
  .listen(4398, "127.0.0.1", () =>
    console.log("Remake lab: http://127.0.0.1:4398/__remake__/"),
  );
