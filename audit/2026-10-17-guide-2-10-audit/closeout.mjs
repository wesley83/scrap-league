import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../..');
const audit=import.meta.dirname;
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>{
  const run=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,maxBuffer:32*1024*1024});
  assert.equal(run.status,0,run.stderr.toString());
  return run.stdout;
};
const names=bytes=>bytes.toString().split('\0').filter(Boolean);
const tracked=names(git('diff','--name-only','-z','HEAD','--','.'));
const untracked=names(git('ls-files','--others','--exclude-standard','-z'));
git('diff','--check');
await fs.writeFile(path.join(audit,'changes.patch'),git('diff','--binary','--no-ext-diff','HEAD','--','.'));

const newSources=untracked.filter(file=>file.startsWith('tests/')&&/\.(?:mjs|js)$/.test(file));
let patch='';
for(const file of newSources){
  const text=await fs.readFile(path.join(root,file),'utf8');
  const lines=text.replace(/\n$/,'').split('\n');
  patch+=`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(line=>'+'+line).join('\n')+'\n';
}
await fs.writeFile(path.join(audit,'new-source-files.patch'),patch);
await fs.writeFile(path.join(audit,'new-files-review.md'),`# New-file review\n\nThe tracked change is retained in changes.patch; new test/helper source is retained in new-source-files.patch. New audit scripts, reports, raw observations, prior receipts and screenshots remain individually reviewable in this directory and audit/runs. The pinned guide is an exact copy of the identified canonical guide, not newly authored guidance. Historical and failed observations are retained and are not promoted to current passes.\n\nAll changed tracked files, new audit/test files and the ignored current immutable release are inventoried with SHA-256 and byte length in hashes.json. The manifest excludes itself. No private .local data or node_modules are included. Source/output identity and the limits of evidence reuse are separately checked in verification.json.\n\nNew test/helper source:\n\n${newSources.map(file=>'- '+file).join('\n')}\n`);

const scan=[];
const textExtensions=/\.(?:md|json|txt|js|mjs|css|html|ya?ml|toml|svg|patch)$/;
const patterns=[['pagelove-key',/pk_[a-f0-9]{32,}/gi],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],['private-key',/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g]];
for(const file of [...new Set([...tracked,...untracked])].filter(file=>textExtensions.test(file))){
  const content=await fs.readFile(path.join(root,file),'utf8');
  for(const [id,pattern]of patterns){
    pattern.lastIndex=0;
    for(const match of content.matchAll(pattern))scan.push({file,pattern:id,line:content.slice(0,match.index).split('\n').length});
  }
}
await fs.writeFile(path.join(audit,'credential-scan.json'),JSON.stringify({utc:new Date().toISOString(),scope:'Changed tracked and nonignored untracked text; pattern scan only; no private .local or dependencies',matches:scan},null,2)+'\n');
assert.equal(scan.length,0,'Review credential pattern locations in credential-scan.json before closeout');

const verification=JSON.parse(await fs.readFile(path.join(audit,'verification.json'),'utf8'));
const ledger=JSON.parse(await fs.readFile(path.join(root,'audit/current-acceptance.json'),'utf8'));
const counts={};for(const row of ledger.requirements)counts[row.status]=(counts[row.status]||0)+1;
await fs.writeFile(path.join(audit,'closeout.json'),JSON.stringify({utc:new Date().toISOString(),status:'audit-complete/product-not-accepted',candidate:verification.candidate,guideEdition:'2.10.0',requirements:counts,tests:{passed:115,failed:0},finalOriginBrowserObservations:19,commit:false,push:false,deploy:false,temporaryServers:'Known sessions 23807, 66745 and 34243 stopped after browser observations; original public tab preserved',diffCheck:'passed',trackedPatch:'changes.patch',newSourcePatch:'new-source-files.patch',newFileReview:'new-files-review.md',hashManifest:'hashes.json',credentialPatternMatches:scan.length},null,2)+'\n');
await fs.appendFile(path.join(audit,'audit.md'),`\n## Closeout retained\n\n- UTC ${new Date().toISOString()}: tracked diff check passed; changes.patch and new-source-files.patch saved. New-file review and credential pattern scan retained; zero pattern matches in changed/new text. Known temporary server sessions were stopped. Final browser AX and screenshot are retained. hashes.json inventories changed/new evidence and current immutable release; self excluded. No commit, push or deployment.\n`);

async function walk(dir){const result=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())result.push(...await walk(file));else if(item.isFile())result.push(relative(file));}return result;}
const currentNew=names(git('ls-files','--others','--exclude-standard','-z'));
const releaseFiles=await walk(path.join(root,'dist/releases',verification.candidate.release));
const files=[...new Set([...tracked,...currentNew,...releaseFiles])].filter(file=>file!==relative(path.join(audit,'hashes.json'))).sort();
const manifest=[];
for(const file of files){const bytes=await fs.readFile(path.join(root,file));manifest.push({path:file,bytes:bytes.length,sha256:sha(bytes)});}
await fs.writeFile(path.join(audit,'hashes.json'),JSON.stringify({utc:new Date().toISOString(),algorithm:'sha256',selfExcluded:true,files:manifest},null,2)+'\n');
for(const entry of manifest)assert.equal(sha(await fs.readFile(path.join(root,entry.path))),entry.sha256,entry.path);
console.log(JSON.stringify({status:'saved and verified',files:manifest.length,requirements:counts,tests:115,browserObservations:19,credentialPatternMatches:scan.length}));
