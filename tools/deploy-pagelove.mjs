import { verifyRelease } from "./release-gate.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { restoreRoot } from "./rollback.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const origin = "https://hire-poker-8313.onpagelove.com";
const dav = "https://dav-hire-poker-8313.onpagelove.com";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const types = {
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};
let key = "",
  baseline = new Map(),
  backupDirectory = "",
  authenticated = false;
let rollbackPlan = null;
async function prepareRollback(id) {
  if (
    !authenticated ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(id)
  )
    throw Error("Authenticate and choose an existing baseline directory.");
  const directory = path.join(root, ".local/deployment-baselines", id),
    meta = JSON.parse(
      await fs.readFile(path.join(directory, "baseline.json"), "utf8"),
    );
  if (meta.origin !== origin || meta.dav !== dav)
    throw Error("Rollback baseline belongs to another host.");
  const entries = [];
  for (const name of ["/index.html", "/release.json", "/sw.js"]) {
    const saved = meta.entries.find((e) => e.path === name),
      bytes = await fs.readFile(path.join(directory, name.slice(1))),
      current = await read(name);
    if (
      saved?.status !== 200 ||
      sha(bytes) !== saved.sha256 ||
      current.status !== 200 ||
      !current.etag
    )
      throw Error("Incomplete rollback baseline: " + name);
    entries.push({
      path: name,
      bytes,
      hash: sha(bytes),
      etag: current.etag,
      currentHash: sha(current.bytes),
    });
  }
  const previous = JSON.parse(
    entries.find((e) => e.path === "/release.json").bytes,
  );
  for (const file of previous.files.filter((f) => f.url !== "./")) {
    if (
      !/^\.\/releases\/sl-[a-f0-9]{14}\/[a-zA-Z0-9_./-]+$/.test(file.url) ||
      file.url.includes("..")
    )
      throw Error("Invalid old dependency.");
    const live = await read(file.url.slice(1), true);
    if (live.status !== 200 || sha(live.bytes) !== file.hash)
      throw Error("Old dependency unavailable: " + file.url);
  }
  rollbackPlan = { id, release: previous.release, entries };
  return {
    prepared: true,
    baseline: id,
    release: previous.release,
    entries: entries.map((e) => ({
      path: e.path,
      currentHash: e.currentHash,
      targetHash: e.hash,
    })),
    scope:
      "Three root entries only; native routes, user documents and immutable releases retained",
  };
}
async function rollback() {
  if (!rollbackPlan) throw Error("Prepare a verified rollback first.");
  const plan = rollbackPlan;
  rollbackPlan = null;
  const files = await restoreRoot(plan.entries, {
    read,
    write: (name, bytes, etag) =>
      request(dav, name, {
        method: "PUT",
        headers: {
          "If-Match": etag,
          "Content-Type": types[path.extname(name)],
        },
        body: bytes,
      }),
    equivalent,
  });
  for (const file of files) {
    const live = await read(
        file.path === "/index.html" ? "/" : file.path,
        true,
      ),
      target = plan.entries.find((e) => e.path === file.path);
    if (
      live.status !== 200 ||
      !publicEquivalent(file.path, target.bytes, live.bytes)
    )
      throw Error("Public rollback mismatch: " + file.path);
  }
  const receipt = {
    utc: new Date().toISOString(),
    origin,
    release: plan.release,
    files,
    scope: "Conditional root rollback; no asset or application-data deletion",
  };
  await fs.writeFile(
    path.join(root, "audit/rollback.json"),
    JSON.stringify(receipt, null, 2),
  );
  return receipt;
}

function knownProviderFooter(element) {
  if (
    !element ||
    element.localName !== "div" ||
    element.attributes.length !== 1 ||
    !element.hasAttribute("style")
  )
    return false;
  const styleIs = (raw, expected) => {
    const entries = raw
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf(":");
        return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
      });
    return (
      entries.length === Object.keys(expected).length &&
      entries.every(([k, v]) => expected[k] === v) &&
      new Set(entries.map(([k]) => k)).size === entries.length
    );
  };
  if (
    !styleIs(element.getAttribute("style"), {
      position: "fixed",
      bottom: "0",
      left: "0",
      right: "0",
      padding: "8px",
      background: "#f0f0f0",
      "text-align": "center",
      "font-size": "12px",
      color: "#666",
      "z-index": "9999",
      opacity: "0.8",
      "border-top": "1px solid #ddd",
    })
  )
    return false;
  const children = [...element.children],
    link = children[0];
  return (
    children.length === 1 &&
    link.localName === "a" &&
    link.children.length === 0 &&
    link.attributes.length === 2 &&
    link.getAttribute("href") === "https://pagelove.com/" &&
    styleIs(link.getAttribute("style") || "", {
      color: "#4a90d9",
      "text-decoration": "none",
    }) &&
    link.textContent.trim() === "Pagelove" &&
    element.textContent.replace(/\s+/g, " ").trim() === "Powered by Pagelove"
  );
}
export function htmlIdentity(bytes, allowProviderFooter = false) {
  const doc = new DOMParser().parseFromString(
    bytes.toString("utf8"),
    "text/html",
  );
  if (allowProviderFooter && knownProviderFooter(doc.body.lastElementChild))
    doc.body.lastElementChild.remove();
  doc.documentElement.normalize();
  function visit(n) {
    if (n.nodeType === 3) {
      const text = n.textContent.replace(/\r\n/g, "\n");
      return /^(SCRIPT|STYLE|PRE)$/.test(n.parentNode?.nodeName)
        ? text.trim()
        : text.replace(/\s+/g, " ").trim();
    }
    if (n.nodeType !== 1) return null;
    return [
      n.localName,
      [...n.attributes]
        .filter((a) => !/^xmlns(?::|$)/.test(a.name))
        .map((a) => [a.name, a.value])
        .sort((a, b) => a[0].localeCompare(b[0])),
      [...n.childNodes].map(visit).filter((x) => x !== null && x !== ""),
    ];
  }
  return sha(JSON.stringify(visit(doc.documentElement)));
}
const htmlResource = (name) =>
  name.endsWith(".html") || /^\/(?:editor|track)\/[^/]+$/.test(name);
export const equivalent = (name, a, b) =>
  htmlResource(name) ? htmlIdentity(a) === htmlIdentity(b) : a.equals(b);
export const publicEquivalent = (name, a, b) =>
  htmlResource(name)
    ? htmlIdentity(a, true) === htmlIdentity(b, true)
    : a.equals(b);

async function request(base, name, options = {}) {
  if (
    ![origin, dav].includes(base) ||
    !name.startsWith("/") ||
    name.includes("..") ||
    name.includes("?") ||
    name.includes("#")
  )
    throw Error("Unpinned request");
  const r = await fetch(base + name, {
    ...options,
    headers: {
      ...(base === dav ? { Authorization: "Bearer " + key } : {}),
      ...options.headers,
    },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (r.status >= 300 && r.status < 400)
    throw Error("Redirect refused at " + name);
  return {
    status: r.status,
    etag: r.headers.get("etag"),
    type: r.headers.get("content-type"),
    bytes: Buffer.from(await r.arrayBuffer()),
  };
}
async function read(name, publicRead = false) {
  const r = await request(publicRead ? origin : dav, name);
  if (![200, 404].includes(r.status))
    throw Error("Read " + name + " returned " + r.status);
  return r;
}
export function backupRelativePath(name) {
  if (["/index.html", "/sw.js", "/release.json"].includes(name))
    return name.slice(1);
  // Native route names such as :slug are URLs, not portable filenames.
  return "resources/" + sha(Buffer.from(name)) + ".bin";
}
export async function saveBaseline(directory, name, response) {
  const relative = backupRelativePath(name),
    target = path.join(directory, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, response.bytes);
  if (relative.startsWith("resources/"))
    await fs.writeFile(
      target + ".json",
      JSON.stringify({
        path: name,
        etag: response.etag,
        sha256: sha(response.bytes),
      }),
    );
  return relative;
}
async function remember(name) {
  const r = await read(name);
  if (r.status === 200 && !r.etag)
    throw Error("Missing conditional-write ETag: " + name);
  if (r.status === 200) await saveBaseline(backupDirectory, name, r);
  baseline.set(name, r);
  return r;
}
async function put(name, bytes, immutable = false) {
  const before = baseline.get(name) || (await remember(name));
  if (before.status === 200 && equivalent(name, bytes, before.bytes))
    return {
      path: name,
      status: "unchanged",
      bytes: before.bytes.length,
      sha256: sha(before.bytes),
    };
  if (immutable && before.status === 200)
    throw Error("Immutable file conflict: " + name);
  const current = await read(name);
  if (current.status !== before.status || current.etag !== before.etag)
    throw Error("Concurrent remote change: " + name);
  const condition =
    current.status === 404
      ? { "If-None-Match": "*" }
      : { "If-Match": current.etag };
  let response,
    ambiguous = false;
  try {
    response = await request(dav, name, {
      method: "PUT",
      headers: {
        ...condition,
        "Content-Type": htmlResource(name)
          ? "text/html; charset=utf-8"
          : types[path.extname(name)] || "application/octet-stream",
      },
      body: bytes,
    });
  } catch {
    ambiguous = true;
  }
  const after = await read(name);
  if (after.status !== 200 || !equivalent(name, bytes, after.bytes))
    throw Error(
      "Write/readback mismatch: " +
        name +
        " (write " +
        (response?.status || "ambiguous") +
        ")",
    );
  if (response && ![200, 201, 204].includes(response.status))
    throw Error("Write refused: " + name + " " + response.status);
  return {
    path: name,
    status: ambiguous ? "reconciled" : response.status,
    bytes: after.bytes.length,
    sha256: sha(after.bytes),
    sourceSha256: sha(bytes),
  };
}
async function walk(relative) {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const name = relative + "/" + entry.name;
    if (entry.isDirectory()) files.push(...(await walk(name)));
    else files.push(name);
  }
  return files.sort();
}
async function authenticate(secret) {
  if (typeof secret !== "string" || !secret.startsWith("pk_"))
    throw Error("Provide the owner key through hidden input");
  key = secret;
  const probe = await request(dav, "/", {
    method: "PROPFIND",
    headers: { Depth: "0" },
  });
  if (probe.status !== 207)
    throw Error("Authoring authentication failed: " + probe.status);
  backupDirectory = path.join(
    root,
    ".local",
    "deployment-baselines",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await fs.mkdir(backupDirectory, { recursive: true });
  baseline = new Map();
  const entries = [];
  for (const name of ["/index.html", "/sw.js", "/release.json"]) {
    const r = await remember(name);
    entries.push({
      path: name,
      status: r.status,
      bytes: r.bytes.length,
      sha256: sha(r.bytes),
      etag: r.etag,
    });
  }
  const publicPage = await read("/", true);
  authenticated = true;
  await fs.writeFile(
    path.join(backupDirectory, "baseline.json"),
    JSON.stringify(
      { utc: new Date().toISOString(), origin, dav, entries },
      null,
      2,
    ),
  );
  return {
    authenticated: true,
    origin,
    authoringStatus: probe.status,
    publicStatus: publicPage.status,
    entries,
    privateBackupSaved: true,
  };
}
async function deploy(publicationAuthorization = null) {
  const verified = await verifyRelease(root, "local", publicationAuthorization);
  if (!authenticated) throw Error("Authenticate and read the baseline first");
  const release = JSON.parse(
    await fs.readFile(path.join(root, "dist/release.json"), "utf8"),
  );
  if (!/^sl-[a-f0-9]{14}$/.test(release.release))
    throw Error("Invalid release identifier");
  const files = [];
  for (const entry of release.files) {
    const name = entry.url === "./" ? "/index.html" : entry.url.slice(1);
    if (
      name !== "/index.html" &&
      !name.startsWith("/releases/" + release.release + "/")
    )
      throw Error("Invalid inventory path");
    const bytes = await fs.readFile(path.join(root, "dist", name));
    if (sha(bytes) !== entry.hash) throw Error("Distribution changed: " + name);
    if (name !== "/index.html") files.push({ name, bytes, immutable: true });
  }
  for (const name of await walk("content"))
    files.push({
      name: "/" + name,
      bytes: await fs.readFile(path.join(root, name)),
      immutable: false,
    });
  const nativeEntries = [];
  for (const entry of release.nativeFiles)
    nativeEntries.push({
      name: entry.url,
      bytes: await fs.readFile(path.join(root, "dist", entry.file)),
      immutable: false,
    });
  const directories = new Set();
  for (const f of [...files, ...nativeEntries]) {
    let dir = path.posix.dirname(f.name);
    while (dir !== "/") {
      directories.add(dir + "/");
      dir = path.posix.dirname(dir);
    }
  }
  for (const directory of [...directories].sort(
    (a, b) => a.length - b.length,
  )) {
    const r = await request(dav, directory, { method: "MKCOL" });
    if (![201, 405].includes(r.status))
      throw Error("Directory creation " + directory + " returned " + r.status);
  }
  const written = [];
  for (const file of files) {
    written.push(await put(file.name, file.bytes, file.immutable));
    console.log(JSON.stringify({ staged: file.name }));
  }
  // Public dependencies must be available before the root page starts referencing them.
  const publicFiles = [];
  for (const file of files) {
    const live = await read(file.name, true);
    if (
      live.status !== 200 ||
      !publicEquivalent(file.name, file.bytes, live.bytes)
    )
      throw Error("Public dependency mismatch: " + file.name);
    publicFiles.push({
      path: file.name,
      status: live.status,
      sha256: sha(live.bytes),
      bytes: live.bytes.length,
      type: live.type,
    });
  }
  await verifyRelease(root, "staged", publicationAuthorization);
  // Native routes are entry points too. Require staged acceptance or the exact
  // candidate authorization; included shells are already publicly verified.
  for (const file of nativeEntries) {
    written.push(await put(file.name, file.bytes));
    const live = await read(file.name, true);
    // Exact route source is read through DAV; public composition is covered by P07.
    if (live.status !== 200)
      throw Error("Native entry unavailable: " + file.name);
    publicFiles.push({
      path: file.name,
      status: live.status,
      sha256: sha(live.bytes),
      bytes: live.bytes.length,
      type: live.type,
    });
  }
  const index = await fs.readFile(path.join(root, "dist/index.html"));
  written.push(await put("/index.html", index));
  const publicIndex = await read("/", true);
  if (
    publicIndex.status !== 200 ||
    !publicEquivalent("/index.html", index, publicIndex.bytes)
  )
    throw Error("Public entry semantic mismatch");
  // Pagelove may serialize authored HTML. Verify its semantics, then pin the exact
  // served bytes in the offline inventory; script/style bytes remain strict.
  const published = structuredClone(release);
  for (const inventory of [published.files, published.offlineFiles])
    for (const entry of inventory) {
      const served = publicFiles.find((f) => f.path === entry.url.slice(1));
      if (served) entry.hash = served.sha256;
    }
  published.files.find((f) => f.url === "./").hash = sha(publicIndex.bytes);
  published.offlineFiles.find((f) => f.url === "./").hash = sha(
    publicIndex.bytes,
  );
  const workerSource = await fs.readFile(path.join(root, "dist/sw.js"), "utf8");
  const original = "INVENTORY=" + JSON.stringify(release.offlineFiles) + ";";
  if (!workerSource.includes(original))
    throw Error("Worker inventory does not match the release");
  const worker = Buffer.from(
    workerSource.replace(
      original,
      "INVENTORY=" + JSON.stringify(published.offlineFiles) + ";",
    ),
  );
  written.push(
    await put("/release.json", Buffer.from(JSON.stringify(published, null, 2))),
  );
  written.push(await put("/sw.js", worker));
  for (const [name, bytes] of [
    ["/sw.js", worker],
    ["/release.json", Buffer.from(JSON.stringify(published, null, 2))],
  ]) {
    const live = await read(name, true);
    if (live.status !== 200 || !bytes.equals(live.bytes))
      throw Error("Public entry readback failed: " + name);
    publicFiles.push({
      path: name,
      status: live.status,
      sha256: sha(live.bytes),
      bytes: live.bytes.length,
      type: live.type,
    });
  }
  publicFiles.push({
    path: "/",
    status: 200,
    sha256: sha(publicIndex.bytes),
    bytes: publicIndex.bytes.length,
    type: publicIndex.type,
  });
  const receipt = {
    utc: new Date().toISOString(),
    origin,
    authoringHost: dav,
    release: release.release,
    sourceHash: verified.source.hash,
    outputHash: verified.outputHash,
    publicationAuthorization: publicationAuthorization
      ? {
          path: publicationAuthorization,
          sha256: sha(
            await fs.readFile(path.join(root, publicationAuthorization)),
          ),
        }
      : null,
    productAcceptance: publicationAuthorization
      ? "Incomplete outcomes retained; explicitly authorized candidate publication"
      : "Required pre-promotion acceptance passed",
    publication:
      "Immutable assets and authored content staged and publicly verified before conditional root entry promotion",
    htmlSerializationAdjusted: sha(index) !== sha(publicIndex.bytes),
    sourceIndexSha256: sha(index),
    publicIndexSha256: sha(publicIndex.bytes),
    files: written,
    publicFiles,
    credentialStored: false,
    baselineBackup: "Local ignored .local/deployment-baselines only",
    applicationServices:
      "Owner publication and discovery; public boards require separate verified policy activation",
  };
  await fs.writeFile(
    path.join(root, "audit/deployment.json"),
    JSON.stringify(receipt, null, 2),
  );
  return {
    deployed: true,
    origin,
    release: release.release,
    verifiedPublicFiles: publicFiles.length,
    htmlSerializationAdjusted: receipt.htmlSerializationAdjusted,
    receipt: "audit/deployment.json",
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
  console.log(
    "Ready for hidden JSON input: auth, deploy, publish-candidate, prepare-rollback, rollback, quit.",
  );
  process.stdin.on("data", async (chunk) => {
    if (chunk.includes("\u0003")) process.exit(0);
    buffer += chunk;
    const n = buffer.search(/[\r\n]/);
    if (n < 0) return;
    const line = buffer.slice(0, n).trim();
    buffer = buffer.slice(n + 1);
    if (!line) return;
    if (busy) {
      console.log(JSON.stringify({ error: "An operation is already running" }));
      return;
    }
    busy = true;
    try {
      const c = JSON.parse(line);
      if (c.op === "quit") {
        key = "";
        process.exit(0);
      }
      const result =
        c.op === "auth"
          ? await authenticate(c.key)
          : c.op === "deploy"
            ? await deploy()
            : c.op === "publish-candidate"
              ? await deploy(c.authorization || "missing")
              : c.op === "prepare-rollback"
                ? await prepareRollback(c.baseline)
                : c.op === "rollback"
                  ? await rollback()
                  : (() => {
                      throw Error("Unsupported operation");
                    })();
      console.log(JSON.stringify(result));
    } catch (e) {
      console.log(JSON.stringify({ error: e.message }));
    } finally {
      busy = false;
    }
  });
}
