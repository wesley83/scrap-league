import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./release-gate.mjs";

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
    auth.request !== "Commit, push, deploy" ||
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
  if (host?.publicOrigin !== auth.origin || host?.publicBoards !== null)
    throw Error(
      "Candidate publication requires the pinned host and disabled public boards",
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
