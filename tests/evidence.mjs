import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Keep the old named receipts historical. A new run cannot overwrite them or
// make an old acceptance ledger silently refer to a different observation.
export async function retainEvidence(legacyURL,content) {
 const legacy=fileURLToPath(legacyURL),bytes=Buffer.from(content);
 const digest=createHash('sha256').update(bytes).digest('hex');
 const folder=path.join(path.dirname(legacy),'runs');
 await mkdir(folder,{recursive:true});
 const target=path.join(folder,path.basename(legacy,'.json')+'-'+digest+'.json');
 try { await writeFile(target,bytes,{flag:'wx'}); }
 catch(error) {
  if(error.code!=='EEXIST')throw error;
  if(!(await readFile(target)).equals(bytes))throw Error('Retained evidence identity collision');
 }
 return target;
}
