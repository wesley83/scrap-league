import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),dir=import.meta.dirname;
const git=(...args)=>{const r=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
// Raw audit bytes and generated vendor license bytes are intentionally retained.
git('diff','--cached','--check','--','.',':!audit/**',':!dist/**');
const generated=['audit/2026-10-18-phone-layout/changes.patch','audit/2026-10-18-phone-layout/staged-files.json'];
const names=git('diff','--cached','--name-only','-z').toString().split('\0').filter(file=>file&&!generated.includes(file));
const batch=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'cat-file','--batch'],{cwd:root,input:names.map(file=>':'+file+'\n').join(''),maxBuffer:64*1024*1024});
assert.equal(batch.status,0,batch.stderr?.toString());let offset=0;
const manifest=[];const matches=[];
for(const file of names){
 const end=batch.stdout.indexOf(10,offset),header=batch.stdout.subarray(offset,end).toString(),size=Number(header.split(' ')[2]);
 assert.match(header,/^[a-f0-9]+ blob \d+$/);const bytes=batch.stdout.subarray(end+1,end+1+size);offset=end+size+2;
 const working=await fs.readFile(path.join(root,file));
 assert.ok(bytes.equals(working),'Staged and working bytes differ: '+file);
 const digest=createHash('sha256').update(bytes).digest('hex');
 manifest.push({path:file,bytes:bytes.length,sha256:digest});
 if(/\.(?:md|json|txt|js|mjs|css|html|ya?ml|toml|svg|patch)$/.test(file)){
  const text=bytes.toString();
  for(const [name,pattern]of [['pagelove-key',/pk_[a-f0-9]{32,}/i],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],['private-key',/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/]])if(pattern.test(text))matches.push({file,pattern:name});
 }
}
assert.equal(matches.length,0,'Staged credential pattern matches: '+JSON.stringify(matches));
const candidate=JSON.parse(await fs.readFile(path.join(root,'dist/release.json'),'utf8'));
const currentAssets=names.filter(file=>file.startsWith('dist/releases/'+candidate.release+'/'));
assert.ok(currentAssets.length>40,'Missing current immutable assets');
await fs.writeFile(path.join(dir,'changes.patch'),git('diff','--cached','--binary','--no-ext-diff','--','.',':!audit/**',':!dist/**'));
await fs.writeFile(path.join(dir,'staged-files.json'),JSON.stringify({utc:new Date().toISOString(),scope:'Initial staged payload before adding this generated diff/inventory; these two generated files are excluded from their own content',diffCheck:'passed',workingBytesEqualStagedBytes:true,credentialPatternMatches:matches.length,currentRelease:candidate.release,currentReleaseAssets:currentAssets.length,files:manifest},null,2)+'\n');
console.log(JSON.stringify({stagedFiles:manifest.length,currentReleaseAssets:currentAssets.length,stagedBytes:manifest.reduce((sum,r)=>sum+r.bytes,0),credentialPatternMatches:matches.length,diffCheck:'passed'}));
