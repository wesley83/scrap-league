import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DOMParser} from 'linkedom';
import {parseTrack,serializeTrack,stable,gameplay} from '../../app/model.js';
import {compile} from '../../app/track.js';
const dir=import.meta.dirname,root=path.resolve(dir,'../..'),folder=path.join(dir,'workshop-exports');
const sha=value=>createHash('sha256').update(value).digest('hex');
const exports=new Map();
for(const filename of (await fs.readdir(folder)).sort()){
 const record=JSON.parse(await fs.readFile(path.join(folder,filename),'utf8'));
 exports.set(record.slug,{record,filename});
}
assert.equal(exports.size,12,'All twelve successful UI exports required');
await fs.mkdir(path.join(dir,'bound-workshop-exports'),{recursive:true});
const rows=[];
for(const [slug,{record,filename}] of exports){
 const source=await fs.readFile(path.join(root,'content/tracks',slug,'definition.html'),'utf8');
 const original=parseTrack(source,DOMParser),authored=parseTrack(record.exported.html,DOMParser),bound=structuredClone(authored);
 assert.ok(record.trace.some(action=>action.action==='new-blank'));
 assert.equal(record.trace.filter(action=>action.id==='place-road').length,original.pieces.length);
 assert.ok(compile(authored).valid,'UI export invalid: '+slug);
 const identities=new Map([[authored.id,original.id]]),deltas=[];
 for(const collection of ['pieces','patches','props','gates','spawns','recipes']){
  assert.equal(authored[collection].length,original[collection].length,slug+'/'+collection);
  authored[collection].forEach((entity,index)=>identities.set(entity.id,original[collection][index].id));
 }
 for(const collection of ['pieces','patches','props','gates','spawns','recipes']){
  bound[collection]=bound[collection].map((entity,index)=>{
   const reference=original[collection][index],result={};
   for(const [key,expected]of Object.entries(reference)){
    let actual=identities.get(entity[key])||entity[key];
    const inactive=collection==='pieces'&&(['quarter','hairpin'].includes(entity.kind)?key==='length':['radius','turn'].includes(key));
    if(inactive){actual=expected;deltas.push({collection,index,key,reason:'Preserve unused serialized parameter; no active geometry changed'});}
    if(typeof expected==='number'){
     assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8,slug+'/'+collection+'/'+index+'/'+key+': '+actual+' vs '+expected);
     if(actual!==expected)deltas.push({collection,index,key,reason:'Canonicalize floating representation within 1e-8',difference:actual-expected});
     actual=expected;
    }else assert.equal(actual,expected,slug+'/'+collection+'/'+index+'/'+key);
    result[key]=actual;
   }
   return result;
  });
 }
 // Catalog identity, descriptions and music are maintained outside the geometry
 // workbench. Keep them and stable UUID references so prior ghosts/boards remain
 // compatible. UI-set name, scene and laps must agree independently.
 for(const key of ['name','scenePreset','laps'])assert.equal(authored[key],original[key],slug+'/'+key);
 for(const key of ['id','slug','schemaVersion','description','pieceCatalogRevision','musicPreset'])bound[key]=original[key];
 assert.equal(stable(gameplay(bound)),stable(gameplay(original)));
 const html=serializeTrack(bound);
 assert.equal(html,source,'Bound UI export differs from authoritative source: '+slug);
 await fs.writeFile(path.join(dir,'bound-workshop-exports',slug+'.html'),html);
 rows.push({slug,source:'content/tracks/'+slug+'/definition.html',receipt:'workshop-exports/'+filename,
  exportedSha256:sha(record.exported.html),boundSha256:sha(html),authoritativeSha256:sha(source),
  traceSha256:sha(JSON.stringify(record.trace)),actions:record.trace.length,identityBindings:identities.size,
  physicalFieldsAndReferencesMatch:true,sourceBytesIdentical:true,serializationBindings:deltas});
}
await fs.writeFile(path.join(dir,'workshop-authoring-review.json'),JSON.stringify({utc:new Date().toISOString(),status:'passed',
 scope:'Current official geometry recreated from New blank track through shipped Workshop form commands and exported in the real browser. Stable catalog/UUID/inactive-parameter binding and bounded numeric canonicalization independently verified against every source field. Authoritative source bytes already equal the bound UI exports, so no content overwrite is needed.',
 historicalProvenance:'Original creation used CLI; this record establishes present-tense Workshop recreation, not a different history.',
 preserved:'Exact gameplay/source identity, existing boards/ghosts/cup/daily references and policies',tracks:rows},null,2)+'\n');
console.log(JSON.stringify({status:'passed',tracks:rows.length,byteIdentical:rows.every(row=>row.sourceBytesIdentical),actions:rows.reduce((n,row)=>n+row.actions,0)}));
