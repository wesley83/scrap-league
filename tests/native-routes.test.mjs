import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { readFile } from "node:fs/promises";
import { loadContent } from "../tools/content.mjs";
import { nativeResources } from "../tools/native-resources.mjs";
test("native routes use explicit source fragments and an inert unknown-slug chooser without server JavaScript", async () => {
  const bundle = await loadContent(),
    index = await readFile(
      new URL("../app/index.html", import.meta.url),
      "utf8",
    ),
    files = nativeResources(index, "sl-aaaaaaaaaaaaaa", bundle);
  assert.equal(files.length, 29);
  assert.equal(new Set(files.map((f) => f.url)).size, 29);
  const shell = new DOMParser().parseFromString(files[0].text, "text/html");
  const rootDocument = new DOMParser().parseFromString(index, "text/html");
  assert.deepEqual(
    [...shell.querySelectorAll('#game-shell link[rel="stylesheet"]')].map(
      (link) => link.getAttribute("href"),
    ),
    [...rootDocument.querySelectorAll('head link[rel="stylesheet"]')].map(
      (link) => "/releases/sl-aaaaaaaaaaaaaa/" + link.getAttribute("href"),
    ),
    "Native composition must preserve every stylesheet and its cascade order",
  );
  assert.equal(
    shell.querySelector("#game-shell script").getAttribute("src"),
    "/releases/sl-aaaaaaaaaaaaaa/bootstrap.js",
  );
  assert.equal(
    shell.querySelectorAll("#game-shell #screen-workshop").length,
    1,
  );
  for (const f of files.slice(1)) {
    const doc = new DOMParser().parseFromString(f.text, "text/html");
    assert.equal(
      doc
        .querySelector(
          '[resource="/releases/sl-aaaaaaaaaaaaaa/native-shell.html"]',
        )
        .getAttribute("selector"),
      "#game-shell",
    );
    assert.equal(
      doc.querySelectorAll(
        '[itemtype="https://pagelove.org/JavaScript/Module"]',
      ).length,
      0,
    );
    const source = doc.querySelector("#routed-track [resource]");
    if (f.url.endsWith(":slug") || f.url.endsWith("/index.html"))
      assert.equal(source, null);
    else {
      assert.equal(source.getAttribute("selector"), "article");
      assert.ok(
        bundle.catalog.some(
          (c) => "/content/" + c.path === source.getAttribute("resource"),
        ),
      );
    }
  }
});
