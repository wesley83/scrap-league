import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {retainEvidence} from './evidence.mjs';

test('test evidence retains different runs and never overwrites a historical receipt',async()=>{
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'scrap-evidence-'));
 try {
  const historical=path.join(fixture,'observation.json');
  await fs.writeFile(historical,'historical observation');
  const first=await retainEvidence(pathToFileURL(historical),'first run');
  const second=await retainEvidence(pathToFileURL(historical),'second run');
  assert.notEqual(first,second);
  assert.equal(await retainEvidence(pathToFileURL(historical),'first run'),first);
  assert.equal(await fs.readFile(first,'utf8'),'first run');
  assert.equal(await fs.readFile(second,'utf8'),'second run');
  assert.equal(await fs.readFile(historical,'utf8'),'historical observation');
 }finally{
  if(!path.resolve(fixture).startsWith(path.resolve(os.tmpdir())+path.sep+'scrap-evidence-'))throw Error('Unsafe fixture cleanup');
  await fs.rm(fixture,{recursive:true,force:true});
 }
});
