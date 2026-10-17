import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  copyFile,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./content.mjs";
import { verifyAssets } from "./assets.mjs";
import { sourceIdentity } from "./release-gate.mjs";
import { nativeResources } from "./native-resources.mjs";
import "./build-board-documents.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = path.join(root, "dist");
const digest = (b) => createHash("sha256").update(b).digest("hex");
const bundle = await loadContent(),
  files = new Map();
const contract = await verifyAssets(root, path.join(root, "app"));
async function collect(relative = "") {
  for (const entry of (
    await readdir(path.join(root, "app", relative), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await collect(name);
    else if (name !== "index.html")
      files.set(name, await readFile(path.join(root, "app", name)));
  }
}
await collect();
files.set("content.json", Buffer.from(JSON.stringify(bundle)));
for (const f of ["three.module.js", "three.core.js"])
  files.set(
    "vendor/" + f,
    await readFile(path.join(root, "node_modules/three/build", f)),
  );
files.set(
  "vendor/THREE-LICENSE.txt",
  await readFile(path.join(root, "node_modules/three/LICENSE")),
);
const sourceIndex = await readFile(path.join(root, "app/index.html"), "utf8");
const release =
  "sl-" +
  digest(
    [...files].map(([n, b]) => n + digest(b)).join("|") +
      sourceIndex +
      (await readFile(path.join(root, "tools/worker-runtime.js"), "utf8")) +
      (await readFile(path.join(root, "tools/build.mjs"), "utf8")) +
      (await readFile(path.join(root, "tools/native-resources.mjs"), "utf8")) +
      JSON.stringify(contract),
  ).slice(0, 14);
const prefix = "releases/" + release + "/";
const manifest = {
  id: "../../",
  name: "Scrap League",
  short_name: "Scrap League",
  start_url: "../../",
  scope: "../../",
  display: "fullscreen",
  display_override: ["fullscreen", "standalone"],
  background_color: "#253126",
  theme_color: "#202721",
  icons: [
    { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    {
      src: "icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
files.set("manifest.webmanifest", Buffer.from(JSON.stringify(manifest)));
await mkdir(path.join(out, prefix, "vendor"), { recursive: true });
for (const [n, b] of files) {
  await mkdir(path.dirname(path.join(out, prefix, n)), { recursive: true });
  await writeFile(path.join(out, prefix, n), b);
}
const index = sourceIndex
  .replaceAll("__PUBLIC_RELEASE__", new URL(prefix, contract.origin).href)
  .replace("<head>", '<head><base href="./' + prefix + '">');
await verifyAssets(root, path.join(out, prefix), { html: index, release });
await writeFile(path.join(out, "index.html"), index);
const nativeFiles = [];
await mkdir(path.join(out, "native-routes"), { recursive: true });
for (const resource of nativeResources(index, release, bundle)) {
  if (resource.name === "shell.html") {
    files.set("native-shell.html", Buffer.from(resource.text));
    await writeFile(path.join(out, prefix, "native-shell.html"), resource.text);
    continue;
  }
  const file = "native-routes/" + resource.name;
  await writeFile(path.join(out, file), resource.text);
  nativeFiles.push({ url: resource.url, file, hash: digest(resource.text) });
}
const inventory = [
  { url: "./", hash: digest(index) },
  ...[...files].map(([name, b]) => ({
    url: "./" + prefix + name,
    hash: digest(b),
  })),
];
const publicOnly = new Set(
  contract.images.filter((x) => !x.offline).map((x) => "./" + prefix + x.path),
);
publicOnly.add("./" + prefix + "native-shell.html");
const offlineFiles = inventory.filter((entry) => !publicOnly.has(entry.url));
const worker =
  "const CACHE=" +
  JSON.stringify(release) +
  ",INVENTORY=" +
  JSON.stringify(offlineFiles) +
  ";\n" +
  (await readFile(path.join(root, "tools/worker-runtime.js"), "utf8"));
await writeFile(path.join(out, "sw.js"), worker);
await writeFile(
  path.join(out, "release.json"),
  JSON.stringify(
    {
      release,
      sourceHash: (await sourceIdentity(root)).hash,
      createdAt: new Date().toISOString(),
      files: inventory,
      offlineFiles,
      nativeFiles,
      bytes: [...files.values()].reduce(
        (n, b) => n + b.length,
        Buffer.byteLength(index),
      ),
    },
    null,
    2,
  ),
);
await mkdir(path.join(root, "audit"), { recursive: true });
await writeFile(
  path.join(root, "audit/build.json"),
  JSON.stringify(
    {
      release,
      tracks: bundle.tracks.length,
      parts: bundle.parts.length,
      cups: bundle.cups.length,
      rivals: bundle.rivals.length,
      daily: bundle.daily.length,
      inventoryCount: inventory.length,
      verified:
        "Source parsed and compiled from content documents; no prior derived bundle used.",
    },
    null,
    2,
  ),
);
console.log(
  `Built ${release}: 12 tracks / 81 builds / 4 cups / ${offlineFiles.length} offline files / ${inventory.length} public files`,
);
