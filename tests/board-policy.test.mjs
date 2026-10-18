import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { runHTML } from "../app/boards.js";
import {
  BOARD_ORIGIN,
  BOARD_PATHS,
  BOARD_POLICY_REVISION,
  BOARD_RETENTION_MS,
  boardDocument,
  loadOfficialBoardIdentities,
} from "../tools/board-policy.mjs";
import { contentKeys } from "../app/boards.js";
import { loadContent } from "../tools/content.mjs";
import {
  knownLegacyBoardLayout,
  migrateBoardLayout,
  verifyBoardDocument,
} from "../tools/publish-board-resources.mjs";

const identities = await loadOfficialBoardIdentities();
const trackId = Object.keys(identities.tracks)[0];
const record = {
  id: "54a1b928-f3b5-4f47-9f21-a92f95451fc5",
  alias: "A Driver & Co.",
  mode: "trial",
  trackId,
  trackRevision: identities.tracks[trackId],
  rulesRevision: identities.rulesRevision,
  buildRevision: identities.builds[0],
  assist: "steering-off:manual",
  laps: 3,
  challenge: "",
  elapsedMs: 90000,
  splits: [30000, 30000, 30000],
};

function validator(mode) {
  const doc = new DOMParser().parseFromString(
      boardDocument(mode, identities),
      "text/html",
    ),
    trigger = [
      ...doc.querySelectorAll('[itemtype="https://pagelove.org/Trigger"]'),
    ].find((node) =>
      node.querySelector('meta[itemprop="method"][content="POST"]'),
    ),
    source = trigger?.querySelector('script[itemprop="source"]')?.textContent;
  assert.ok(source?.includes("export default function(ctx)"));
  return new Function(
    source.replace("export default function(ctx)", "return function(ctx)"),
  )();
}

function submit(mode, row) {
  return validator(mode)({ request: { body: runHTML(row) } });
}

test("native trigger accepts recognized Trial/Daily runs and checks sum, identity and exact fields", () => {
  assert.equal(submit("trial", record), true);
  assert.equal(
    submit("trial", {
      ...record,
      elapsedMs: 480000,
      splits: [160000, 160000, 160000],
      alias: 'A "quoted" driver',
    }),
    true,
  );
  assert.equal(
    submit("trial", {
      ...record,
      alias: "Driver <& Co>",
    }),
    true,
  );
  const [challenge, daily] = Object.entries(identities.daily)[0];
  const dailyRun = {
    ...record,
    mode: "daily",
    trackId: daily.trackId,
    trackRevision: identities.tracks[daily.trackId],
    buildRevision: daily.buildRevision,
    challenge,
  };
  assert.equal(submit("daily", dailyRun), true);
  for (const [day, spec] of Object.entries(identities.daily))
    assert.equal(
      submit("daily", {
        ...record,
        mode: "daily",
        trackId: spec.trackId,
        trackRevision: identities.tracks[spec.trackId],
        buildRevision: spec.buildRevision,
        challenge: day,
      }),
      true,
      "accepts only the captured official spec for " + day,
    );
  for (const officialTrackId of Object.keys(identities.tracks))
    for (const officialBuildRevision of identities.builds)
      assert.equal(
        submit("trial", {
          ...record,
          trackId: officialTrackId,
          trackRevision: identities.tracks[officialTrackId],
          buildRevision: officialBuildRevision,
        }),
        true,
      );
  assert.throws(
    () => validator("trial")({ request: { body: runHTML(dailyRun) } }),
    { status: 422 },
  );
  const alternate = Object.entries(identities.daily).find(
    ([, spec]) =>
      spec.trackId !== daily.trackId ||
      spec.buildRevision !== daily.buildRevision,
  );
  assert.ok(alternate);
  assert.throws(
    () => submit("daily", { ...dailyRun, challenge: alternate[0] }),
    { status: 422 },
  );
  assert.throws(
    () => submit("trial", { ...record, trackRevision: "f".repeat(64) }),
    { status: 422 },
  );
  assert.throws(
    () => submit("trial", { ...record, buildRevision: "f".repeat(64) }),
    { status: 422 },
  );

  const validate = validator("trial"),
    canonical = runHTML(record),
    context = (body) => ({ request: { body } });
  assert.throws(
    () =>
      validate(
        context(canonical.replace('content="90000"', 'content="90001"')),
      ),
    { status: 422 },
    "splits must sum to elapsed time",
  );
  assert.throws(
    () =>
      validate(
        context(
          canonical.replace(
            "</li>",
            '<meta itemprop="expiresAt" content="1"></li>',
          ),
        ),
      ),
    { status: 422 },
    "client cannot supply server-owned expiry",
  );
  assert.throws(
    () =>
      validate(
        context(
          canonical.replace("<li itemscope", '<li class="extra" itemscope'),
        ),
      ),
    { status: 422 },
    "only one canonical row is accepted",
  );
});

test("native policy identities match the runtime's official track, build and Daily keys", async () => {
  const runtime = await contentKeys(await loadContent());
  assert.deepEqual(identities.tracks, Object.fromEntries(runtime.tracks));
  assert.deepEqual(identities.builds, [...runtime.builds].sort());
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(identities.daily).map(([id, value]) => [
        id,
        { trackId: value.trackId, buildRevision: value.buildRevision },
      ]),
    ),
    Object.fromEntries(runtime.daily),
  );
});

test("board resources are separate and their complete native policy is pinned on both hosts", () => {
  assert.deepEqual(BOARD_PATHS, {
    trial: "/boards/trial.html",
    daily: "/boards/daily.html",
  });
  assert.equal(BOARD_ORIGIN, "https://hire-poker-8313.onpagelove.com");
  assert.equal(BOARD_POLICY_REVISION, "scrap-league-casual-v1");
  assert.equal(BOARD_RETENTION_MS, 5 * 86400000);
  for (const mode of ["trial", "daily"]) {
    const html = boardDocument(mode, identities),
      doc = new DOMParser().parseFromString(html, "text/html");
    assert.ok(doc.querySelector("ul#runs"));
    assert.equal(
      doc.documentElement.getAttribute("xmlns:p"),
      "https://pagelove.org/1.0",
    );
    assert.equal(
      doc.querySelector("ul#runs").getAttribute("p:paginate"),
      "100",
    );
    assert.equal(
      doc.querySelector("ul#runs").getAttribute("xmlns:p"),
      null,
    );
    assert.ok(
      doc.querySelector(
        'meta[itemprop="resource"][content="' + BOARD_PATHS[mode] + '"]',
      ),
    );
    const shapePermits = [
      ...doc.querySelectorAll(
        '[itemtype="https://pagelove.org/ShapeConstraint"] code[itemprop="permit"]',
      ),
    ].map((permit) => permit.textContent);
    assert.ok(
      shapePermits.includes(String.raw`ul[id="runs"][p\:paginate="100"]`),
      "shape policy explicitly allows the paginator attribute on its list",
    );
    assert.ok(
      doc.querySelector(
        'meta[name="scrap-league-board-policy"][content="' +
          BOARD_POLICY_REVISION +
          '"]',
      ),
    );
    assert.ok(doc.querySelector('[itemtype="https://pagelove.org/Schema"]'));
    assert.ok(doc.querySelector('[itemtype="https://pagelove.org/Processor"]'));
    assert.match(html, /Only expired times can be removed/);
    assert.match(html, /Date\.now\(\) \+ 432000000/);
    assert.equal(verifyBoardDocument(html, mode).rows, 0);
    const composed = html
      .replace(' xmlns:p="https://pagelove.org/1.0"', "")
      .replace(' p:paginate="100"', "");
    assert.equal(verifyBoardDocument(composed, mode, { composed: true }).rows, 0);
    assert.throws(
      () => verifyBoardDocument(composed, mode),
      /differs/,
      "owner-authored source must retain explicit pagination",
    );
    assert.throws(
      () =>
        verifyBoardDocument(
          composed.replace("<ul id=\"runs\"", '<ul id="runs" p:paginate="10"'),
          mode,
          { composed: true },
        ),
      /differs/,
      "public composition must not change a surviving paginator",
    );
    assert.throws(
      () =>
        verifyBoardDocument(
          html.replace(
            "Submit one valid official Scrap League run.",
            "Changed validator.",
          ),
          mode,
        ),
      /differs/,
    );
    assert.throws(
      () =>
        verifyBoardDocument(
          html.replace('xmlns:p="https://pagelove.org/1.0"', 'xmlns:p="https://attacker.invalid/ns"'),
          mode,
        ),
      /differs/,
      "owner source must pin the pagination namespace",
    );
  }
});

test("board policy migrations retain all rows and recognize only the two known prior layouts", () => {
  for (const mode of ["trial", "daily"]) {
    const [challenge, daily] = Object.entries(identities.daily)[0],
      row = runHTML(
        mode === "daily"
          ? {
              ...record,
              mode,
              trackId: daily.trackId,
              trackRevision: identities.tracks[daily.trackId],
              buildRevision: daily.buildRevision,
              challenge,
            }
          : record,
      ),
      withRow = (html) => html.replace("</ul>", row + "</ul>"),
      legacyRoot = withRow(
        boardDocument(mode, identities, {
          allowPaginatorAttribute: false,
          compactIdentityPayload: false,
        }),
      ),
      legacyListNamespace = withRow(
        boardDocument(mode, identities, {
          namespaceOnRoot: false,
          allowPaginatorAttribute: false,
          compactIdentityPayload: false,
        }),
      ),
      legacyExpanded = withRow(
        boardDocument(mode, identities, {
          compactIdentityPayload: false,
        }),
      );
    assert.equal(
      knownLegacyBoardLayout(legacyRoot, mode),
      "legacy-missing-pagination-shape-permit",
    );
    assert.equal(
      knownLegacyBoardLayout(legacyListNamespace, mode),
      "legacy-pagination-namespace",
    );
    assert.equal(
      knownLegacyBoardLayout(legacyExpanded, mode),
      "legacy-expanded-validator",
    );
    for (const legacy of [legacyRoot, legacyListNamespace, legacyExpanded]) {
      const migrated = migrateBoardLayout(legacy, mode);
      assert.equal(verifyBoardDocument(migrated, mode).rows, 1);
      assert.ok(migrated.includes(row));
    }
    assert.equal(knownLegacyBoardLayout("<html><body></body></html>", mode), null);
  }
});
