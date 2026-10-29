import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const cases=[];
for(const op of ['deploy','publish-candidate']){
 const execution=spawnSync(process.execPath,['tools/deploy-pagelove.mjs'],{cwd:root,encoding:'utf8',input:JSON.stringify({op,authorization:'audit/nonexistent-test-receipt.json'})+'\n',timeout:20000});
 assert.equal(execution.error,undefined,execution.error?.message);
 const result=execution.stdout.split(/\r?\n/).find(line=>line.startsWith('{'));
 assert.ok(result,'CLI emitted no result: '+execution.stderr);
 const parsed=JSON.parse(result);
 assert.match(parsed.error,/Required acceptance is missing or not passed: J02/);
 assert.ok(!/authenticated|staged|deployed/.test(result));
 cases.push({op,exitCode:execution.status,result:parsed,observed:'Shared gate refusal before auth/staging; no key or remote write supplied'});
}
for(const command of ['tools/release-gate.mjs','tools/package-game.mjs']){
 const execution=spawnSync(process.execPath,[command],{cwd:root,encoding:'utf8',timeout:20000});
 assert.equal(execution.error,undefined,execution.error?.message);
 assert.equal(execution.status,1);
 assert.match(execution.stderr,/Required acceptance is missing or not passed: J02/);
 cases.push({command,exitCode:execution.status,observed:'Required unresolved J02 refused through supported command'});
}
await fs.writeFile(new URL('publisher-refusals.json',import.meta.url),JSON.stringify({utc:new Date().toISOString(),passed:true,scope:'Actual supported local commands, no authentication or remote mutations',cases},null,2)+'\n');
console.log(JSON.stringify(cases,null,2));
