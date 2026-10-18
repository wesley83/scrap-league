import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./release-gate.mjs";
import { BOARD_ORIGIN, BOARD_PATHS } from "./board-policy.mjs";

const validBoardConfig = (config) =>
  config?.policyRevision === "scrap-league-casual-v1" &&
  config.paths?.trial === BOARD_PATHS.trial &&
  config.paths?.daily === BOARD_PATHS.daily &&
  Object.keys(config.paths).length === 2;

export function validatePublicationAuthorization(
  auth,
  candidate,
  receipt,
  receiptBytes,
  host,
) {
  if (
    auth.version !== 1 ||
    auth.operation !== "publish-candidate" ||
    auth.origin !== "https://hire-poker-8313.onpagelove.com" ||
    auth.authorizedBy !== "Wesley" ||
    ![
      "Commit, push, deploy",
      "There is no meaningful reason not to have a leaderboard",
    ].includes(auth.request) ||
    !auth.context ||
    !Number.isFinite(Date.parse(auth.utc))
  )
    throw Error("Invalid explicit candidate-publication authorization");
  if (
    auth.release !== candidate.release ||
    auth.sourceHash !== candidate.source.hash ||
    auth.outputHash !== candidate.outputHash ||
    auth.acceptanceHash !== sha(receiptBytes)
  )
    throw Error(
      "Publication authorization does not match this exact candidate and ledger",
    );
  if (
    auth.origin !== BOARD_ORIGIN ||
    host?.publicOrigin !== BOARD_ORIGIN ||
    !validBoardConfig(host?.publicBoards)
  )
    throw Error(
      "Candidate publication requires the pinned host and exact casual-board policy paths",
    );
  const incomplete = receipt.requirements.filter((r) => r.status !== "passed");
  if (
    incomplete.some(
      (r) => !["partial", "blocked", "not-run"].includes(r.status),
    )
  )
    throw Error(
      "Failed acceptance cannot use this candidate-publication authorization",
    );
  // An operation receipt cannot grant an exception to a required outcome.
  // Apply an actual scope decision to the authoritative contract first; every
  // publication path still requires all outcomes in that contract to pass.
  if (incomplete.length)
    throw Error(
      "Unresolved required acceptance cannot be waived by a deployment instruction or agent-authored receipt: " +
        incomplete.map((r) => r.id).join(", "),
    );
  if (
    !Array.isArray(auth.knownIncomplete) ||
    auth.knownIncomplete.length !== incomplete.length ||
    new Set(auth.knownIncomplete.map((r) => r.id)).size !== incomplete.length
  )
    throw Error(
      "Publication authorization must enumerate every incomplete outcome",
    );
  for (const row of incomplete) {
    const known = auth.knownIncomplete.find((r) => r.id === row.id);
    if (!known || known.status !== row.status || known.note !== row.note)
      throw Error("Publication limitation changed or is omitted: " + row.id);
  }
  return new Set(incomplete.map((r) => r.id));
}

export async function readPublicationAuthorization(
  root,
  file,
  candidate,
  receipt,
  receiptBytes,
) {
  if (!/^audit\/deployment-authorization-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    throw Error("Use a dated tracked deployment authorization receipt");
  const auth = JSON.parse(await readFile(path.join(root, file), "utf8"));
  const { HOST_CONFIG } = await import(
    pathToFileURL(path.join(root, "app/pagelove.js")).href +
      "?source=" +
      candidate.source.hash
  );
  return validatePublicationAuthorization(
    auth,
    candidate,
    receipt,
    receiptBytes,
    HOST_CONFIG,
  );
}
