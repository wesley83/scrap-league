import test from "node:test";
import assert from "node:assert/strict";
import {publisherFixture} from "./publisher-fixture.mjs";
import {readDeploymentJournal} from "../tools/deployment-journal.mjs";
import {retainEvidence} from "./evidence.mjs";
import fs from "node:fs/promises";
import path from "node:path";

test("actual publisher commands retain promotion phases, recover failures and conditionally restore two releases",{timeout:300000},async()=>{
 const outcomes=[];
 for(const scenario of ["success","post-write-public-failure","post-write-DAV-failure","ambiguous-applied","ambiguous-not-applied","ambiguous-unreadable","gate-change-after-native","wrong-dependency-type","composed-style-loss"]){
  const f=await publisherFixture(scenario);
  try{
   const result=await f.command({op:"deploy"});
   const journal=(await f.journals())[0];assert.ok(journal,"CLI must persist phase journal");
   const rows=await readDeploymentJournal(f.fixture,"audit/deployments/"+journal);
   const indexWrite=rows.findIndex(r=>r.state==='entry-promoted-unverified'&&r.path==='/index.html');
   if(["success","ambiguous-applied"].includes(scenario)){
    assert.equal(result.deployed,true);assert.ok(rows.some(r=>r.state==='live-verified'));
   }else{
    assert.ok(result.error);assert.ok(['recovery-required','outcome-unknown'].includes(rows.at(-1).state));
    assert.ok(!rows.some(r=>r.state==='live-verified'));
   }
   if(scenario.startsWith('post-write')){
    assert.ok(indexWrite>=0,'Successful PUT must be journaled before verification throws');
    assert.equal(rows.at(-1).state,'recovery-required');
   }
   if(scenario==='ambiguous-not-applied'||scenario==='ambiguous-unreadable')assert.equal(rows.at(-1).state,'outcome-unknown');
   const host=await f.host();
   const indexAttempts=host.requests.filter(r=>r.method==='PUT'&&r.path==='/index.html');
   if(scenario==='ambiguous-applied')assert.equal(indexAttempts.length,1,'No replay after accepted response lost');
   if(scenario==='gate-change-after-native'){
    assert.match(result.error,/Required acceptance.*FIXTURE/);
    assert.equal(indexAttempts.length,0,'Next entry must recheck acceptance before promotion');
   }
   if(scenario==='wrong-dependency-type'){
    assert.match(result.error,/Public resource status\/type mismatch/);assert.equal(indexAttempts.length,0);
    assert.equal(rows.filter(row=>row.state==='entry-promoted-unverified').length,0);
   }
   if(scenario==='composed-style-loss')assert.match(result.error,/Public composed dependency mismatch/);
   let recovery=null,rollback=null;
   if(['post-write-public-failure','post-write-DAV-failure','ambiguous-not-applied','ambiguous-unreadable','composed-style-loss'].includes(scenario)){
    const prepared=await f.command({op:'prepare-recovery',journal:'audit/deployments/'+journal});
    assert.equal(prepared.prepared,true,JSON.stringify(prepared));
    recovery=await f.command({op:'recover'});assert.equal(recovery.deployed,true,JSON.stringify(recovery));
    const inspected=await f.command({op:'inspect-journal',journal:recovery.journal});
    assert.ok(inspected.records.some(r=>r.state==='recovered-operation'));
   }
   if(scenario==='success'){
    await f.editHost(state=>{state.scenario='rollback-ambiguous';state.faultUsed=false;});
    const prepared=await f.command({op:'prepare-rollback',baseline:f.baseline});assert.equal(prepared.prepared,true);
    rollback=await f.command({op:'rollback'});assert.equal(rollback.release,'sl-aaaaaaaaaaaaaa');
    const restored=await f.host();
    for(const name of ['/index.html','/release.json','/sw.js'])assert.equal(Buffer.from(restored.files[name].bytes,'base64').toString(),f.initial[name]);
    const rollbackRows=await readDeploymentJournal(f.fixture,rollback.journal);
    assert.equal(rollbackRows.filter(r=>r.state==='entry-promoted-unverified').length,2);
    assert.ok(rollbackRows.some(r=>r.state==='outcome-unknown'&&r.path==='/release.json'));
    assert.ok(rollbackRows.some(r=>r.state==='authoring-readback-verified'&&r.path==='/release.json'&&r.reconciled));
    assert.ok(rollbackRows.some(r=>r.state==='live-verified'));
   }
   const after=await f.host();
   for(const name of ['/boards/trial.html','/workshop-catalog.html','/workshop-tracks/player.html','/releases/sl-aaaaaaaaaaaaaa/main.js'])
    assert.equal(Buffer.from(after.files[name].bytes,'base64').toString(),f.initial[name]);
   outcomes.push({scenario,result,journalRecords:rows,recovery,rollback,
    rootWriteAttempts:indexAttempts.length,unrelatedDataAndPreviousClientPreserved:true});
  }finally{await f.clean();}
 }
 await retainEvidence(new URL('../audit/publisher-command.json',import.meta.url),JSON.stringify({scope:'Actual supported CLI, isolated synthetic candidate contract and intercepted pinned host; no production writes or game acceptance',outcomes},null,2)+'\n');
});

test("supported publisher refuses corrupt backups and concurrent state after recovery preparation",{timeout:120000},async()=>{
 const observations=[];
 for(const scenario of ['corrupt-backup','recovery-concurrency']){
  const f=await publisherFixture(scenario==='corrupt-backup'?'success':'post-write-public-failure');
  try{
   if(scenario==='corrupt-backup'){
    await fs.appendFile(path.join(f.fixture,'.local/deployment-baselines',f.baseline,'index.html'),'corrupted');
    const result=await f.command({op:'deploy'});assert.match(result.error,/Backup verification failed/);
    assert.equal((await f.host()).requests.filter(row=>row.method==='PUT').length,0);
    observations.push({scenario,result,remoteWrites:0});
   }else{
    const failed=await f.command({op:'deploy'});assert.ok(failed.error);
    const file=(await f.journals())[0],journal='audit/deployments/'+file;
    const prepared=await f.command({op:'prepare-recovery',journal});assert.equal(prepared.prepared,true);
    await f.editHost(state=>{state.files['/index.html']={bytes:Buffer.from('independent operator change').toString('base64'),etag:'"concurrent"'};});
    const writes=(await f.host()).requests.filter(row=>row.method==='PUT').length;
    const result=await f.command({op:'recover'});assert.match(result.error,/Remote state changed after recovery preparation/);
    assert.equal((await f.host()).requests.filter(row=>row.method==='PUT').length,writes);
    observations.push({scenario,result,newRemoteWrites:0});
   }
  }finally{await f.clean();}
 }
 await retainEvidence(new URL('../audit/publisher-refusal-boundaries.json',import.meta.url),JSON.stringify({scope:'Actual CLI and controlled host, not public game acceptance',observations},null,2)+'\n');
});
