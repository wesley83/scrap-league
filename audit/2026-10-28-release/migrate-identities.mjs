import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {DOMParser} from 'linkedom';
import {createHash} from 'node:crypto';
import {verifyBoardDocument} from '../../tools/publish-board-resources.mjs';
const root=process.cwd(),dir=path.resolve('audit/2026-10-28-release'),prior='7dbddf0c7fbf3511836f16bed1d5ce6482223712';
const sha=b=>createHash('sha256').update(b).digest('hex');
const parse=s=>new DOMParser().parseFromString(s,'text/html');
const git=mode=>{const r=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',prior+':policy-candidates/boards/'+mode+'.html'],{encoding:'utf8'});assert.equal(r.status,0);return r.stdout;};
function controls(doc){const c=doc.cloneNode(true);c.querySelector('#runs').replaceChildren();return c.toString();}
function rows(doc){return [...doc.querySelectorAll('#runs > li')].map(n=>({id:n.querySelector('[itemprop=id]')?.getAttribute('content'),hash:sha(n.outerHTML)}));}
export function migrate(existing,oldHTML,newHTML){
 const doc=parse(existing),old=parse(oldHTML),next=parse(newHTML);
 assert.equal(controls(doc),controls(old),'Existing policy/owner content differs from pinned prior source; no write');
 const oldScripts=[...old.querySelectorAll('script[itemprop=source]')],newScripts=[...next.querySelectorAll('script[itemprop=source]')];
 assert.equal(oldScripts.length,newScripts.length);
 let text=existing,changed=0;
 for(let i=0;i<oldScripts.length;i++)if(oldScripts[i].textContent!==newScripts[i].textContent){
  assert.equal(text.split(oldScripts[i].textContent).length,2,'Old validator not unique');
  text=text.replace(oldScripts[i].textContent,newScripts[i].textContent);changed++;
 }
 assert.equal(changed,1,'Only the recognized POST validator may change');
 assert.deepEqual(rows(parse(text)),rows(doc));
 assert.equal(controls(parse(text)),controls(next));
 return text;
}
let key='';
async function request(mode,options={}){return fetch('https://dav-hire-poker-8313.onpagelove.com/boards/'+mode+'.html',{...options,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,...options.headers}});}
async function run(){
 const outcomes=[];
 for(const mode of ['trial','daily']){
  const get=await request(mode);assert.equal(get.status,200);
  const before=await get.text(),etag=get.headers.get('etag');assert.ok(etag);
  const current=await fs.readFile('policy-candidates/boards/'+mode+'.html','utf8');
  try{verifyBoardDocument(before,mode);outcomes.push({mode,state:'already-current',rows:rows(parse(before)).length});continue;}catch{}
  const migrated=migrate(before,git(mode),current);verifyBoardDocument(migrated,mode);
  const backup=path.resolve('.local/board-identity-migration/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+mode+'.html');
  await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,before,{flag:'wx',mode:0o600});assert.equal(sha(await fs.readFile(backup)),sha(before));
  let write,error;try{write=await request(mode,{method:'PUT',headers:{'If-Match':etag,'Content-Type':'text/html; charset=utf-8'},body:migrated});}catch(e){error=e.message;}
  const readback=await request(mode);assert.equal(readback.status,200);const after=await readback.text();
  assert.equal(controls(parse(after)),controls(parse(migrated)),'Migration unconfirmed; inspect private baseline before retry');
  assert.deepEqual(rows(parse(after)),rows(parse(before)),'Existing row changed');verifyBoardDocument(after,mode);
  outcomes.push({mode,state:write?.ok?'conditionally-migrated':'reconciled-applied',status:write?.status||null,error:error||null,priorPolicySha256:sha(controls(parse(before))),policySha256:sha(controls(parse(after))),rowsPreserved:rows(parse(after)).length,rowHashes:rows(parse(after)),privateBackupVerified:true});
  await fs.writeFile(path.join(dir,'identity-migration.json'),JSON.stringify({utc:new Date().toISOString(),priorCommit:prior,scope:'Recognized validator identity change only; established controls and existing rows preserved',outcomes},null,2)+'\n');
 }
 return outcomes;
}
if(process.argv.includes('--self-test')){
 for(const mode of ['trial','daily']){
  const old=git(mode),next=await fs.readFile('policy-candidates/boards/'+mode+'.html','utf8');
  const row='<li itemscope itemtype="urn:ScrapLeague:Run"><meta itemprop="id" content="fixture-preserved"></li>';
  const populated=old.replace('</ul>',row+'</ul>');const result=migrate(populated,old,next);verifyBoardDocument(result,mode);assert.deepEqual(rows(parse(result)),rows(parse(populated)));
  assert.throws(()=>migrate(populated.replace('</body>','<p>Unrelated owner content</p></body>'),old,next));
 }
 console.log('Passed: exact prior recognition, single-validator change, populated row preservation and unknown-owner refusal');
}else{
 if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');let buffer='',busy=false;
 console.log('Ready for hidden JSON: migrate, quit');
 process.stdin.on('data',async chunk=>{if(chunk.includes('\u0003'))process.exit();buffer+=chunk;const end=buffer.search(/[\r\n]/);if(end<0)return;const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line||busy)return;busy=true;try{const c=JSON.parse(line);if(c.op==='quit')process.exit();assert.equal(c.op,'migrate');key=c.key;assert.ok(typeof key==='string'&&key.startsWith('pk_'));console.log(JSON.stringify(await run()));}catch(error){console.log(JSON.stringify({error:error.message}));}finally{key='';busy=false;}});
}
