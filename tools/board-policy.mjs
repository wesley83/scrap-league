import { RULES, SLOTS, allBuilds, assemble } from "../app/builds.js";
import { stable, hash } from "../app/model.js";
import { loadContent } from "./content.mjs";

export const BOARD_ORIGIN = "https://hire-poker-8313.onpagelove.com";
export const BOARD_RUN_TYPE = "urn:ScrapLeague:Run";
export const BOARD_POLICY_REVISION = "scrap-league-casual-v1";
export const BOARD_PATHS = Object.freeze({
  trial: "/boards/trial.html",
  daily: "/boards/daily.html",
});
export const BOARD_RETENTION_MS = 5 * 86400000;

const fields = [
  ["id", "Text"],
  ["alias", "Text"],
  ["mode", "Text"],
  ["trackId", "Text"],
  ["trackRevision", "Text"],
  ["rulesRevision", "Text"],
  ["buildRevision", "Text"],
  ["assist", "Text"],
  ["laps", "Integer"],
  ["challenge", "Text"],
  ["elapsedMs", "Integer"],
  ["splits", "Text"],
];

export async function loadOfficialBoardIdentities() {
  const content = await loadContent(),
    definitions = allBuilds(content.parts),
    builds = new Set(),
    buildRevisions = new Map();
  for (const build of definitions) {
    const spec = assemble(build, content.parts),
      revision = await hash(
        SLOTS.map((slot) => {
          const { name, description, unlock, ...physical } = spec[slot];
          return physical;
        }),
      );
    builds.add(revision);
    buildRevisions.set(stable(build), revision);
  }
  const tracks = Object.fromEntries(
      content.tracks.map((track) => [track.track.id, track.revision]),
    ),
    daily = Object.fromEntries(
      content.daily.map((definition) => {
        const build = Object.fromEntries(
          SLOTS.map((slot) => [slot, definition[slot]]),
        );
        return [
          definition.id,
          {
            trackId: definition.track,
            trackRevision: tracks[definition.track],
            buildRevision: buildRevisions.get(stable(build)),
          },
        ];
      }),
    );
  return {
    rulesRevision: RULES,
    tracks,
    builds: [...builds].sort(),
    daily,
  };
}

function property([name, type]) {
  const unique = name === "id" ? '<meta itemprop="unique" content="true">' : "";
  const defaultValue =
    name === "receivedAt"
      ? '<div itemprop="default" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="module">export default () => Date.now();</script></div>'
      : name === "expiresAt"
        ? `<div itemprop="default" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="module">export default () => Date.now() + ${BOARD_RETENTION_MS};</script></div>`
        : "";
  return `<div itemprop="property" itemscope itemtype="https://pagelove.org/Property"><meta itemprop="name" content="${name}"><meta itemprop="type" content="https://schema.host/${type}"><meta itemprop="cardinality" content="1..1">${unique}${defaultValue}</div>`;
}

const schema = `<div hidden itemscope itemtype="https://pagelove.org/Schema"><meta itemprop="type" content="${BOARD_RUN_TYPE}">${[
  ...fields,
  ["receivedAt", "Integer"],
  ["expiresAt", "Integer"],
]
  .map((field) => property(field))
  .join("")}</div>`;

function triggerSource(mode, identities, compactIdentityPayload) {
  if (!identities || identities.rulesRevision !== RULES)
    throw Error("Official board identities do not match the current rules.");
  const encoded = compactIdentityPayload
    ? JSON.stringify({
        rulesRevision: identities.rulesRevision,
        tracks: identities.tracks,
        builds: "|" + identities.builds.join("|") + "|",
        ...(mode === "daily"
          ? {
              daily: Object.fromEntries(
                Object.entries(identities.daily).map(([day, spec]) => [
                  day,
                  [spec.trackId, spec.buildRevision],
                ]),
              ),
            }
          : {}),
      })
    : JSON.stringify(identities);
  const buildMembership = compactIdentityPayload
      ? '!official.builds.includes("|"+run.buildRevision+"|")'
      : "!official.builds.includes(run.buildRevision)",
    dailyMatch = compactIdentityPayload
      ? "!daily || daily[0] !== run.trackId || daily[1] !== run.buildRevision"
      : "!daily || daily.trackId !== run.trackId || daily.trackRevision !== run.trackRevision || daily.buildRevision !== run.buildRevision";
  return `const official = ${encoded};
const mode = ${JSON.stringify(mode)};
const expected = ${JSON.stringify(fields.map(([name]) => name))};
const reject = () => { throw { schema_url: "https://pagelove.org/HTTPResponse", status: 422, message: "Submit one valid official Scrap League run." }; };
export default function(ctx) {
  const body = ctx.request.body;
  if (typeof body !== "string" || body.length > 4096) reject();
  const row = /^<li itemscope itemtype="urn:ScrapLeague:Run">([\\s\\S]*)<\\/li>$/.exec(body);
  if (!row) reject();
  const fields = [...row[1].matchAll(/<meta itemprop="([A-Za-z]+)" content="([^"\\r\\n]*)">/g)];
  if (fields.length !== expected.length || fields.map(field => field[1]).some((name, index) => name !== expected[index])) reject();
  if (fields.map(field => '<meta itemprop="'+field[1]+'" content="'+field[2]+'">').join("") !== row[1]) reject();
  const run = Object.fromEntries(fields.map(field => [field[1], field[2]]));
  const alias = run.alias.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ "&amp;":"&", "&lt;":"<", "&gt;":">", "&quot;":"\\\"", "&#39;":"'" })[entity]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(run.id) || alias !== alias.normalize("NFC").trim() || [...alias].length < 1 || [...alias].length > 24 || /[\\u0000-\\u001f\\u007f]/.test(alias)) reject();
  if (run.mode !== mode || official.tracks[run.trackId] !== run.trackRevision || run.rulesRevision !== official.rulesRevision || ${buildMembership} || !/^steering-(on|off):(auto|manual)$/.test(run.assist) || run.laps !== "3") reject();
  if (mode === "trial") {
    if (run.challenge !== "") reject();
  } else {
    const daily = official.daily[run.challenge];
    if (${dailyMatch}) reject();
  }
  if (!/^[1-9][0-9]{0,5}$/.test(run.elapsedMs)) reject();
  const elapsed = Number(run.elapsedMs);
  if (!Number.isSafeInteger(elapsed) || elapsed > 480000 || !/^\\[[1-9][0-9]{0,5},[1-9][0-9]{0,5},[1-9][0-9]{0,5}\\]$/.test(run.splits)) reject();
  const splits = JSON.parse(run.splits);
  if (splits.length !== 3 || splits.some(value => !Number.isSafeInteger(value) || value < 1 || value > 480000) || splits.reduce((sum, value) => sum + value, 0) !== elapsed) reject();
  return true;
}`;
}

function retention(path) {
  const guard = String.raw`export default function(ctx) {
 const headers=ctx.request.headers,range=headers.Range ?? headers.range ?? headers.get?.('Range') ?? headers.get?.('range') ?? '';
 const match=/^selector=#runs > li:has\(meta\[itemprop="expiresAt"\]:value-less-than\("([0-9]{13})"\)\)$/.exec(range);
 if(!match || Number(match[1])>Date.now()) throw {schema_url:'https://pagelove.org/HTTPResponse',status:403,body:'<p>Only expired times can be removed.</p>'};
 return true;
}`;
  return `<div hidden itemscope itemtype="https://pagelove.org/AuthorizationRule"><meta itemprop="actor" content="*"><meta itemprop="resource" content="${path}"><meta itemprop="method" content="DELETE"><meta itemprop="selector" content="#runs > li"><meta itemprop="action" content="Allow"></div>
<div hidden itemscope itemtype="https://pagelove.org/Trigger"><meta itemprop="resource" content="${path}"><meta itemprop="method" content="DELETE"><div itemprop="action" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="module">${guard}</script></div></div>
<div hidden itemscope itemtype="https://pagelove.org/Processor"><meta itemprop="resource" content="${path}"><meta itemprop="method" content="GET"><div itemprop="when" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="module">export default ctx => [...String(ctx.response.body).matchAll(/itemprop="expiresAt" content="([0-9]{13})"/g)].some(m=>Number(m[1])<Date.now());</script></div><div itemprop="action" itemscope itemtype="https://pagelove.org/HttpRequest"><meta itemprop="url" content="${BOARD_ORIGIN + path}"><meta itemprop="method" content="DELETE"><meta itemprop="retry" content="1"><div itemprop="header" itemscope itemtype="https://pagelove.org/Pair"><meta itemprop="key" content="Range"><div itemprop="value" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="module">export default () => 'selector=#runs > li:has(meta[itemprop="expiresAt"]:value-less-than("'+Date.now()+'"))';</script></div></div></div></div>`;
}

export function boardDocument(
  mode,
  identities,
  {
    namespaceOnRoot = true,
    allowPaginatorAttribute = true,
    compactIdentityPayload = true,
  } = {},
) {
  const pathname = BOARD_PATHS[mode];
  if (!pathname) throw Error("Unknown Scrap League board mode.");
  const rootNamespace = namespaceOnRoot
      ? ' xmlns:p="https://pagelove.org/1.0"'
      : "",
    listNamespace = namespaceOnRoot
      ? ""
      : ' xmlns:p="https://pagelove.org/1.0"',
    paginationPermit = allowPaginatorAttribute
      ? '<code itemprop="permit">ul[id="runs"][p\\:paginate="100"]</code>'
      : "";
  const trigger = `<div hidden itemscope itemtype="https://pagelove.org/Trigger"><meta itemprop="resource" content="${pathname}"><meta itemprop="method" content="POST"><meta itemprop="selector" content="#runs"><div itemprop="action" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="module">${triggerSource(mode, identities, compactIdentityPayload)}</script></div></div>`;
  const rules = `<div hidden itemscope itemtype="https://pagelove.org/AuthorizationRule"><meta itemprop="actor" content="*"><meta itemprop="resource" content="${pathname}"><meta itemprop="method" content="POST"><meta itemprop="selector" content="#runs"><meta itemprop="action" content="Allow"></div>
<div hidden itemscope itemtype="https://pagelove.org/ShapeConstraint"><meta itemprop="resource" content="${pathname}"><meta itemprop="selector" content="#runs"><code itemprop="permit">ul[id="runs"]</code>${paginationPermit}<code itemprop="permit">li[itemscope][itemtype="${BOARD_RUN_TYPE}"]</code><code itemprop="permit">meta[itemprop][content]</code></div>
${schema}${trigger}${retention(pathname)}`;
  return `<!doctype html><html lang="en"${rootNamespace}><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="scrap-league-board-policy" content="${BOARD_POLICY_REVISION}"><title>Scrap League ${mode} times</title></head><body><h1>Scrap League ${mode} times</h1><p>Casual driver-reported times. Records expire after five days and are removed during later online reads.</p><ul id="runs"${listNamespace} p:paginate="100"></ul>${rules}</body></html>`;
}

export function policyDocuments(identities) {
  return Object.fromEntries(
    Object.keys(BOARD_PATHS).map((mode) => [
      mode,
      boardDocument(mode, identities),
    ]),
  );
}
