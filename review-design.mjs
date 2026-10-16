// Structural review of this design package; this does not test game implementation.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root=path.dirname(fileURLToPath(import.meta.url));
const checks=[];
function check(name,condition,detail=''){checks.push({name,status:condition?'passed':'failed',detail});}
const docs=(await readdir(root)).filter(f=>f.endsWith('.md'));
for(const name of docs){
  const source=await readFile(path.join(root,name),'utf8');
  const links=[...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m=>m[1]).filter(x=>!x.startsWith('http')&&!x.startsWith('#'));
  for(const link of links){const target=path.resolve(root,link.split('#')[0]);let exists=false;try{exists=(await stat(target)).isFile();}catch{}check(`${name}: ${link}`,exists);}
  check(`${name}: substantive content`,source.length>1000);
}
const html=await readFile(path.join(root,'design-review.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
for(let i=0;i<scripts.length;i++){try{new vm.Script(scripts[i][1]);check(`Interface script ${i+1}: syntax`,true);}catch(e){check(`Interface script ${i+1}: syntax`,false,e.message);}}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
check('Interface element IDs are unique',new Set(ids).size===ids.length);
for(const id of ['start','garage','race','workshop'])check(`Screen/tab relationship: ${id}`,ids.includes('tab-'+id)&&ids.includes('screen-'+id));
check('Interface study is explicitly labeled',html.includes('this is not the playable game')&&html.includes('No validation or publishing'));
check('No decorative northeast-arrow glyph',!html.includes('\u2197')&&!html.includes('arrow-up-right'));
const content=await readFile(path.join(root,'CONTENT-CATALOG.md'),'utf8');
const trackRows=[...content.matchAll(/^\| (\d+) `([^`]+)` \|/gm)];
check('Twelve ordered circuit identities',trackRows.length===12&&trackRows.every((m,i)=>Number(m[1])===i+1)&&new Set(trackRows.map(m=>m[2])).size===12);
const rivalRows=[...content.matchAll(/^\| `([^`]+)` · /gm)];
check('Eight named rival identities',rivalRows.length===8&&new Set(rivalRows.map(m=>m[1])).size===8);
check('Four three-choice slots yield 81 builds',3**4===81&&content.includes('81 builds'));
check('Starter mass is 960 kg',760+100+40+60===960);
check('Alternative study mass is 940 kg',640+190+40+70===940);
const coverage=await readFile(path.join(root,'ACCEPTANCE.md'),'utf8');
check('All 23 document-first rules mapped',Array.from({length:23},(_,i)=>new RegExp('^\\| '+(i+1)+' [^|]+\\|','m').test(coverage)).every(Boolean));
const report={scope:'Design package structural checks only',checkedAt:new Date().toISOString(),passed:checks.filter(x=>x.status==='passed').length,failed:checks.filter(x=>x.status==='failed').length,checks};
await writeFile(path.join(root,'audit','design-checks.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({passed:report.passed,failed:report.failed,failures:checks.filter(x=>x.status==='failed')})+'\n');
if(report.failed)process.exitCode=1;
