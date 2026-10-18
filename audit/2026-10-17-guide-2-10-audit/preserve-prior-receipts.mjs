import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),audit=import.meta.dirname;
const files=['remediation-handling.json','remediation-persisted-campaigns.json','remediation-simulation-races.json','build.json','current-acceptance.json'];
const report=[];
for(const name of files){
 const target=path.join(root,'audit',name),bytes=await fs.readFile(target);
 const original=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','HEAD:audit/'+name],{cwd:root});
 if(original.status!==0)throw Error('Could not recover tracked historical receipt '+name);
 await fs.writeFile(path.join(audit,'prior-'+name),original.stdout,{flag:'wx'});
 if(name.startsWith('remediation-')){
  await fs.writeFile(path.join(audit,'fresh-'+name),bytes,{flag:'wx'});
  await fs.writeFile(target,original.stdout);
 }
 report.push({file:'audit/'+name,previousSha256:createHash('sha256').update(original.stdout).digest('hex'),currentSha256:createHash('sha256').update(bytes).digest('hex'),restored:name.startsWith('remediation-')});
}
await fs.writeFile(path.join(audit,'receipt-preservation.json'),JSON.stringify({utc:new Date().toISOString(),report},null,2)+'\n',{flag:'wx'});
console.log(report);
