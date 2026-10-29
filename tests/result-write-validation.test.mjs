import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openStore,freshProgress} from '../app/storage.js';

test('malformed unfinished results cannot make a saved campaign unreadable or award progress',async()=>{
 for(const invalid of [
  {dnf:undefined,splits:[]},
  {dnf:false,splits:[]},
  {dnf:false,splits:[1,2,3]},
 ]){
  const store=await openStore({factory:new IDBFactory()});
  const progress=freshProgress();progress.cup={id:'cup',index:0,rounds:[]};
  await store.set('progress',progress);
  const result={id:'invalid-run',key:'fixture',mode:'league',elapsedMs:12000,classification:[{id:'player'}],difficulty:'relaxed',...invalid};
  await assert.rejects(store.commitResult(result,null,'cup',0),/Invalid saved result/);
  assert.deepEqual(await store.get('progress'),progress);
  assert.equal(await store.get('result:invalid-run'),undefined);
  assert.equal(await store.get('best:fixture'),undefined);
  store.close();
 }
});
