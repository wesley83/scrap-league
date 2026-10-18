import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicationAuthorization } from "../tools/candidate-publication.mjs";
import { sha } from "../tools/release-gate.mjs";
import { HOST_CONFIG } from "../app/pagelove.js";

test("publication receipts bind identity and destination but cannot authorize unresolved acceptance", () => {
  const candidate = {
    release: "sl-aaaaaaaaaaaaaa",
    source: { hash: "source" },
    outputHash: "output",
  };
  const receipt = {
    requirements: [
      {
        id: "J01",
        status: "partial",
        note: "Complete browser journey pending",
        artifacts: [],
      },
      {
        id: "P08",
        status: "blocked",
        note: "No supported provider procedure",
        artifacts: [],
      },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(receipt));
  const host = {
    publicOrigin: "https://hire-poker-8313.onpagelove.com",
    publicBoards: HOST_CONFIG.publicBoards,
  };
  const auth = {
    version: 1,
    operation: "publish-candidate",
    origin: host.publicOrigin,
    authorizedBy: "Wesley",
    request: "There is no meaningful reason not to have a leaderboard",
    context: "Explicit request after incomplete verification was disclosed",
    utc: "2026-10-16T16:30:00Z",
    release: candidate.release,
    sourceHash: candidate.source.hash,
    outputHash: candidate.outputHash,
    acceptanceHash: sha(bytes),
    knownIncomplete: receipt.requirements.map(({ id, status, note }) => ({
      id,
      status,
      note,
    })),
  };
  assert.throws(
    () => validatePublicationAuthorization(
        auth,
        candidate,
        receipt,
        bytes,
        host,
      ),
    /Unresolved required acceptance/,
  );
  assert.equal(receipt.requirements[0].status, "partial");
  const resolved = { requirements: receipt.requirements.map((row) => ({ ...row, status: "passed" })) };
  const resolvedBytes = Buffer.from(JSON.stringify(resolved));
  assert.deepEqual([...validatePublicationAuthorization(
    { ...auth, acceptanceHash: sha(resolvedBytes), knownIncomplete: [] }, candidate,
    resolved, resolvedBytes, host,
  )], []);
  for (const changed of [
    { ...auth, sourceHash: "stale" },
    { ...auth, outputHash: "stale" },
    { ...auth, acceptanceHash: "stale" },
    { ...auth, release: "sl-bbbbbbbbbbbbbb" },
    { ...auth, origin: "https://other.example" },
    { ...auth, knownIncomplete: auth.knownIncomplete.slice(0, 1) },
    {
      ...auth,
      knownIncomplete: auth.knownIncomplete.map((r) => ({
        ...r,
        note: "changed",
      })),
    },
  ])
    assert.throws(() =>
      validatePublicationAuthorization(
        changed,
        candidate,
        receipt,
        bytes,
        host,
      ),
    );
  for (const publicBoards of [
    null,
    {
      ...HOST_CONFIG.publicBoards,
      paths: { trial: "/other.html", daily: "/boards/daily.html" },
    },
  ])
    assert.throws(
      () =>
        validatePublicationAuthorization(auth, candidate, receipt, bytes, {
          ...host,
          publicBoards,
        }),
      /casual-board policy paths/,
    );
  const failed = structuredClone(receipt);
  failed.requirements[0].status = "failed";
  const failedBytes = Buffer.from(JSON.stringify(failed));
  assert.throws(
    () =>
      validatePublicationAuthorization(
        { ...auth, acceptanceHash: sha(failedBytes) },
        candidate,
        failed,
        failedBytes,
        host,
      ),
    /Failed acceptance/,
  );
});
