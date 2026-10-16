import test from "node:test";
import assert from "node:assert/strict";
import { equivalent, publicEquivalent } from "../tools/deploy-pagelove.mjs";

test("HTML publication tolerates serialization but rejects changed runtime references", () => {
  const a = Buffer.from(
    '<!doctype html><html lang="en"><head><base href="./releases/sl-a/"><title>Scrap League</title></head><body><p>A &amp; B</p><script src="main.js"></script></body></html>',
  );
  const b = Buffer.from(
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">\n<head><base href="./releases/sl-a/"/><title>Scrap League</title></head><body><p>A &amp; B</p><script src="main.js"></script></body></html>',
  );
  assert.equal(equivalent("/index.html", a, b), true);
  assert.equal(
    equivalent(
      "/index.html",
      a,
      Buffer.from(b.toString().replace("sl-a/", "sl-b/")),
    ),
    false,
  );
  assert.equal(
    equivalent(
      "/index.html",
      a,
      Buffer.from(b.toString().replace("main.js", "other.js")),
    ),
    false,
  );
});

test("publication identity preserves executable text and exact non-HTML bytes", () => {
  const a = Buffer.from(
    '<html><head><script>const value="a  b";</script></head><body></body></html>',
  );
  assert.equal(
    equivalent(
      "/index.html",
      a,
      Buffer.from(a.toString().replace("a  b", "a b")),
    ),
    false,
  );
  assert.equal(
    equivalent("/main.js", Buffer.from("x=1;"), Buffer.from("x=2;")),
    false,
  );
  assert.equal(
    equivalent("/main.js", Buffer.from("x=1;"), Buffer.from("x=1;")),
    true,
  );
});

test("public identity permits only the observed Pagelove footer and keeps authoring strict", () => {
  const a = Buffer.from(
    "<html><head><title>Track</title></head><body><article>Geometry</article></body></html>",
  );
  const footer =
    '<div style="position: fixed;bottom: 0;left: 0;right: 0;padding: 8px;background: #f0f0f0;text-align: center;font-size: 12px;color: #666;z-index: 9999;opacity: 0.8;border-top: 1px solid #ddd;">Powered by <a href="https://pagelove.com/" style="color: #4a90d9; text-decoration: none">Pagelove</a></div>';
  const live = Buffer.from(a.toString().replace("</body>", footer + "</body>"));
  assert.equal(publicEquivalent("/track.html", a, live), true);
  assert.equal(equivalent("/track.html", a, live), false);
  assert.equal(
    publicEquivalent(
      "/track.html",
      a,
      Buffer.from(live.toString().replace("Geometry", "Changed")),
    ),
    false,
  );
  assert.equal(
    publicEquivalent(
      "/track.html",
      a,
      Buffer.from(
        live
          .toString()
          .replace("Powered by", "<script>alert(1)</script>Powered by"),
      ),
    ),
    false,
  );
  assert.equal(
    publicEquivalent(
      "/track.html",
      a,
      Buffer.from(
        live
          .toString()
          .replace("https://pagelove.com/", "https://other.example/"),
      ),
    ),
    false,
  );
});
