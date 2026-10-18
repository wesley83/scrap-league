import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyCandidateArtifacts,verifyRelease} from '../../tools/release-gate.mjs';
const root=path.resolve(import.meta.dirname,'../..'),audit=import.meta.dirname;
const sha=b=>createHash('sha256').update(b).digest('hex');
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const result={utc:new Date().toISOString(),checks:[],status:'pending'};
try{
 const candidate=await verifyCandidateArtifacts(root);
 const inventoryBytes=await fs.readFile(path.join(root,'requirements.json')),inventory=JSON.parse(inventoryBytes),ledger=await readJSON(path.join(root,'audit/current-acceptance.json'));
 assert.equal(sha(inventoryBytes),ledger.inventoryHash);
 assert.equal(ledger.release,candidate.release);assert.equal(ledger.sourceHash,candidate.source.hash);assert.equal(ledger.outputHash,candidate.outputHash);
 assert.equal(sha(await fs.readFile(path.join(root,inventory.governingGuide.snapshot))),inventory.governingGuide.sha256);
 assert.equal(sha(await fs.readFile('C:/Users/Wesley/Documents/Codex/Pagelove/games/prism-breaker/GAME-DEVELOPMENT-BEST-PRACTICES.md')),inventory.governingGuide.sha256,'Canonical guide changed; impact review required');
 assert.equal(inventory.governingGuide.edition,'2.10.0');
 assert.equal(ledger.status,'not-accepted');
 assert.deepEqual(ledger.requirements.map(r=>r.id),inventory.required.map(r=>r.id));
 assert.equal(new Set(ledger.requirements.map(r=>r.id)).size,47);
 result.checks.push('Exact guide, source/output and all 47 inventory IDs match; unresolved acceptance preserved');
 const seen=new Set();
 for(const row of ledger.requirements)for(const a of row.artifacts){
  if(seen.has(a.path))continue;seen.add(a.path);
  assert.equal(sha(await fs.readFile(path.join(root,a.path))),a.sha256,a.path);
 }
 for(const name of ['coverageReview','evidenceReview']){
  const r=ledger[name];assert.equal(r.inventoryHash,ledger.inventoryHash);assert.equal(r.sourceHash,candidate.source.hash);assert.equal(r.outputHash,candidate.outputHash);
  assert.equal(sha(await fs.readFile(path.join(root,r.artifact.path))),r.artifact.sha256);
 }
 result.checkedEvidenceFiles=seen.size;
 result.checks.push('All retained ledger artifacts and separate candidate-bound review hashes verified');
 await assert.rejects(verifyRelease(root,'local'),/Required acceptance is missing or not passed: J02/);
 const refusals=await readJSON(path.join(audit,'publisher-refusals.json'));
 assert.equal(refusals.passed,true);assert.equal(refusals.cases.length,4);
 result.checks.push('Shared gate and four supported command refusal receipts verified; no publication claimed');
 const tests=await fs.readFile(path.join(audit,'closing-tests.txt'),'utf8');
 assert.match(tests,/tests 115\b/);assert.match(tests,/pass 115\b/);assert.match(tests,/fail 0\b/);
 const index=await readJSON(path.join(audit,'browser-index.json'));
 for(const name of ['Twelve events, reload and ending','Garage compare and test','Sharing and fallback','Gamepad menu, race and interruption','New circuit, source and failed save','Solo improvement and submission form','Name form 200 percent reflow','Quick race journey','Input ownership and camera','Manual throttle layout','Workshop round trip','Practice and ghost','All tracks and recovery','Render budget','Foreground update discovery','Root and composed dependency parity','Workshop entry readiness and recovery','Qualified first-entry failure and export','Closed-store Files recovery']){
  const r=index.latest.find(r=>r.name===name);assert.equal(r?.status,'passed',name);assert.ok(r.entry?.startsWith('http://127.0.0.1:4420/'),name+' must use corrected final origin');
 }
 result.checks.push('115 tests and 19 named final-origin browser observations pass with strict oracles');
 const main=await fs.readFile(path.join(root,'dist/releases',candidate.release,'main.js'),'utf8');
 assert.ok(!main.includes('__scrapAudit')&&!main.includes('export const review'));
 result.checks.push('Local inspection hooks absent from shipped game main');
 const docs=['README.md','ACCEPTANCE.md','DEPLOYMENT.md','IMPLEMENTATION-STATUS.md','references/README.md','audit/2026-10-17-guide-2-10-audit/report.md','audit/2026-10-17-guide-2-10-audit/coverage-review.md','audit/2026-10-17-guide-2-10-audit/evidence-review.md'];
 let links=0;
 for(const file of docs){
  const text=await fs.readFile(path.join(root,file),'utf8');
  for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
   const target=match[1];if(/^(?:https?:|#)/.test(target))continue;
   const local=decodeURIComponent(target.split('#')[0]);await fs.access(path.resolve(root,path.dirname(file),local));links++;
  }
 }
 result.localLinks=links;result.checks.push('Changed documentation and audit-report local file links resolve');
 const readback=await readJSON(path.join(audit,'live-readback.json'));
 assert.equal(readback.localCandidatePublished,false);assert.ok(readback.requests.every(r=>r.status===200));assert.ok(readback.requests.filter(r=>r.inventoryMatch!==null).every(r=>r.inventoryMatch));
 result.checks.push('Prior live release readback remains distinct from unpublished repaired candidate');
 result.candidate={release:candidate.release,sourceHash:candidate.source.hash,outputHash:candidate.outputHash};result.status='passed';
 await fs.writeFile(path.join(audit,'verification.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}catch(error){result.status='failed';result.error=error.stack;await fs.writeFile(path.join(audit,'verification-failed-'+Date.now()+'.json'),JSON.stringify(result,null,2)+'\n');throw error;}
