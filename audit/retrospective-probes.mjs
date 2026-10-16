// Read-only source probes. No browser, player database or provider writes.
// Run from this repository with: node audit/retrospective-probes.mjs
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Workshop} from '../app/workshop.js';

const root = new URL('../', import.meta.url);
const release = JSON.parse(await readFile(new URL('dist/release.json', root), 'utf8')).release;
const bundle = JSON.parse(await readFile(new URL(`dist/releases/${release}/content.json`, root), 'utf8'));
const target = structuredClone(bundle.tracks[0].track);
const notices = [];
function fixture() {
  const w = Object.create(Workshop.prototype);
  Object.assign(w, {
    track: {...structuredClone(target), name:'Unsaved retrospective fixture'},
    generation:0, baseline:1, tested:'', zoom:1, pan:{x:0,y:0},
    saveChain:Promise.resolve(), saveTimer:null,
    q:()=>({textContent:''}), notify:message=>notices.push(message),
    refresh(){}, draw(){}, save(){this.nextSaveRequested=true;}
  });
  return w;
}

const w = fixture();
w.store = {saveDraft:async()=>{throw Error('Fixture: concurrent revision conflict');}};
w.saveTimer = setTimeout(()=>{}, 60000);
const before = w.track.name;
let rejected = false;
try { await w.open(target); } catch { rejected = true; }
assert.equal(rejected, false);
assert.equal(w.track.name, target.name);
assert.notEqual(w.track.name, before);
assert.ok(notices.includes('Fixture: concurrent revision conflict'));

const view = fixture();
const storedView = {zoom:2.75,pan:{x:30,y:42}};
await view.open(target,{revision:2,view:storedView});
assert.equal(view.zoom,1);
assert.deepEqual(view.pan,{x:0,y:0});

const files = ['main.js','workshop.js','storage.js','audio.js','renderer.js','index.html'];
const source = [];
for (const name of files) {
  const bytes = await readFile(new URL(`app/${name}`,root));
  const hash = createHash('sha256').update(bytes).digest('hex');
  let releaseMatches = null;
  if (name !== 'index.html') releaseMatches = bytes.equals(await readFile(new URL(`dist/releases/${release}/${name}`,root)));
  source.push({path:`app/${name}`,sha256:hash,releaseMatches});
}
assert.ok(source.filter(s=>s.releaseMatches!==null).every(s=>s.releaseMatches));
const evidence = {
  utc:new Date().toISOString(), release,
  method:'Actual Workshop prototype methods with in-memory fixtures and rendering stubs. Assertions reproduce current defects; they are not acceptance passes. No actual IndexedDB conflict or user-data loss was induced.',
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  probes:[
    {id:'R01',result:'Reproduced',trigger:'Pending draft save rejects, then open a different track',saveErrorNotified:true,openRejected:rejected,beforeName:before,afterName:w.track.name,unsavedWorkingCopyRetained:false},
    {id:'R02',result:'Reproduced',trigger:'Open a stored draft with saved zoom and pan',storedView,actualView:{zoom:view.zoom,pan:view.pan}}
  ],source
};
await writeFile(new URL('retrospective-probe-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({release,probes:evidence.probes,sourceMatchesRelease:true},null,2));
