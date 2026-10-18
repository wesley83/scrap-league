import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicationAuthorization} from '../tools/candidate-publication.mjs';
import {HOST_CONFIG} from '../app/pagelove.js';
import {sha} from '../tools/release-gate.mjs';

test('a generic deploy instruction and agent receipt cannot waive blocked, partial or unexecuted outcomes',()=>{
 const candidate={release:'sl-aaaaaaaaaaaaaa',source:{hash:'source'},outputHash:'output'};
 for(const request of ['Commit, push, deploy','There is no meaningful reason not to have a leaderboard']){
  for(const status of ['blocked','partial','not-run']){
   const receipt={requirements:[{id:'J13',status,note:'Required outcome remains unverified',artifacts:[]}]};
   const bytes=Buffer.from(JSON.stringify(receipt));
   const auth={version:1,operation:'publish-candidate',origin:HOST_CONFIG.publicOrigin,authorizedBy:'Wesley',request,context:'Agent-authored list is not an outcome waiver',utc:'2026-10-17T00:00:00Z',release:candidate.release,sourceHash:candidate.source.hash,outputHash:candidate.outputHash,acceptanceHash:sha(bytes),knownIncomplete:receipt.requirements.map(({id,status,note})=>({id,status,note}))};
   assert.throws(()=>validatePublicationAuthorization(auth,candidate,receipt,bytes,HOST_CONFIG),/unresolved|not passed|cannot waive/i,`${request}: ${status}`);
  }
 }
});
