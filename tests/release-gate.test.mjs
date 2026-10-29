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
    const inventoryHash = sha(await fs.readFile(path.join(fixture, "requirements.json")));
    await fs.mkdir(path.dirname(path.join(fixture, requirements.governingGuide.snapshot)), { recursive: true });
    await fs.copyFile(path.join(root, requirements.governingGuide.snapshot), path.join(fixture, requirements.governingGuide.snapshot));
    const review = { status: "completed", inventoryHash, sourceHash: candidate.source.hash, outputHash: candidate.outputHash,
      artifact: { path: "audit/fixture.txt", sha256: sha("synthetic refusal fixture") } };
    const receipt = {
      inventoryHash,
      coverageReview: structuredClone(review),
      evidenceReview: structuredClone(review),
      release: candidate.release,
      sourceHash: candidate.source.hash,
      outputHash: candidate.outputHash,
      requirements: requirements.required.map((r) => ({
        id: r.id,
        status: "passed",
        scenarios: r.scenarios?.map(scenario => ({ id: scenario.id, status: "passed",
          artifacts: [{ path: "audit/fixture.txt", sha256: sha("synthetic refusal fixture") }] })),
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
    const scenario = receipt.requirements.find(row => row.id === "J02").scenarios[0];
    scenario.status = "not-run";
    await save();
    await assert.rejects(verifyRelease(fixture, "local"), /Required scenario.*J02/);
    scenario.status = "passed";
    const scenarioArtifact = scenario.artifacts[0];
    scenario.artifacts = [{ ...scenarioArtifact, sha256: "changed" }];
    await save();
    await assert.rejects(verifyRelease(fixture, "local"), /scenario evidence changed.*J02/);
    scenario.artifacts = [scenarioArtifact];
    await save();
    for (const name of ["coverageReview", "evidenceReview"]) {
      const retained = receipt[name];
      receipt[name] = { ...retained, sourceHash: "stale" };
      await save();
      await assert.rejects(verifyRelease(fixture), /pre-promotion review/);
      receipt[name] = retained;
    }
    const retainedInventoryHash = receipt.inventoryHash;
    receipt.inventoryHash = "unreviewed inventory";
    await save();
    await assert.rejects(verifyRelease(fixture), /inventory changed/);
    receipt.inventoryHash = retainedInventoryHash;
    await save();
    receipt.requirements.find((r) => r.id === "P08").status = "failed";
    await save();
    await verifyRelease(fixture, "local");
    await assert.rejects(verifyRelease(fixture, "staged"), /P08/);
    receipt.requirements.find((r) => r.id === "P08").status = "blocked";
    receipt.requirements.find((r) => r.id === "P08").note =
      "No provider procedure";
    await save();
    const authorization = "audit/deployment-authorization-2026-10-16.json";
    const auth = {
      version: 1,
      operation: "publish-candidate",
      origin: "https://hire-poker-8313.onpagelove.com",
      authorizedBy: "Wesley",
      request: "Commit, push, deploy",
      context: "Synthetic authorization fixture only",
      utc: "2026-10-16T16:30:00Z",
      release: candidate.release,
      sourceHash: candidate.source.hash,
      outputHash: candidate.outputHash,
      acceptanceHash: sha(
        await fs.readFile(path.join(fixture, "audit/current-acceptance.json")),
      ),
      knownIncomplete: [
        { id: "P08", status: "blocked", note: "No provider procedure" },
      ],
    };
    await fs.writeFile(path.join(fixture, authorization), JSON.stringify(auth));
    await assert.rejects(verifyRelease(fixture, "staged", authorization), /Required acceptance.*P08/);
    await assert.rejects(verifyRelease(fixture, "staged"), /P08/);
    await fs.appendFile(path.join(fixture, "audit/fixture.txt"), "tampered");
    receipt.requirements.find((r) => r.id === "P08").status = "passed";
    await save();
    await assert.rejects(
      verifyRelease(fixture, "staged"),
      /pre-promotion review|evidence changed/,
    );
    await fs.writeFile(
      path.join(fixture, "audit/fixture.txt"),
      "synthetic refusal fixture",
    );
    await fs.appendFile(
      path.join(fixture, "audit/current-acceptance.json"),
      " ",
    );
    await assert.rejects(
      verifyRelease(fixture, "staged", authorization),
      /exact candidate and ledger/,
    );
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
