import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  verifyRelease,
  verifyCandidateArtifacts,
  sourceIdentity,
  sha,
  SOURCE_DIRS,
  SOURCE_FILES,
} from "../tools/release-gate.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
test("release gate refuses missing asset, stale source, omitted evidence and failed provider gate", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "scrap-gate-"));
  try {
    for (const name of [...SOURCE_DIRS, ...SOURCE_FILES])
      await fs.cp(path.join(root, name), path.join(fixture, name), {
        recursive: true,
      });
    const release = JSON.parse(
      await fs.readFile(path.join(root, "dist/release.json"), "utf8"),
    );
    for (const name of [
      "index.html",
      "sw.js",
      "release.json",
      "native-routes",
      "releases/" + release.release,
    ])
      await fs.cp(
        path.join(root, "dist", name),
        path.join(fixture, "dist", name),
        { recursive: true },
      );
    // Fixture receipts are synthetic and isolated; never written as game acceptance.
    release.sourceHash = (await sourceIdentity(fixture)).hash;
    await fs.writeFile(
      path.join(fixture, "dist/release.json"),
      JSON.stringify(release),
    );
    const candidate = await verifyCandidateArtifacts(fixture);
    await fs.mkdir(path.join(fixture, "audit"));
    await fs.writeFile(
      path.join(fixture, "audit/fixture.txt"),
      "synthetic refusal fixture",
    );
    const requirements = JSON.parse(
      await fs.readFile(path.join(fixture, "requirements.json"), "utf8"),
    );
    const receipt = {
      release: candidate.release,
      sourceHash: candidate.source.hash,
      outputHash: candidate.outputHash,
      requirements: requirements.required.map((r) => ({
        id: r.id,
        status: "passed",
        artifacts: [
          {
            path: "audit/fixture.txt",
            sha256: sha("synthetic refusal fixture"),
          },
        ],
      })),
    };
    const save = () =>
      fs.writeFile(
        path.join(fixture, "audit/current-acceptance.json"),
        JSON.stringify(receipt),
      );
    await save();
    await verifyRelease(fixture, "live");
    receipt.requirements.find((r) => r.id === "P08").status = "failed";
    await save();
    await verifyRelease(fixture, "local");
    await assert.rejects(verifyRelease(fixture, "staged"), /P08/);
    receipt.requirements.find((r) => r.id === "P08").status = "passed";
    receipt.requirements.find((r) => r.id === "J02").artifacts = [];
    await save();
    await assert.rejects(verifyRelease(fixture), /J02/);
    const poster = path.join(
        fixture,
        "dist/releases",
        release.release,
        "social/og-landscape-v1.png",
      ),
      bytes = await fs.readFile(poster);
    await fs.unlink(poster);
    await assert.rejects(verifyRelease(fixture), /ENOENT/);
    await fs.writeFile(poster, bytes);
    await fs.appendFile(
      path.join(fixture, "app/main.js"),
      "\n// changed since build\n",
    );
    await assert.rejects(verifyRelease(fixture), /different source/);
  } finally {
    if (
      !path
        .resolve(fixture)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + "scrap-gate-")
    )
      throw Error("Unsafe fixture cleanup");
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
