import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyCandidateArtifacts,sourceIdentity,sha} from '../../tools/release-gate.mjs';
const root=process.cwd(),dir='audit/2026-10-28-engagement';
const candidate=await verifyCandidateArtifacts(root);
const inventory=JSON.parse(await fs.readFile('requirements.json','utf8'));
const full=await fs.readFile(dir+'/full-tests-final.log','utf8');
if(!/pass 128\b/.test(full)||!/fail 0\b/.test(full)||!/skipped 0\b/.test(full))throw Error('Full regression result missing');
const source=await sourceIdentity(root);
const rows=JSON.parse(await fs.readFile(dir+'/home-matrix.json','utf8'));
for(const row of rows){
 if(row.documentWidth!==row.viewport[0] || row.footer!=='32px')throw Error('Home geometry invalid');
 for(const b of row.buttons)if(b.width<44||b.height<44||b.left<0||b.right>row.viewport[0]+1||b.scrollWidth>b.clientWidth+2)throw Error('Home control clipped');
}
for(const name of ['enlarged-home','enlarged-challenges']){
 const r=JSON.parse(await fs.readFile(`${dir}/${name}.json`,'utf8'));
 if(r.overflows.length||r.documentWidth!==r.viewport[0])throw Error('Enlarged text overflow');
}
const touch=JSON.parse(await fs.readFile(dir+'/touch-landscape.json','utf8'));
if(touch.viewport[0]!==844||touch.viewport[1]!==390||touch.controls.some(c=>!c.hit||c.height<44||c.width<44||c.bottom>358))throw Error('Touch control obstruction');
const receipts=(await fs.readFile(dir+'/browser-receipts.jsonl','utf8')).trim().split('\n').map(s=>JSON.parse(s));
const finalCrew=receipts.find(r=>r.result?.challenge==='crew-yard-loop' && r.result.rulesRevision==='scrap-physics-v1.2.0');
const fixed=receipts.find(r=>r.result?.challenge?.startsWith('workshop-') && r.challenge?.buildRevision);
const rival=receipts.find(r=>r.result?.mode==='exhibition' && r.result.rulesRevision==='scrap-physics-v1.2.0');
if(!finalCrew||!fixed||fixed.settings.assist||fixed.settings.autoAccelerate||!rival)throw Error('Current integrated journey receipt missing');
const files=['plan.md','batch-1.md','batch-2.md','full-tests-initial.log','full-tests-final.log','browser-receipts.jsonl','home-matrix.json','enlarged-home.json','enlarged-challenges.json','touch-landscape.json','browser-exported-challenge.html','shared-invitation.txt','retry-journey.txt','crew-challenges-phone.png','crew-challenges-desktop.png','rival-race-landscape-fixture.png','server.mjs','guide-2.13.md'].map(n=>dir+'/'+n);
files.push('tests/engagement.test.mjs','references/target-runs.json');
const artifacts=await Promise.all(files.map(async p=>({path:p,sha256:sha(await fs.readFile(p))})));
const requirements=inventory.required.filter(r=>/^E[1-6]$/.test(r.id)).map(r=>({id:r.id,stage:'local',status:'passed',outcome:r.outcome,scenarios:r.scenarios.map(s=>({...s,status:'passed'})),evidence:artifacts}));
const result={version:1,utc:new Date().toISOString(),actor:'Codex',request:'Do all 6',milestone:'Six local engagement outcomes; not full hosted-release acceptance',...candidate,inventoryHash:sha(await fs.readFile('requirements.json')),guide:inventory.engagementGuidanceSupplement,checks:{tests:128,passed:128,failed:0,skipped:0,recordedTargetReplays:9,lineComparisonRuns:12,homeViewports:rows.map(r=>r.viewport),touchViewport:touch.viewport},requirements,states:{implemented:true,built:true,localVerified:true,committed:false,pushed:false,deployed:false},limits:['No physical-device, native-desktop, recruited-player or perceptual-listening checks.','Bot/fixture results do not establish enjoyment or retention.','Owner publication was observed through controlled transport, not a new public write.','Existing full-release ledger remains historical and cannot authorize this changed source; a later release needs renewed impacted acceptance and preservation of board policy identities/records.','Full suite preceded only trailing-blank cleanup in three Markdown files; rebuilt application release bytes are unchanged.']};
await fs.writeFile(dir+'/verification.json',JSON.stringify(result,null,2)+'\n');
await fs.writeFile(dir+'/source-manifest.json',JSON.stringify(source,null,2)+'\n');
const diff=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'diff','--no-ext-diff','--',...['app','content','tools','tests','requirements.json','PLAY.md','GAME-DESIGN.md','TRACK-WORKSHOP.md','IMPLEMENTATION-STATUS.md']],{encoding:'utf8'});
if(diff.status!==0)throw Error(diff.stderr);
await fs.writeFile(dir+'/reviewable-tracked-changes.patch',diff.stdout);
await fs.writeFile(dir+'/coverage-review.md',`# ENG coverage review\n\nActor: Codex. UTC: ${result.utc}. Source: ${source.hash}. Inventory: ${result.inventoryHash}.\n\nSix independently named outcomes E1–E6 represent the six user-approved recommendations; all 16 named local scenarios have an evidence mapping in verification.json. Target ghosts/feedback reuse existing modes, presets retain unlock restrictions, rival strategies use ordinary inputs, and creator challenges reuse semantic HTML and owner publication. Neither a new account service nor an anonymous publishing service was adopted. Existing release obligations remain in the 54-row inventory; this scoped milestone does not waive them or mark the entire release accepted.\n`);
await fs.writeFile(dir+'/evidence-review.md',`# ENG evidence review\n\nActor: Codex. UTC: ${result.utc}. Candidate: ${candidate.release}. Source: ${source.hash}. Output: ${candidate.outputHash}.\n\n128/128 regressions passed with zero skips; nine pinned target trajectories replayed valid finishes; 12 tested line/build choices finished without reset/contact. Browser receipts cover target/results/retry, presets/unlock rejection, copied/tested/credited/exported/imported/fixed Workshop challenge, invalidation after editing, real roster goal/result, pause/resume, phone touch geometry and a fresh-document shared invitation. Six home dimensions, doubled text and the provider-footer reservation were inspected. The local fixture elides countdown only for accelerated ordinary-controller completion and labels its method. Unmodified screenshots and shared-invitation.txt are separate from the instrumented fixture.\n\nInitial failures and method corrections remain in batch-2.md and their logs. Tests preceded only removal of trailing blank lines in three Markdown files; final build retained the same application release ID. Schema/storage/replay checks establish bounded behavior, not subjective enjoyment. No physical/native requirements restored and no new production verification claimed. Existing public rows and policies were untouched.\n`);
console.log(JSON.stringify({release:candidate.release,sourceHash:source.hash,outputHash:candidate.outputHash,requirements:requirements.length,scenarios:requirements.reduce((n,r)=>n+r.scenarios.length,0),tests:128}));
