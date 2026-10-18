import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyCandidateArtifacts} from '../../tools/release-gate.mjs';
import {readDeploymentJournal} from '../../tools/deployment-journal.mjs';
const root=path.resolve(import.meta.dirname,'../..'),folder=import.meta.dirname,sha=b=>createHash('sha256').update(b).digest('hex');
const candidate=await verifyCandidateArtifacts(root),receipt=JSON.parse(await fs.readFile(path.join(root,'audit/deployment.json'),'utf8'));
assert.equal(receipt.release,candidate.release);assert.equal(receipt.sourceHash,candidate.source.hash);assert.equal(receipt.outputHash,candidate.outputHash);
const journal=await readDeploymentJournal(root,receipt.journal);assert.equal(journal.at(-1).state,'operation-complete');assert.ok(journal.some(r=>r.state==='live-verified'));
assert.equal(receipt.credentialStored,false);assert.ok(receipt.publicFiles.every(r=>r.status===200&&r.sha256&&r.bytes>0&&r.type));
const published=await fetch(receipt.origin+'/release.json',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(published.status,200);const release=await published.json();
assert.equal(release.release,candidate.release);assert.equal(release.sourceHash,candidate.source.hash);
for(const entry of release.files){const remote=receipt.publicFiles.find(r=>r.path===(entry.url==='./'?'/':entry.url.slice(1)));assert.ok(remote,'Missing public inventory receipt '+entry.url);assert.equal(remote.sha256,entry.hash);}
for(const entry of release.nativeFiles)assert.ok(receipt.publicFiles.some(r=>r.path===entry.url&&r.status===200),'Missing native route '+entry.url);
const services=[];
// Catalog route is the production path declared by app/publication.js.
for(const route of ['/boards/trial.html','/boards/daily.html','/workshop-tracks/catalog.html']){
 const response=await fetch(receipt.origin+route,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)}),bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(response.status,200,route);assert.match(response.headers.get('content-type'),/^text\/html/);assert.ok(bytes.length>0);services.push({route,status:response.status,type:response.headers.get('content-type'),bytes:bytes.length,sha256:sha(bytes)});
}
await fs.copyFile(path.join(root,'audit/deployment.json'),path.join(folder,'deployment-receipt.json'));
const proof={utc:new Date().toISOString(),passed:true,release:candidate.release,sourceHash:candidate.source.hash,outputHash:candidate.outputHash,journal:receipt.journal,journalSha256:sha(await fs.readFile(path.join(root,receipt.journal))),journalRecords:journal.length,publicResources:receipt.publicFiles.length,verifiedInventory:release.files.length,nativeRoutes:release.nativeFiles.length,services,scope:'Supported publisher verified actual status/type/hash and semantic composed entry dependencies. Independent final published inventory/journal comparison and actual board/catalog availability. Provider burst reliability is not established.'};
await fs.writeFile(path.join(folder,'live-verification.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
