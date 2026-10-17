import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boardDocument, loadOfficialBoardIdentities } from "./board-policy.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const identities = await loadOfficialBoardIdentities();
for (const mode of ["trial", "daily"]) {
  const file = path.join(root, "policy-candidates/boards", mode + ".html");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, boardDocument(mode, identities));
}
console.log(
  "Generated Scrap League's host-pinned trial and daily board documents.",
);
