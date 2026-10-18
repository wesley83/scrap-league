import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const inventoryURL=new URL('requirements.json',root),inventory=JSON.parse(await fs.readFile(inventoryURL));
inventory.version=3;
inventory.governingGuide={edition:'2.10.0',sha256:sha(await fs.readFile(new URL('governing-guide.md',import.meta.url))),snapshot:'audit/2026-10-17-guide-2-10-audit/governing-guide.md',canonicalSource:'Pagelove workspace: games/prism-breaker/GAME-DEVELOPMENT-BEST-PRACTICES.md',requirementMapRevision:'handbook-2.10-r1',requirementMap:'ACCEPTANCE.md#handbook-210-audit-adoption'};
for(const row of [
 {id:'C11',outcome:'Pinned handbook 2.10 guidance and separate coverage/evidence decisions match the inventory and candidate',method:'Exact guide/inventory digests; retained coverage and evidence reviews; changed-inventory and stale-review refusal fixtures',stage:'local'},
 {id:'C12',outcome:'Required shared styles load consistently or produce recoverable startup failure through root and composed entry points',method:'Qualified HTTP503/zero-rule style faults, ordinary reload recovery and entry-point parity in the actual browser; installed entry compatibility remains explicit',stage:'local'},
 {id:'C13',outcome:'Every supported publisher refuses unresolved outcomes despite generic deployment instructions or agent-authored exception lists',method:'Gate refusal fixtures plus deploy and publish-candidate CLI refusal before authentication or writes',stage:'local'},
 {id:'C14',outcome:'Publication phase journaling and operator recovery are exercised through the supported command after successful and ambiguous entry writes',method:'Controlled host adapter through the actual publisher/rollback command; journal preserves promoted-unverified/recovery-required/unknown phases',stage:'staged'},
]){if(inventory.required.some(r=>r.id===row.id))throw Error('Already adopted '+row.id);inventory.required.push(row);}
await fs.writeFile(inventoryURL,JSON.stringify(inventory,null,2)+'\n');
const depURL=new URL('DEPLOYMENT.md',root);let deployment=await fs.readFile(depURL,'utf8');
const old=deployment.split(/\r?\n/).find(line=>line.startsWith('On October 16 Wesley explicitly requested'));
if(!old)throw Error('Missing historical publication paragraph');
deployment=deployment.replace(old,'The historical `publish-candidate` operation is retained as a compatibility entry point, but it now enforces the same required acceptance outcomes as `deploy`. A generic deployment or leaderboard instruction and a dated agent-authored limitation receipt cannot waive an unresolved outcome. Any actual authorized scope decision must first update the authoritative contract, identify the omitted outcome and consequence, and receive fresh coverage/evidence review. Both operations refuse unresolved required rows before staging; no candidate-publication bypass remains. Historical authorization/publication receipts describe earlier behavior and are not reusable waiver authority.');
await fs.writeFile(depURL,deployment);
const refURL=new URL('references/README.md',root);await fs.appendFile(refURL,`\n## Current audit authority — handbook 2.10.0\n\nThe user's October 17 instruction adopts edition 2.10.0 for the current audit. Its exact [snapshot](../audit/2026-10-17-guide-2-10-audit/governing-guide.md) has SHA-256 \`${inventory.governingGuide.sha256}\`; \`requirements.json\` pins that identity and requirement-map revision handbook-2.10-r1. Earlier snapshots above remain historical design evidence and are stale for current audit decisions. [Acceptance](../ACCEPTANCE.md#handbook-210-audit-adoption) maps the current sections. Compare later canonical changes before adopting them; do not silently replace this snapshot or relabel old observations as new runs.\n`);
console.log({version:inventory.version,requirements:inventory.required.length,guide:inventory.governingGuide});
