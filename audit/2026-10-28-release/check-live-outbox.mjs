// Two independent production store/queue clients; actual public endpoint;
// only the acknowledgement after a real accepted POST is deliberately dropped.
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DOMParser } from "linkedom";
import { IDBFactory } from "fake-indexeddb";
import { openStore } from "../../app/storage.js";
import { Boards } from "../../app/boards.js";
import { HOST_CONFIG } from "../../app/pagelove.js";
import { stable } from "../../app/model.js";
const file = new URL("./live-outbox.json", import.meta.url);
let key = "";
async function run() {
  const previous = JSON.parse(
    await fs.readFile(
      new URL("./data-preservation.json", import.meta.url),
      "utf8",
    ),
  );
  const row = {
    ...previous.synthetic,
    id: randomUUID(),
    alias: "Outbox check",
  };
  const report = {
    utc: new Date().toISOString(),
    id: row.id,
    requests: [],
    attempts: [],
    method:
      "Production Store and Boards with two independent IndexedDB connections in fake-indexeddb; actual public writes/readback; injected accepted-response loss. Not two physical browser tabs.",
  };
  await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
  const factory = new IDBFactory(),
    a = await openStore({ factory }),
    b = await openStore({ factory });
  let acceptedResponsesDropped = 0;
  const fetcher = async (url, options) => {
    const response = await fetch(url, options);
    report.requests.push({
      method: options.method || "GET",
      status: response.status,
    });
    if (options.method === "POST" && response.ok) {
      acceptedResponsesDropped++;
      await response.body?.cancel();
      throw Error("Injected response loss after actual public acceptance");
    }
    return response;
  };
  const first = new Boards(a, { fetcher, Parser: DOMParser }),
    second = new Boards(b, { fetcher, Parser: DOMParser });
  try {
    await a.enqueueRun(row);
    for (let attempt = 0; attempt < 3; attempt++) {
      await a.retryRuns(row.id);
      await Promise.all([first.pump(), second.pump()]);
      const entry = await b.get("outbox:" + row.id);
      report.attempts.push({
        state: entry.state,
        identityPreserved: stable(entry.run) === stable(row),
        claims: entry.attempts,
      });
      if (entry.state === "confirmed" || entry.state === "rejected") break;
    }
    const publicRows = (await first.readRows("trial")).rows.filter(
      (value) => value.id === row.id,
    );
    report.checks = {
      confirmed: (await a.get("outbox:" + row.id)).state === "confirmed",
      onePublicCopy: publicRows.length === 1,
      oneAcceptanceAcknowledgementDropped: acceptedResponsesDropped === 1,
      everyAttemptKeptIdentity: report.attempts.every(
        (value) => value.identityPreserved,
      ),
    };
  } catch (error) {
    report.error = error.message;
  } finally {
    a.close();
    b.close();
    const url = HOST_CONFIG.authoringOrigin + "/boards/trial.html";
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + key },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.headers.get("etag"))
      throw Error("Cleanup baseline unavailable; owned ID retained in receipt");
    const html = await response.text(),
      marker = `itemprop="id" content="${row.id}"`,
      index = html.indexOf(marker);
    if (index >= 0) {
      const start = html.lastIndexOf(
          '<li itemscope itemtype="urn:ScrapLeague:Run">',
          index,
        ),
        end = html.indexOf("</li>", index);
      if (start < 0 || end < 0)
        throw Error("Cannot isolate owned row for cleanup");
      const cleaned = await fetch(url, {
        method: "PUT",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: "Bearer " + key,
          "If-Match": response.headers.get("etag"),
          "Content-Type": "text/html; charset=utf-8",
        },
        body: html.slice(0, start) + html.slice(end + 5),
      });
      if (!cleaned.ok)
        throw Error("Conditional cleanup refused: " + cleaned.status);
    }
    const after = await fetch(url, {
      headers: { Authorization: "Bearer " + key },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    report.cleanup = {
      conditional: true,
      absent: after.ok && !(await after.text()).includes(marker),
    };
    report.passed =
      !report.error &&
      Object.values(report.checks || {}).every(Boolean) &&
      !!report.checks &&
      report.cleanup.absent;
    await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
    key = "";
  }
  return report;
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let input = "";
console.log("Ready for hidden JSON owner key.");
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("\u0003")) process.exit(0);
  input += chunk;
  const end = input.search(/[\r\n]/);
  if (end < 0) return;
  process.stdin.pause();
  try {
    key = JSON.parse(input.slice(0, end)).key;
    if (!key?.startsWith("pk_")) throw Error("Hidden key required");
    console.log(JSON.stringify(await run()));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  } finally {
    key = "";
    process.exit(process.exitCode || 0);
  }
});
