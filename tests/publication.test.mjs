import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { loadContent } from "../tools/content.mjs";
import {
  catalogDocument,
  parseCatalog,
  listTrack,
  publishOwnerTrack,
  loadOwnerTrack,
} from "../app/publication.js";
import { serializeTrack, gameplay, hash } from "../app/model.js";
const track = (await loadContent()).tracks[0].track,
  revision = await hash(gameplay(track));
const entry = { id: track.id, slug: track.slug, name: track.name, revision };
test("catalog replacement preserves unknown owner content by refusing the write", async () => {
  for (const extra of [
    '<script type="text/authorization">policy</script>',
    "<p>Owner notes</p>",
    "<!-- preserve me -->",
  ]) {
    let writes = 0;
    const html = catalogDocument([entry]).replace("</body>", extra + "</body>");
    assert.equal(parseCatalog(html, DOMParser).length, 1);
    await assert.rejects(
      listTrack(track, revision, "fixture", {
        Parser: DOMParser,
        fetcher: async (url, opts) => {
          if (opts.method === "PUT") writes++;
          return new Response(html, { headers: { ETag: '"v1"' } });
        },
      }),
      /unsupported owner content/,
    );
    assert.equal(writes, 0);
  }
});
test("listing timeout after acceptance reconciles once with the original identity", async () => {
  let html = catalogDocument([]),
    writes = 0;
  const got = await listTrack(track, revision, "fixture", {
    Parser: DOMParser,
    fetcher: async (url, opts) => {
      assert.equal(opts.redirect, "error");
      if (opts.method === "PUT") {
        writes++;
        assert.equal(opts.headers["If-Match"], '"v1"');
        html = opts.body;
        throw Error("accepted but response lost");
      }
      return new Response(html, { headers: { ETag: '"v1"' } });
    },
  });
  assert.deepEqual(got, entry);
  assert.equal(writes, 1);
});
test("publication remains acknowledged with exact playable link when catalog fails", async () => {
  let html = null;
  const got = await publishOwnerTrack(track, "pk_fixture", null, {
    Parser: DOMParser,
    fetcher: async (url, opts) => {
      if (opts.method === "MKCOL") return new Response(null, { status: 201 });
      if (url.endsWith("/catalog.html"))
        return new Response(null, { status: 503 });
      if (opts.method === "PUT") {
        html = opts.body;
        return new Response(null, { status: 201 });
      }
      return html
        ? new Response(html, { headers: { ETag: '"v1"' } })
        : new Response(null, { status: 404 });
    },
  });
  assert.equal(got.state, "Published");
  assert.equal(got.listed, false);
  assert.ok(got.url.endsWith("#workshop=" + track.id));
  assert.equal(got.revision, revision);
});
test("owner read includes revision needed for later listing retry", async () => {
  const got = await loadOwnerTrack(track.id, "fixture", {
    Parser: DOMParser,
    fetcher: async () =>
      new Response(serializeTrack(track), { headers: { ETag: '"v1"' } }),
  });
  assert.equal(got.revision, revision);
});
