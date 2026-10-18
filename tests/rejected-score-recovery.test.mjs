import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {DOMParser} from 'linkedom';
import {Boards,runHTML,RETENTION_MS,contentKeys} from '../app/boards.js';
import {openStore} from '../app/storage.js';
import {loadContent} from '../tools/content.mjs';
import {RULES} from '../app/builds.js';
const content=await loadContent(),keys=await contentKeys(content);
const run={id:crypto.randomUUID(),alias:'Recovery fixture',mode:'trial',trackId:content.tracks[0].track.id,
 trackRevision:content.tracks[0].revision,rulesRevision:RULES,buildRevision:[...keys.builds][0],
 assist:'steering-off:manual',laps:3,challenge:'',elapsedMs:90000,splits:[30000,30000,30000]};
const config={policyRevision:'isolated-recovery-fixture',paths:{trial:'/boards/trial.html',daily:'/boards/daily.html'}};

test('a player can explicitly retry a denied valid score with the same identity, reconcile lost acceptance and avoid automatic retries',async()=>{
 const store=await openStore({factory:new IDBFactory()});let posts=0,stored='';
 const board=new Boards(store,{config,Parser:DOMParser,fetcher:async(_url,options)=>{
  if(options.method==='POST'){
   posts++;assert.equal(options.body,runHTML(run));
   if(posts===1)return new Response('Permission unavailable',{status:403});
   const now=Date.now();stored=runHTML(run).replace('</li>',`<meta itemprop="receivedAt" content="${now}"><meta itemprop="expiresAt" content="${now+RETENTION_MS}"></li>`);
   throw Error('Accepted but response lost');
  }
  return new Response('<ul id="runs">'+stored+'</ul>');
 }});
 await store.enqueueRun(run);await board.pump();await board.pump();
 assert.equal(posts,1);assert.equal((await store.get('outbox:'+run.id)).state,'rejected');
 await board.retryRejected(run.id);
 const after=await store.get('outbox:'+run.id);assert.equal(after.state,'confirmed');assert.deepEqual(after.run,run);assert.equal(posts,2);
 await assert.rejects(board.retryRejected(run.id),/Only a rejected/);await board.pump();assert.equal(posts,2);store.close();
});

test('manual rejected-score retry cannot exceed pending capacity or mutate its captured score',async()=>{
 const store=await openStore({factory:new IDBFactory()});await store.enqueueRun(run);
 const claim=await store.claimRun('fixture');await store.settleRun(run.id,claim.lease.id,'rejected','403 fixture');
 for(let n=0;n<100;n++)await store.enqueueRun({...run,id:crypto.randomUUID()});
 const before=await store.get('outbox:'+run.id);
 await assert.rejects(store.retryRejectedRun(run.id),/queue is full/);
 assert.deepEqual(await store.get('outbox:'+run.id),before);store.close();
});
