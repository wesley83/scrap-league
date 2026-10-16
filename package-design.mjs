// Generate source review evidence for the design bundle, excluding self-referential outputs.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const rootFiles=(await readdir(root,{withFileTypes:true})).filter(e=>e.isFile()).map(e=>e.name).sort();
const referenceFiles=(await readdir(path.join(root,'references'))).map(f=>'references/'+f).sort();
const reviewed=[...rootFiles,...referenceFiles];
const entries=[];
for(const name of reviewed){const bytes=await readFile(path.join(root,name));entries.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const manifest={scope:'Design source and reference snapshots; excludes audit receipts, patch, this manifest and bundle archives to avoid self-reference',createdAtUtc:new Date().toISOString(),files:entries};
await writeFile(path.join(root,'audit','design-hashes.json'),JSON.stringify(manifest,null,2)+'\n');
let patch='';
for(const name of rootFiles){const source=await readFile(path.join(root,name),'utf8'),lines=source.replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');patch+=`diff --git a/games/scrap-league/${name} b/games/scrap-league/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/games/scrap-league/${name}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';}
await writeFile(path.join(root,'audit','design.patch'),patch);
process.stdout.write(JSON.stringify({hashedFiles:entries.length,reviewedNewFiles:rootFiles.length,scope:'games/scrap-league'})+'\n');
