import fs from 'node:fs/promises';
const url=new URL('../../requirements.json',import.meta.url),r=JSON.parse(await fs.readFile(url,'utf8'));
const cases={
 J02:['keyboard-cycle','gamepad-cycle','touch-cycle'],
 J08:['keyboard-create-gap-gates-lap','pointer-create-gap-gates-lap','touch-create-gap-gates-lap'],
 J13:['verified-pack','fresh-document-server-stopped','race-offline','edit-offline'],
 P01:['abort-quota','tab-conflict','incompatible-schema','termination-before-commit','termination-after-commit'],
 P05:['trial-positive','daily-positive','missing-extra-fields','wrong-types','unsupported-content','invalid-splits','client-expiry','duplicate-id','prohibited-mutations'],
 P08:['provider-capability-record','established-policy-preserved'],
 M02:['road-surface-prop-gate-tools','keyboard-editor-journey','touch-editor-journey','test-return-history','export-import-recover'],
 M03:['all-81-builds','twelve-workshop-exports','references-resolve','seeded-circuits','seeded-pacing-campaign'],
 M04:['cold-offline-journey','input-zoom-matrix','natural-update','storage-ghost-daily','audio-sharing-install'],
 M05:['composition','owner-conflict-recovery','public-record-validation','policy-preservation','retention-outbox'],
 M06:['prepromotion-outcomes','exact-package','previous-client-update','live-outcomes'],
 C04:['hosted-regressions','hosted-candidate-check','required-rule-readback','negative-refusal-fixture'],
 C05:['source-output-inventory-binding','every-entry-recheck','required-scenario-refusal'],
 C06:['root-status-type-identity','immutable-assets-status-type-hash','native-routes-composition','board-workshop-availability'],
 C08:['two-release-restoration','conditional-stale-refusal','ambiguous-rollback','unrelated-state-preserved'],
 C14:['durable-phase-journal','post-write-verification-failure','ambiguous-applied','ambiguous-unapplied','unknown-readback','supported-forward-recovery'],
};
r.version=4;
r.scopeChange='User excluded real hardware and human playtesting on 2026-10-16, and explicitly answered Skip native desktop checks on 2026-10-18. Native Windows input/browser close-relaunch and OS-process crash checks are excluded. Browser-connector interaction, fresh-document offline recovery and real IndexedDB context-termination checks remain required. No other adopted outcome waived.';
r.governingGuide.requirementMapRevision='handbook-2.10-r2';
for(const row of r.required)row.scenarios=(cases[row.id]||['outcome']).map(id=>({id,outcome:id==='outcome'?row.outcome:id.replaceAll('-',' ')}));
// Correct a traceability error: the adopted player/design contract says to
// record whether a supported activation procedure exists. The guide explicitly
// says preserve established policies when it does not. Do not demand an invented
// provider-wide guarantee, remove endpoint validation or change board policies.
const p08=r.required.find(row=>row.id==='P08');
p08.outcome='Record supported policy activation capability and preserve established public policies when no safe activation contract exists';
p08.method='Provider capability record, pinned existing policy readback and unchanged-policy comparison; endpoint probes remain separate and do not imply global readiness';
const m05=r.required.find(row=>row.id==='M05');
m05.outcome=m05.outcome.replace('supported public-policy activation and positive/negative record checks','supported public-policy activation where available, otherwise established-policy preservation, plus positive/negative record checks');
const j13=r.required.find(row=>row.id==='J13');
j13.outcome='Player downloads complete content, stops the server, opens a fresh browser document and races/edits offline';
j13.method='Actual verified browser/worker offline pack and fresh-document recovery with server connection refused; native browser-process checks explicitly excluded by user';
r.required.find(row=>row.id==='P01').method='Transaction abort, quota denial, tab conflict, incompatible schema and abrupt browser Worker-context termination before/after commit; last valid draft survives. OS-process crash checks explicitly excluded by user.';
await fs.writeFile(url,JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify({version:r.version,requirements:r.required.length,scenarios:r.required.reduce((n,row)=>n+row.scenarios.length,0),mapRevision:r.governingGuide.requirementMapRevision}));
