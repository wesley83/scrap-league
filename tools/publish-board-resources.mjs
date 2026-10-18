import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import {
  BOARD_ORIGIN,
  BOARD_PATHS,
  boardDocument,
  loadOfficialBoardIdentities,
} from "./board-policy.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const identities = await loadOfficialBoardIdentities();
const davOrigin = "https://dav-hire-poker-8313.onpagelove.com";
const types = new Set([
  "https://pagelove.org/AuthorizationRule",
  "https://pagelove.org/ShapeConstraint",
  "https://pagelove.org/Schema",
  "https://pagelove.org/Property",
  "https://pagelove.org/Trigger",
  "https://pagelove.org/Processor",
]);
let ownerKey = "";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function url(origin, pathname) {
  return new URL(pathname, origin).href;
}
async function request(origin, pathname, options = {}) {
  return fetch(url(origin, pathname), {
    ...options,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}
function fingerprint(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rules = [...doc.querySelectorAll("[itemscope][itemtype]")]
    .filter((node) => types.has(node.getAttribute("itemtype")))
    .map((node) => ({
      type: node.getAttribute("itemtype"),
      fields: [...node.querySelectorAll("meta[itemprop]")].map((meta) => [
        meta.getAttribute("itemprop"),
        meta.getAttribute("content"),
        meta.getAttribute("name"),
      ]),
      code: [...node.querySelectorAll("code[itemprop]")].map((element) => [
        element.getAttribute("itemprop"),
        element.textContent,
      ]),
      sources: [...node.querySelectorAll("script[itemprop='source']")].map(
        (element) => [element.getAttribute("type"), element.textContent],
      ),
    }));
  return JSON.stringify(rules);
}
function policySummary(html, mode) {
  const doc = new DOMParser().parseFromString(html, "text/html"),
    expected = new DOMParser().parseFromString(
      boardDocument(mode, identities),
      "text/html",
    ),
    typeRows = (source) =>
      Object.fromEntries(
        [...types].map((type) => {
          const rows = [...source.querySelectorAll("[itemscope][itemtype]")]
            .filter((node) => node.getAttribute("itemtype") === type)
            .map((node) => ({
              fields: [...node.querySelectorAll("meta[itemprop]")].map(
                (meta) => [
                  meta.getAttribute("itemprop"),
                  meta.getAttribute("content"),
                  meta.getAttribute("name"),
                ],
              ),
              code: [...node.querySelectorAll("code[itemprop]")].map(
                (element) => [
                  element.getAttribute("itemprop"),
                  element.textContent,
                ],
              ),
              sources: [...node.querySelectorAll('script[itemprop="source"]')].map(
                (element) => [element.getAttribute("type"), element.textContent],
              ),
            }));
          return [type, { count: rows.length, sha256: sha256(JSON.stringify(rows)) }];
        }),
      ),
    list = doc.querySelector("ul#runs"),
    rootNamespace = doc.documentElement.getAttribute("xmlns:p");
  return {
    revision:
      doc.querySelector('meta[name="scrap-league-board-policy"]')?.getAttribute("content") || null,
    rows: list?.querySelectorAll(":scope > li").length ?? null,
    rootNamespace,
    list: list
      ? {
          id: list.getAttribute("id"),
          pagination: list.getAttribute("p:paginate"),
          namespace: list.getAttribute("xmlns:p"),
        }
      : null,
    rules: typeRows(doc),
    expectedRules: typeRows(expected),
    policyMatches: fingerprint(html) === fingerprint(boardDocument(mode, identities)),
    legacyPolicyMatches:
      fingerprint(html) === fingerprint(legacyShapeDocument(mode)),
    legacyLayout: knownLegacyBoardLayout(html, mode),
  };
}
export function verifyBoardDocument(html, mode, { composed = false } = {}) {
  const doc = new DOMParser().parseFromString(html, "text/html"),
    marker = doc.querySelector('meta[name="scrap-league-board-policy"]'),
    list = doc.querySelector("ul#runs"),
    rootNamespace = doc.documentElement.getAttribute("xmlns:p");
  const namespaceValid = composed
      ? rootNamespace === "https://pagelove.org/1.0" || !rootNamespace
      : rootNamespace === "https://pagelove.org/1.0",
    paginationValid = composed
      ? list?.getAttribute("p:paginate") === "100" ||
        !list?.hasAttribute("p:paginate")
      : list?.getAttribute("p:paginate") === "100";
  if (
    marker?.getAttribute("content") !== "scrap-league-casual-v1" ||
    !list ||
    !namespaceValid ||
    !paginationValid ||
    fingerprint(html) !== fingerprint(boardDocument(mode, identities))
  )
    throw Error("The existing board policy differs; refusing to replace it.");
    return { rows: list.querySelectorAll(":scope > li").length };
}
function docRows(html) {
  return new DOMParser()
    .parseFromString(html, "text/html")
    .querySelectorAll("ul#runs > li").length;
}
function legacyShapeDocument(mode) {
  return boardDocument(mode, identities, {
    allowPaginatorAttribute: false,
    compactIdentityPayload: false,
  });
}
export function diagnoseBoardDocument(html, mode) {
  const actual = JSON.parse(fingerprint(html)),
    expected = JSON.parse(fingerprint(legacyShapeDocument(mode))),
    summarize = (rows) =>
      Object.fromEntries(
        [...types].map((type) => {
          const scoped = rows.filter((row) => row.type === type);
          return [type, { count: scoped.length, sha256: sha256(JSON.stringify(scoped)) }];
        }),
      ),
    doc = new DOMParser().parseFromString(html, "text/html"),
    list = doc.querySelector("ul#runs");
  return {
    rootNamespace: doc.documentElement.getAttribute("xmlns:p"),
    listNamespace: list?.getAttribute("xmlns:p") ?? null,
    pagination: list?.getAttribute("p:paginate") ?? null,
    actual: summarize(actual),
    expected: summarize(expected),
  };
}
function legacyPaginationNamespace(html, mode) {
  const doc = new DOMParser().parseFromString(html, "text/html"),
    list = doc.querySelector("ul#runs");
  return (
    !doc.documentElement.hasAttribute("xmlns:p") &&
    list?.getAttribute("xmlns:p") === "https://pagelove.org/1.0" &&
    list.getAttribute("p:paginate") === "100" &&
    fingerprint(html) === fingerprint(legacyShapeDocument(mode))
  );
}
function legacyRootPagination(html, mode) {
  const doc = new DOMParser().parseFromString(html, "text/html"),
    list = doc.querySelector("ul#runs");
  return (
    doc.documentElement.getAttribute("xmlns:p") ===
      "https://pagelove.org/1.0" &&
    !list?.hasAttribute("xmlns:p") &&
    list?.getAttribute("p:paginate") === "100" &&
    fingerprint(html) === fingerprint(legacyShapeDocument(mode))
  );
}
function legacyExpandedValidator(html, mode) {
  const doc = new DOMParser().parseFromString(html, "text/html"),
    list = doc.querySelector("ul#runs");
  return (
    doc.documentElement.getAttribute("xmlns:p") ===
      "https://pagelove.org/1.0" &&
    !list?.hasAttribute("xmlns:p") &&
    list?.getAttribute("p:paginate") === "100" &&
    fingerprint(html) ===
      fingerprint(
        boardDocument(mode, identities, { compactIdentityPayload: false }),
      )
  );
}
export function knownLegacyBoardLayout(html, mode) {
  if (legacyPaginationNamespace(html, mode)) return "legacy-pagination-namespace";
  if (legacyRootPagination(html, mode))
    return "legacy-missing-pagination-shape-permit";
  if (legacyExpandedValidator(html, mode))
    return "legacy-expanded-validator";
  return null;
}
export function migrateBoardLayout(html, mode) {
  let migrated = html;
  if (legacyPaginationNamespace(migrated, mode))
    migrated = migrated
      .replace(
        '<html lang="en">',
        '<html lang="en" xmlns:p="https://pagelove.org/1.0">',
      )
      .replace(
        '<ul id="runs" xmlns:p="https://pagelove.org/1.0" p:paginate="100">',
        '<ul id="runs" p:paginate="100">',
      );
  const needsShapePermit = legacyRootPagination(migrated, mode),
    alreadyAllowsPaginator = legacyExpandedValidator(migrated, mode);
  if (!needsShapePermit && !alreadyAllowsPaginator)
    throw Error("Board source no longer matches a known prior pagination policy.");
  const oldPermit = '<code itemprop="permit">ul[id="runs"]</code>',
    newPermit =
      oldPermit +
      '<code itemprop="permit">ul[id="runs"][p\\:paginate="100"]</code>';
  if (needsShapePermit) {
    if (!migrated.includes(oldPermit))
      throw Error("Expected board container permit is missing.");
    migrated = migrated.replace(oldPermit, newPermit);
  }
  const sourceOf = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html"),
        trigger = [...doc.querySelectorAll('[itemtype="https://pagelove.org/Trigger"]')].find(
          (node) =>
            node.querySelector('meta[itemprop="method"][content="POST"]'),
        );
      return trigger?.querySelector('script[itemprop="source"]')?.textContent;
    },
    legacyTrigger = sourceOf(legacyShapeDocument(mode)),
    currentTrigger = sourceOf(boardDocument(mode, identities));
  if (
    !legacyTrigger ||
    !currentTrigger ||
    !migrated.includes(legacyTrigger)
  )
    throw Error("Expected prior validator source is missing.");
  migrated = migrated.replace(legacyTrigger, currentTrigger);
  verifyBoardDocument(migrated, mode);
  return migrated;
}
async function readOwner(pathname) {
  return request(davOrigin, pathname, {
    headers: { Authorization: "Bearer " + ownerKey },
  });
}
async function readPublic(pathname, query = "") {
  return request(BOARD_ORIGIN, pathname + query);
}
async function inspect() {
  if (!ownerKey) throw Error("Authenticate first.");
  const result = [];
  for (const mode of Object.keys(BOARD_PATHS)) {
    const pathname = BOARD_PATHS[mode],
      owner = await readOwner(pathname),
      publicPage = await readPublic(
        pathname,
        "?paginate:runs:page=1&paginate:runs:length=100",
      ),
      describe = async (response) => {
        const html = await response.text(),
          doc = new DOMParser().parseFromString(html, "text/html");
        if (!response.ok)
          return {
            status: response.status,
            contentType: response.headers.get("Content-Type"),
            bodyPreview: html.slice(0, 350),
          };
        return {
          status: response.status,
          etag: response.headers.get("ETag"),
          contentType: response.headers.get("Content-Type"),
          link: response.headers.get("Link"),
          navigation: [...doc.querySelectorAll("head link[rel]")].map(
            (link) => ({
              rel: link.getAttribute("rel"),
              href: link.getAttribute("href"),
            }),
          ),
          ...(policySummary(html, mode)),
        };
      };
    result.push({ mode, owner: await describe(owner), public: await describe(publicPage) });
  }
  return { origin: BOARD_ORIGIN, policyRevision: "scrap-league-casual-v1", boards: result };
}
async function authenticate(key) {
  if (typeof key !== "string" || !key.startsWith("pk_"))
    throw Error("Provide the Pagelove owner key through hidden input.");
  ownerKey = key;
  const probe = await request(davOrigin, "/", {
    method: "PROPFIND",
    headers: { Authorization: "Bearer " + ownerKey, Depth: "0" },
  });
  if (probe.status !== 207)
    throw Error("Pagelove owner authentication failed.");
  return { authenticated: true, origin: BOARD_ORIGIN };
}
async function provision() {
  if (!ownerKey) throw Error("Authenticate first.");
  const modes = Object.keys(BOARD_PATHS),
    baselines = new Map();
  for (const mode of modes) {
    const pathname = BOARD_PATHS[mode],
      response = await readOwner(pathname);
    if (response.status === 404) baselines.set(mode, null);
    else if (response.ok) {
      const existing = await response.text();
      try {
        baselines.set(mode, {
          ...verifyBoardDocument(existing, mode),
          etag: response.headers.get("ETag"),
          html: existing,
          state: "current",
        });
      } catch {
        const state = knownLegacyBoardLayout(existing, mode);
        if (!state)
          throw Error("The existing board policy differs; refusing to replace it.");
        baselines.set(mode, {
          rows: docRows(existing),
          etag: response.headers.get("ETag"),
          html: existing,
          state,
        });
      }
      if (!baselines.get(mode).etag)
        throw Error("Owner board readback lacks an ETag.");
    } else
      throw Error("Could not read " + pathname + " (" + response.status + ").");
  }
  if ([...baselines.values()].some((value) => value === null)) {
    const directory = await request(davOrigin, "/boards/", {
      method: "MKCOL",
      headers: { Authorization: "Bearer " + ownerKey },
    });
    if (![201, 405].includes(directory.status))
      throw Error(
        "Could not prepare the boards directory (" + directory.status + ").",
      );
  }
  const outcomes = [];
  for (const mode of modes) {
    const pathname = BOARD_PATHS[mode],
      prior = baselines.get(mode);
    if (prior) {
      let outcomeState = "already-provisioned";
      if (prior.state.startsWith("legacy-")) {
        const migrated = migrateBoardLayout(prior.html, mode),
          directory = path.join(root, ".local", "board-policy-baselines");
        await fs.mkdir(directory, { recursive: true });
        const backup = path.join(
          directory,
          new Date().toISOString().replace(/[:.]/g, "-") + "-" + mode + ".html",
        );
        await fs.writeFile(backup, prior.html, { mode: 0o600 });
        const write = await request(davOrigin, pathname, {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + ownerKey,
            "Content-Type": "text/html; charset=utf-8",
            "If-Match": prior.etag,
          },
          body: migrated,
        });
        if (!write.ok)
          throw Error("Conditional pagination metadata migration refused (" + write.status + ").");
        const owner = await readOwner(pathname);
        if (!owner.ok) throw Error("Owner readback failed after pagination migration.");
        verifyBoardDocument(await owner.text(), mode);
        outcomeState = "migrated-shape-safe-pagination-preserving-rows";
      }
      const publicPage = await readPublic(pathname);
      if (!publicPage.ok)
        throw Error("Public readback failed for " + pathname + ".");
      const check = verifyBoardDocument(await publicPage.text(), mode, {
        composed: true,
      });
      outcomes.push({
        path: pathname,
        state: outcomeState,
        rowsPreserved: check.rows,
      });
      continue;
    }
    const source = Buffer.from(boardDocument(mode, identities)),
      write = await request(davOrigin, pathname, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + ownerKey,
          "Content-Type": "text/html; charset=utf-8",
          "If-None-Match": "*",
        },
        body: source,
      });
    if (!write.ok) {
      const reconciled = await readOwner(pathname);
      if (!reconciled.ok)
        throw Error(
          "Conditional board creation failed (" + write.status + ").",
        );
      verifyBoardDocument(await reconciled.text(), mode);
    }
    const owner = await readOwner(pathname);
    if (!owner.ok) throw Error("Owner readback failed for " + pathname + ".");
    verifyBoardDocument(await owner.text(), mode);
    const publicPage = await readPublic(pathname);
    if (!publicPage.ok)
      throw Error("Public readback failed for " + pathname + ".");
    const publicResult = verifyBoardDocument(await publicPage.text(), mode, {
      composed: true,
    });
    outcomes.push({
      path: pathname,
      state: "created",
      sourceSha256: sha256(source),
      publicRowsPreserved: publicResult.rows,
      publicStatus: publicPage.status,
    });
  }
  const receipt = {
    utc: new Date().toISOString(),
    origin: BOARD_ORIGIN,
    policyRevision: "scrap-league-casual-v1",
    outcomes,
    scope:
      "Two isolated public collections; create-only DAV writes; existing records are never replaced",
  };
  const file = path.join(
    root,
    "audit",
    "boards-provisioning-" + receipt.utc.replace(/[:.]/g, "-") + ".json",
  );
  await fs.writeFile(file, JSON.stringify(receipt, null, 2));
  return {
    ...receipt,
    receipt: path.relative(root, file).replaceAll("\\", "/"),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  let buffer = "",
    busy = false;
  console.log("Ready for hidden JSON input: auth, inspect, provision, quit.");
  process.stdin.on("data", async (chunk) => {
    if (chunk.includes("\u0003")) process.exit(0);
    buffer += chunk;
    const boundary = buffer.search(/[\r\n]/);
    if (boundary < 0) return;
    const line = buffer.slice(0, boundary).trim();
    buffer = buffer.slice(boundary + 1);
    if (!line) return;
    if (busy) {
      console.log(
        JSON.stringify({ error: "An operation is already running." }),
      );
      return;
    }
    busy = true;
    try {
      const command = JSON.parse(line);
      if (command.op === "quit") {
        ownerKey = "";
        process.exit(0);
      }
      const result =
        command.op === "auth"
          ? await authenticate(command.key)
          : command.op === "inspect"
            ? await inspect()
          : command.op === "provision"
            ? await provision()
            : (() => {
                throw Error("Unsupported operation.");
              })();
      console.log(JSON.stringify(result));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    } finally {
      busy = false;
    }
  });
}
