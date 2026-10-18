import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { verifyAssets } from "../tools/assets.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
test("declared assets decode, and removing or corrupting a social image fails independently of the generated inventory", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "scrap-assets-"));
  try {
    await cp(path.join(root, "app"), temp, { recursive: true });
    await verifyAssets(root, temp);
    const poster = path.join(temp, "social/og-landscape-v1.png");
    await rm(poster);
    await assert.rejects(verifyAssets(root, temp), /ENOENT/);
    await writeFile(
      poster,
      (
        await readFile(path.join(root, "app/social/og-landscape-v1.png"))
      ).subarray(0, 100),
    );
    await assert.rejects(verifyAssets(root, temp));
  } finally {
    assert.ok(temp.startsWith(path.join(os.tmpdir(), "scrap-assets-")));
    await rm(temp, { recursive: true, force: true });
  }
});
test("initial HTML metadata selects exact public image and missing metadata fails", async () => {
  const release = JSON.parse(
    await readFile(path.join(root, "dist/release.json"), "utf8"),
  );
  const html = await readFile(path.join(root, "dist/index.html"), "utf8");
  const dir = path.join(root, "dist/releases", release.release);
  await verifyAssets(root, dir, { html, release: release.release });
  await assert.rejects(
    verifyAssets(root, dir, {
      html: html.replace('property="og:image"', 'property="removed"'),
      release: release.release,
    }),
    /Missing metadata/,
  );
  assert.ok(!release.offlineFiles.some((x) => x.url.includes("/social/")));
  assert.ok(release.files.some((x) => x.url.includes("/social/og-landscape")));
});
