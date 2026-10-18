import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
const hash = value => createHash("sha256").update(value).digest("hex");
export const safeError = error => String(error?.message || error)
  .replace(/pk_[a-zA-Z0-9]+/g, "[redacted]").slice(0, 500);

// Each record is flushed before the externally meaningful next action. A lost
// response cannot erase a write intent or a known successful entry promotion.
export async function openDeploymentJournal(root, operation, identity) {
  if (!["deploy", "rollback", "recover"].includes(operation))
    throw Error("Unknown journal operation");
  const id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID();
  const relative = "audit/deployments/" + id + ".jsonl";
  await fs.mkdir(path.join(root, "audit/deployments"), { recursive: true });
  const handle = await fs.open(path.join(root, relative), "wx");
  let previous = null, sequence = 0, closed = false;
  const journal = {
    id, relative,
    async record(state, detail = {}) {
      if (closed) throw Error("Deployment journal is closed");
      const { sha256: artifactSha256, ...attributes } = detail;
      const body = { ...attributes, ...(artifactSha256 ? { artifactSha256 } : {}),
        version: 1, id, sequence: ++sequence,
        utc: new Date().toISOString(), operation, state, previous };
      const record = { ...body, sha256: hash(JSON.stringify(body)) };
      await handle.write(JSON.stringify(record) + "\n");
      await handle.sync();
      previous = record.sha256;
      return record;
    },
    async close() { if (!closed) { closed = true; await handle.close(); } },
  };
  await journal.record("operation-started", { identity });
  return journal;
}

export async function readDeploymentJournal(root, relative) {
  if (!/^audit\/deployments\/[0-9TZ.-]+-[a-f0-9-]+\.jsonl$/.test(relative))
    throw Error("Choose a retained deployment journal");
  const text = await fs.readFile(path.join(root, relative), "utf8");
  if (!text.endsWith("\n")) throw Error("Journal has an incomplete final record; outcome unknown");
  let previous = null;
  const rows = text.trim().split("\n").map((line, index) => {
    const row = JSON.parse(line), { sha256, ...body } = row;
    if (row.sequence !== index + 1 || row.previous !== previous ||
        hash(JSON.stringify(body)) !== sha256)
      throw Error("Journal chain changed; recovery refused");
    previous = sha256; return row;
  });
  return rows;
}
