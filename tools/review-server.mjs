import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.REVIEW_PORT || 4392);
let offline = false;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1:4392");
      if (url.pathname === "/__review__/mobile.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(await fs.readFile(path.join(root, "tools/mobile-review.js")));
        return;
      }
      if (url.pathname === "/__review__/mobile") {
        const release = JSON.parse(
          await fs.readFile(path.join(root, "dist/release.json"), "utf8"),
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mobile graphics verification</title></head><body style="background:#ece6d5;color:#202721;font:16px system-ui"><h1>Mobile graphics verification</h1><p>Local fault fixtures / <span id="release">${release.release}</span></p><div id="actions"></div><pre id="results" style="white-space:pre-wrap"></pre><iframe id="game" title="Game under test" src="/" style="width:412px;height:915px;border:0"></iframe><script type="module" src="/__review__/mobile.js"></script></body></html>`,
        );
        return;
      }
      if (url.pathname === "/__review__/scorecard" && req.method === "POST") {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2e6) throw Error("Fixture image too large");
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
          throw Error("Expected PNG fixture");
        await fs.writeFile(
          path.join(root, "audit/screenshots/remediation-scorecard.png"),
          bytes,
        );
        res.end("Saved synthetic scorecard fixture");
        return;
      }
      if (url.pathname === "/__review__/network" && req.method === "POST") {
        offline = url.searchParams.get("offline") === "true";
        res.end(JSON.stringify({ offline }));
        return;
      }
      if (url.pathname === "/__review__/receipt" && req.method === "POST") {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4e6) throw Error("Receipt too large");
          chunks.push(chunk);
        }
        const receipt = JSON.parse(Buffer.concat(chunks));
        const release = JSON.parse(
          await fs.readFile(path.join(root, "dist/release.json"), "utf8"),
        );
        if (!/^sl-[a-f0-9]{14}$/.test(receipt.release))
          throw Error("Invalid receipt release");
        await fs.stat(
          path.join(root, "dist/releases", receipt.release, "main.js"),
        );
        await fs.writeFile(
          path.join(root, "audit/remediation-browser-lab.json"),
          JSON.stringify(receipt, null, 2),
        );
        res.end("Saved browser receipt");
        return;
      }
      if (url.pathname === "/__review__/") {
        const release = JSON.parse(
          await fs.readFile(path.join(root, "dist/release.json"), "utf8"),
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Scrap League verification laboratory</title></head><body style="font:16px system-ui;margin:16px;background:#ece6d5;color:#202721"><h1>Scrap League browser verification</h1><p>Isolated local origin. Synthetic storage fixtures only. Current release: <span id="release">${release.release}</span></p><div id="actions"></div><pre id="results" role="status" style="white-space:pre-wrap"></pre><iframe id="game" title="Game under test" src="/" style="width:100%;height:720px;border:1px solid #555"></iframe><script type="module" src="/__review__/lab.js"></script></body></html>`,
        );
        return;
      }
      if (url.pathname === "/__review__/performance.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(await fs.readFile(path.join(root, "tools/performance-lab.js")));
        return;
      }
      if (url.pathname === "/__review__/ui.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(await fs.readFile(path.join(root, "tools/ui-review-lab.js")));
        return;
      }
      if (url.pathname === "/__review__/lab.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(await fs.readFile(path.join(root, "tools/review-lab.js")));
        return;
      }
      if (offline) {
        res.writeHead(503);
        res.end("Review network unavailable");
        return;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (/^\/(editor|track)(\/|$)/.test(pathname)) {
        const release = JSON.parse(
          await fs.readFile(path.join(root, "dist/release.json"), "utf8"),
        );
        const mode = pathname.split("/")[1];
        const entry =
          release.nativeFiles.find((e) => e.url === pathname) ||
          release.nativeFiles.find((e) => e.url === "/" + mode + "/:slug");
        const doc = new DOMParser().parseFromString(
          await fs.readFile(path.join(root, "dist", entry.file), "utf8"),
          "text/html",
        );
        for (const include of doc.querySelectorAll("p\\:include")) {
          const resource = include.getAttribute("resource");
          const base = resource.startsWith("/content/")
            ? root
            : path.join(root, "dist");
          const target = path.resolve(base, "." + resource);
          if (!target.startsWith(path.resolve(base) + path.sep))
            throw Error("Invalid include");
          const source = new DOMParser().parseFromString(
            await fs.readFile(target, "utf8"),
            "text/html",
          );
          const fragment = source.querySelector(
            include.getAttribute("selector"),
          );
          if (!fragment) throw Error("Missing native fragment");
          include.replaceWith(fragment);
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader(
          "X-Review-Scope",
          "local include emulation, not provider acceptance",
        );
        res.end(doc.toString());
        return;
      }
      if (pathname.startsWith("/startup-fault/")) {
        pathname = pathname.slice("/startup-fault".length);
        if (pathname.endsWith("/main.js")) {
          res.writeHead(503);
          res.end("Injected main import failure");
          return;
        }
        if (pathname === "/" || pathname === "/index.html") {
          const html = await fs.readFile(
            path.join(root, "dist/index.html"),
            "utf8",
          );
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            html.replace(
              '<base href="./releases/',
              '<base href="/startup-fault/releases/',
            ),
          );
          return;
        }
      }
      const target = path.resolve(
          root,
          "dist",
          "." + (pathname === "/" ? "/index.html" : pathname),
        ),
        dist = path.resolve(root, "dist");
      if (!target.startsWith(dist + path.sep))
        throw Error("Outside distribution");
      const bytes = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Service-Worker-Allowed": "/",
      });
      res.end(bytes);
    } catch (error) {
      if (!res.headersSent)
        res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(error.message);
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Review laboratory: http://127.0.0.1:${port}/__review__/`),
  );
