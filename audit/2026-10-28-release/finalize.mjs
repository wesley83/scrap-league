import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyRelease} from '../../tools/release-gate.mjs';
const root=path.resolve(import.meta.dirname,'../..'),dir=import.meta.dirname,prefix='audit/2026-10-28-release/';
const git=(...args)=>{const r=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),...args],{cwd:root,maxBuffer:32e6});assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
const candidate=await verifyRelease(root,'live');
const excluded=[prefix+'final-staged-files.json',prefix+'final-audit.patch'];
const names=git('diff','--cached','--name-only','-z').toString().split('\0').filter(n=>n&&!excluded.includes(n));
assert.ok(names.length>0&&names.every(n=>n.startsWith('audit/')),'Final commit must contain only evidence; application/inventory/output frozen');
const b=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'cat-file','--batch'],{cwd:root,input:names.map(n=>':'+n+'\n').join(''),maxBuffer:32e6});assert.equal(b.status,0);let offset=0;
const files=[];
for(const name of names){const end=b.stdout.indexOf(10,offset),header=b.stdout.subarray(offset,end).toString(),size=Number(header.split(' ')[2]);assert.match(header,/^[a-f0-9]+ blob \d+$/);const bytes=b.stdout.subarray(end+1,end+1+size);offset=end+size+2;assert.ok(bytes.equals(await fs.readFile(path.join(root,name))),'Working/staged difference '+name);if(/\.(md|json|jsonl|mjs|js|txt|patch)$/.test(name))assert.ok(!/pk_[a-f0-9]{32,}|\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i.test(bytes.toString()),'Credential-like data in '+name);files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await fs.writeFile(path.join(dir,'final-audit.patch'),git('diff','--cached','--no-ext-diff','--','audit/*.md',prefix+'*.md',prefix+'*.mjs','audit/current-acceptance.json'));
await fs.writeFile(path.join(dir,'final-staged-files.json'),JSON.stringify({utc:new Date().toISOString(),scope:'Audit-only closure; source/inventory/output unchanged from 27d3f86; generated patch/manifest exclude themselves',release:candidate.release,sourceHash:candidate.source.hash,outputHash:candidate.outputHash,liveGate:'passed',credentialPatternMatches:0,workingBytesEqualStagedBytes:true,files},null,2)+'\n');
console.log(JSON.stringify({release:candidate.release,auditFiles:files.length,credentialPatternMatches:0,liveGate:'passed'}));
