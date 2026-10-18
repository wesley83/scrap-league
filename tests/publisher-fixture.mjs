import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {SOURCE_DIRS,SOURCE_FILES,sourceIdentity,verifyCandidateArtifacts} from "../tools/release-gate.mjs";
const root=path.resolve(import.meta.dirname,"..");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");

export async function publisherFixture(scenario) {
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),"scrap-command-"));
 for(const file of [...SOURCE_DIRS,...SOURCE_FILES])await fs.cp(path.join(root,file),path.join(fixture,file),{recursive:true});
 const original=JSON.parse(await fs.readFile(path.join(root,"dist/release.json"),"utf8"));
 for(const file of ["index.html","sw.js","release.json","native-routes","releases/"+original.release])
  await fs.cp(path.join(root,"dist",file),path.join(fixture,"dist",file),{recursive:true});
 await fs.symlink(path.join(root,"node_modules"),path.join(fixture,"node_modules"),"junction");
 await fs.mkdir(path.join(fixture,"audit"),{recursive:true});
 // An explicit synthetic isolated contract, never copied to game acceptance.
 const required=[{id:"FIXTURE",stage:"staged",outcome:"Exercise publisher against isolated host",method:"Controlled command fixture"}];
 await fs.writeFile(path.join(fixture,"requirements.json"),JSON.stringify({version:2,required}));
 original.sourceHash=(await sourceIdentity(fixture)).hash;
 await fs.writeFile(path.join(fixture,"dist/release.json"),JSON.stringify(original));
 const candidate=await verifyCandidateArtifacts(fixture);
 await fs.writeFile(path.join(fixture,"audit/fixture.txt"),"Isolated publisher mechanics; not game acceptance");
 const receipt={release:candidate.release,sourceHash:candidate.source.hash,outputHash:candidate.outputHash,
  requirements:[{id:"FIXTURE",status:"passed",artifacts:[{path:"audit/fixture.txt",sha256:sha("Isolated publisher mechanics; not game acceptance")}]}]};
 await fs.writeFile(path.join(fixture,"audit/current-acceptance.json"),JSON.stringify(receipt));
 const initial={"/index.html":"<html><head><title>A</title></head><body>Previous game</body></html>",
  "/release.json":JSON.stringify({release:"sl-aaaaaaaaaaaaaa",files:[{url:"./releases/sl-aaaaaaaaaaaaaa/main.js",hash:sha("previous-client")}]}),
  "/sw.js":"// Previous verified worker", "/releases/sl-aaaaaaaaaaaaaa/main.js":"previous-client",
  "/boards/trial.html":"existing unrelated player rows", "/workshop-catalog.html":"existing owned catalog", "/workshop-tracks/player.html":"existing owned track"};
 const state={scenario,files:Object.fromEntries(Object.entries(initial).map(([key,value])=>[key,{bytes:Buffer.from(value).toString("base64"),etag:'"A"'}])),requests:[],faultUsed:false,version:0,rootWritten:false};
 await fs.writeFile(path.join(fixture,"audit/host.json"),JSON.stringify(state));
 await fs.writeFile(path.join(fixture,"audit/adapter.mjs"),adapter);
 const child=spawn(process.execPath,["--import","./audit/adapter.mjs","tools/deploy-pagelove.mjs"],{cwd:fixture,stdio:["pipe","pipe","pipe"]});
 let buffer="",pending=null,stderr="";const output=[];
 child.stderr.on("data",chunk=>stderr+=chunk);
 child.stdout.on("data",chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.startsWith("{"))continue;const row=JSON.parse(line);output.push(row);if(pending&&!row.staged){const {resolve,timer}=pending;pending=null;clearTimeout(timer);resolve(row);}}});
 child.on("exit",()=>{if(pending){const {reject,timer}=pending;pending=null;clearTimeout(timer);reject(Error("CLI exited: "+stderr));}});
 const command=data=>new Promise((resolve,reject)=>{assert.equal(pending,null);const timer=setTimeout(()=>{pending=null;reject(Error("CLI timeout: "+stderr));},60000);pending={resolve,reject,timer};child.stdin.write(JSON.stringify(data)+"\n");});
 const host=async()=>JSON.parse(await fs.readFile(path.join(fixture,"audit/host.json"),"utf8"));
 const journals=async()=>{const dir=path.join(fixture,"audit/deployments");return (await fs.readdir(dir)).sort();};
 const records=async name=>(await fs.readFile(path.join(fixture,"audit/deployments",name),"utf8")).trim().split("\n").map(JSON.parse);
 const auth=await command({op:"auth",key:"pk_fixture"});assert.equal(auth.authenticated,true);
 const baselines=await fs.readdir(path.join(fixture,".local/deployment-baselines"));
 return {fixture,command,host,journals,records,baseline:baselines[0],initial,output,
  async editHost(edit){const state=await host();edit(state);await fs.writeFile(path.join(fixture,'audit/host.json'),JSON.stringify(state));},
  async stop(){
   if(child.exitCode!==null||child.signalCode!==null)return;
   await new Promise(resolve=>{child.once('close',resolve);child.stdin.end();child.kill();});
  },
  async clean(){
   await this.stop();
   // Verify the exact mkdtemp descendant, and unlink the dependency junction
   // before recursive cleanup so no shared dependencies can be traversed.
   assert.equal(path.dirname(path.resolve(fixture)),path.resolve(os.tmpdir()));
   assert.ok(path.basename(fixture).startsWith("scrap-command-"));
   await fs.unlink(path.join(fixture,"node_modules"));
   await fs.rm(fixture,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }};
}

const adapter=String.raw`
import fs from 'node:fs/promises';
import path from 'node:path';
import {DOMParser} from 'linkedom';
const root=process.cwd(), file=path.join(root,'audit/host.json');
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);if(!['hire-poker-8313.onpagelove.com','dav-hire-poker-8313.onpagelove.com'].includes(u.hostname))throw Error('Fixture refused unknown host');
 const state=JSON.parse(await fs.readFile(file,'utf8')),isOwner=u.hostname.startsWith('dav-'),method=options.method||'GET';
 const name=u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname),headers=new Headers(options.headers);
 const save=async()=>fs.writeFile(file,JSON.stringify(state));
 const respond=async(status,bytes='',etag=null)=>{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.txt':'text/plain','.webmanifest':'application/manifest+json'};
  let type=/^\/(editor|track)\//.test(name)?'text/html':types[path.extname(name)]||'application/octet-stream';
  if(!isOwner&&state.scenario==='wrong-dependency-type'&&name.endsWith('.js'))type='text/plain';
  state.requests.push({method,path:name,owner:isOwner,status});await save();return new Response(bytes,{status,headers:{...(etag?{'ETag':etag}:{}),'Content-Type':type}});
 };
 if(method==='PROPFIND')return respond(207,'');
 if(isOwner&&headers.get('Authorization')!=='Bearer pk_fixture')return respond(401,'');
 if(method==='MKCOL')return respond(201,'');
 if(method==='GET'){
  if(state.rootWritten&&!state.readFaultUsed&&((state.scenario==='post-write-public-failure'&&!isOwner&&name==='/index.html')||(['post-write-DAV-failure','ambiguous-unreadable'].includes(state.scenario)&&isOwner&&name==='/index.html'))){state.readFaultUsed=true;return respond(503,'qualified read failure');}
  const item=state.files[name];let bytes=item?Buffer.from(item.bytes,'base64'):'';
  if(item&&!isOwner&&/^\/(editor|track)\//.test(name)){
   const doc=new DOMParser().parseFromString(bytes.toString(),'text/html');
   for(const include of doc.querySelectorAll('p\\:include')){
    const resource=state.files[include.getAttribute('resource')];if(!resource)throw Error('Controlled host dependency missing');
    const source=new DOMParser().parseFromString(Buffer.from(resource.bytes,'base64').toString(),'text/html');
    const fragment=source.querySelector(include.getAttribute('selector'));if(!fragment)throw Error('Controlled host selector missing');include.replaceWith(fragment);
   }
   if(state.scenario==='composed-style-loss'&&!state.faultUsed){doc.querySelector('link[rel="stylesheet"]')?.remove();state.faultUsed=true;}
   bytes=doc.toString();
  }
  return respond(item?200:404,bytes,item?.etag);
 }
 if(method!=='PUT'||!isOwner)return respond(405,'');
 const before=state.files[name];
 if((headers.get('If-Match')&&headers.get('If-Match')!==before?.etag)||(headers.get('If-None-Match')==='*'&&before))return respond(412,'');
 if(!headers.has('If-Match')&&!headers.has('If-None-Match'))return respond(428,'');
 const rootWrite=name==='/index.html';
 const lose=!state.faultUsed&&((rootWrite&&['ambiguous-applied','ambiguous-not-applied','ambiguous-unreadable'].includes(state.scenario))||(state.scenario==='rollback-ambiguous'&&name==='/release.json'));
 if(lose&&state.scenario==='ambiguous-not-applied'){state.faultUsed=true;state.requests.push({method,path:name,owner:isOwner,status:'lost-not-applied'});await save();throw Error('Response lost before application');}
 state.files[name]={bytes:Buffer.from(options.body).toString('base64'),etag:'"v'+(++state.version)+'"'};
 if(rootWrite)state.rootWritten=true;
 if(state.scenario==='gate-change-after-native'&&!state.faultUsed&&name.startsWith('/track/')){
  state.faultUsed=true;const p=path.join(root,'audit/current-acceptance.json'),ledger=JSON.parse(await fs.readFile(p,'utf8'));ledger.requirements[0].status='failed';await fs.writeFile(p,JSON.stringify(ledger));
 }
 if(lose){state.faultUsed=true;state.requests.push({method,path:name,owner:isOwner,status:'lost-applied'});await save();throw Error('Response lost after application');}
 return respond(before?200:201,'');
};
`;
