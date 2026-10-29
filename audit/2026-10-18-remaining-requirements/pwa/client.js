// Source-authored test controls. No changes to the production app or worker.
const meta = await (await fetch('/__verify__/state')).json();
const frames = ['one','two'].map(id=>document.getElementById(id));
const output = document.getElementById('results'), results=[];
const A=meta.A, B=meta.B;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(ok,message)=>{if(!ok)throw Error(message);};
async function until(fn,description,ms=30000){const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('Timed out: '+description);await wait(80);}}
const doc=i=>frames[i].contentDocument;
const q=(i,s)=>doc(i)?.querySelector(s);
const release=i=>q(i,'base')?.getAttribute('href')?.match(/sl-[a-f0-9]{14}/)?.[0];
const click=(i,s)=>{const e=q(i,s);check(e,'Missing '+s);e.click();};
const action=(i,text)=>{const e=[...doc(i).querySelectorAll('#modal-actions button')].find(b=>b.textContent===text);check(e,'Missing action '+text);e.click();};
const stage=async(params)=>{const r=await fetch('/__verify__/state?'+new URLSearchParams(params),{method:'POST'});check(r.ok,'Stage request failed');return r.json();};
const {workerRequest}=await import(`/releases/${B}/offline.js`);
const {openStore,freshProgress}=await import(`/releases/${B}/storage.js`);
const {defaultSettings}=await import(`/releases/${B}/preferences.js`);
let store, before;
navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data?.type==='PREPARE_UPDATE')e.ports[0]?.postMessage({token:e.data.token,safe:true});
  if(e.data?.type==='RELEASE_QUERY')e.ports[0]?.postMessage({token:e.data.token,release:B});
});
async function saved(){const b=await store.exportBackup();return JSON.stringify(b.entries.sort((x,y)=>(x.store+':'+x.key).localeCompare(y.store+':'+y.key)));}
async function load(i){const old=doc(i);frames[i].src='/';await until(()=>doc(i)!==old&&q(i,'#loading')?.hidden,'game document loads');}
async function checkDialog(i=0){click(i,'#settings-button');await until(()=>q(i,'#update-app'),'Settings opens');click(i,'#update-app');await until(()=>q(i,'#modal-title')?.textContent==='New release ready','update dialog');}
async function leaveRace(i=1){if(!q(i,'#modal')?.open)click(i,'#pause-button');action(i,'Leave race');await until(()=>q(i,'#modal-title')?.textContent==='Leave this attempt?','leave confirmation');action(i,'Leave race');await until(()=>q(i,'#stage')?.className==='view-start','yard');}
async function record(name,run){output.textContent='Running '+name;try{const detail=await run();results.push({name,status:detail?.gap?'gap':'passed',detail,utc:new Date().toISOString()});}catch(e){results.push({name,status:'failed',error:e.message,utc:new Date().toISOString()});}output.textContent=JSON.stringify(results,null,2);await fetch('/__verify__/receipt',{method:'POST',body:JSON.stringify({utc:new Date().toISOString(),subjects:meta,environment:navigator.userAgent,scope:'Real service workers on isolated localhost; synthetic progression; ordinary game UI for draft edits and activation; no physical device or process restart claim',results})});}
const actions={
  '1. Install A and prepare saved data':async()=>{
    await stage({phase:'A',offline:false,corrupt:false});
    check(!(await navigator.serviceWorker.getRegistration('/')),'Origin was not fresh');
    store=await openStore();
    const p=freshProgress();p.completed=[1,2];p.medals={'1:club':3,'2:club':2};p.history=['synthetic-update-fixture'];p.presets=[{name:'Verification car',build:{...p.build}}];
    await store.set('progress',p);
    await store.set('settings',{...defaultSettings(),northUp:true,sensitivity:1.2});
    await load(0);
    await until(()=>q(0,'#offline-state')?.textContent==='Offline pack verified','A installed');
    const r=await navigator.serviceWorker.ready;
    check((await workerRequest(r.active,'STATUS')).release===A,'Wrong initial worker');
    click(0,'#workshop-button');
    await until(()=>q(0,'#stage')?.className==='view-workshop'&&q(0,'#track-name')?.value.includes('copy'),'Workshop draft opened');
    q(0,'#track-name').value='PWA update retention fixture';
    q(0,'#track-name').dispatchEvent(new frames[0].contentWindow.Event('change',{bubbles:true}));
    await until(async()=>q(0,'#draft-status')?.textContent.startsWith('Draft saved')&&(await Promise.all((await store.keys('draft:')).map(k=>store.get(k)))).some(d=>d.track.name==='PWA update retention fixture'),'named draft saved');
    click(0,'#home');
    await until(()=>q(0,'#stage')?.className==='view-start','yard');
    await load(1);
    check(release(0)===A&&release(1)===A,'A documents not loaded');
    return {active:A,windows:2,syntheticCompletedEvents:[1,2],draftName:'PWA update retention fixture',customSettings:true};
  },
  '2. Automatic notice while another window races':async()=>{
    click(1,'#daily-button');await until(()=>q(1,'#modal-title')?.textContent==='DAILY SPEC','daily dialog');action(1,'Race this specification');
    await until(()=>q(1,'#stage')?.className==='view-race'&&q(1,'#countdown')?.textContent==='','race started');
    const racingDocument=doc(1),time=q(1,'#hud-time').textContent;
    await stage({phase:'B'});
    // Reload is the player's reopen/navigation trigger; no manual update API call.
    const old=doc(0);frames[0].contentWindow.location.reload();
    await until(()=>doc(0)!==old&&q(0,'#loading')?.hidden,'reopened A');
    await until(()=>q(0,'#offline-state')?.textContent==='Update verified · apply from the yard','automatic update notice',45000);
    const r=await navigator.serviceWorker.getRegistration('/');
    check((await workerRequest(r.active,'STATUS')).release===A,'Update activated without consent');
    check((await workerRequest(r.waiting,'STATUS')).release===B,'Wrong waiting worker');
    check(release(0)===A&&release(1)===A,'Document changed before apply');
    check(!q(0,'#modal').open,'Unexpected automatic update popup');
    check(doc(1)===racingDocument&&q(1,'#stage').className==='view-race','Race interrupted by update detection');
    check(q(1,'#hud-time').textContent!==time,'Race time did not advance');
    return {trigger:'Normal game reload; no Check offline pack click',active:A,waiting:B,notice:q(0,'#offline-state').textContent,automaticPopup:false,raceDocumentUnchanged:true,raceTimeAdvanced:true};
  },
  '3. Later defers; racing window blocks activation':async()=>{
    await checkDialog();action(0,'Later');
    check(!(q(0,'#modal').open),'Later failed to dismiss');
    let r=await navigator.serviceWorker.getRegistration('/');check((await workerRequest(r.active,'STATUS')).release===A,'Later activated update');
    await checkDialog();const racingDocument=doc(1);action(0,'Apply update');
    await until(()=>doc(0).body.textContent.includes('Finish or leave the race and return every game window to the yard.'),'race veto explanation');
    r=await navigator.serviceWorker.getRegistration('/');check((await workerRequest(r.active,'STATUS')).release===A,'Unsafe update activated');
    check(doc(1)===racingDocument&&release(1)===A,'Racing document replaced');
    await until(()=>!q(0,'#stage').inert&&!q(0,'#header').inert,'cancel unlock');
    return {laterKeepsA:true,unsafeActivationRefused:true,racingDocumentUnchanged:true,uiUnlockedAfterVeto:true,message:'Finish or leave the race and return every game window to the yard.'};
  },
  '4. Workshop also blocks; apply safely and preserve data':async()=>{
    await leaveRace();click(1,'#workshop-button');await until(()=>q(1,'#stage')?.className==='view-workshop','Workshop');
    await checkDialog();action(0,'Apply update');
    await wait(500);
    let r=await navigator.serviceWorker.getRegistration('/');check((await workerRequest(r.active,'STATUS')).release===A,'Workshop failed to veto');
    check(q(1,'#stage').className==='view-workshop','Workshop replaced');
    click(1,'#home');await until(()=>q(1,'#stage')?.className==='view-start','second window in yard');
    await until(()=>!q(0,'#header').inert,'first window unlocked');
    before=await saved();
    await checkDialog();action(0,'Apply update');
    await until(()=>release(0)===B&&release(1)===B&&q(0,'#loading')?.hidden&&q(1,'#loading')?.hidden,'both windows on B',45000);
    await until(()=>q(0,'#offline-state')?.textContent==='Offline pack verified','B pack verified');
    r=await navigator.serviceWorker.getRegistration('/');check((await workerRequest(r.active,'STATUS')).release===B,'B not active');
    check(await saved()===before,'Saved records changed across update');
    click(0,'#workshop-button');await until(()=>q(0,'#track-name')?.value==='PWA update retention fixture','draft visible after update');
    click(0,'#home');
    return {workshopVeto:true,bothWindowsReloaded:true,active:B,allSavedRecordsByteEquivalent:true,recordCount:JSON.parse(before).length,draftVisibleAfterUpdate:true};
  },
  '5. Failed download retains verified B':async()=>{
    await stage({phase:'A',corrupt:true});
    const old=doc(0);frames[0].contentWindow.location.reload();
    await until(()=>doc(0)!==old&&q(0,'#loading')?.hidden,'B reopens');
    await until(()=>q(0,'#offline-state')?.textContent==='New pack failed · previous release retained','failed installation notice',45000);
    const r=await navigator.serviceWorker.getRegistration('/');
    check(!r.waiting,'Failed worker offered for activation');
    check((await workerRequest(r.active,'STATUS')).release===B,'Previous B lost');
    check(release(0)===B,'Wrong running release');
    await stage({phase:'B',corrupt:false});
    return {injection:'A worker with a corrupt A main.js download',failedPackNotOffered:true,active:B,notice:q(0,'#offline-state').textContent};
  },
  '6. Offline reload keeps updated game and saves':async()=>{
    await stage({offline:true});
    try {
      check((await fetch('/network-proof?uncached=1')).status===503,'Network failure was not active');
      const old=doc(0);frames[0].contentWindow.location.reload();
      await until(()=>doc(0)!==old&&q(0,'#loading')?.hidden,'offline reload');
      check(release(0)===B,'Offline reopen reverted release');
      click(0,'#workshop-button');await until(()=>q(0,'#track-name')?.value==='PWA update retention fixture','offline draft retained');
      const p=await store.get('progress');check(p.completed.join(',')==='1,2','Progress lost offline');
      check((await store.get('settings')).sensitivity===1.2,'Settings lost offline');
      return {network503:true,newDocument:true,release:B,draftVisible:true,progressRetained:true,settingsRetained:true,scope:'Existing browser process; no OS installation or process restart claim'};
    } finally {await stage({offline:false});}
  },
  '7. Manual check during a slow new download':async()=>{
    store=await openStore();
    await stage({phase:'B',offline:false,corrupt:false,delay:0});
    await load(0);await load(1);
    await until(()=>q(0,'#offline-state')?.textContent==='Offline pack verified','B initially verified');
    check(release(0)===B,'Expected B before slow next-update test');
    await stage({phase:'A',corrupt:false,delay:3000});
    click(0,'#settings-button');await until(()=>q(0,'#update-app'),'Settings opens');click(0,'#update-app');
    await until(()=>q(0,'#toast')?.textContent==='Offline files checked and verified.'||q(0,'#modal-title')?.textContent==='New release ready','manual check initial response');
    const firstMessage=q(0,'#toast')?.textContent,firstDialog=q(0,'#modal-title')?.textContent;
    await until(()=>q(0,'#offline-state')?.textContent==='Update verified · apply from the yard','slow update completed',45000);
    const afterDownloadDialog=q(0,'#modal-title')?.textContent;
    const r=await navigator.serviceWorker.getRegistration('/');
    check((await workerRequest(r.active,'STATUS')).release===B,'Update applied without consent');
    check((await workerRequest(r.waiting,'STATUS')).release===A,'New pack not waiting');
    const needsSecondCheck=afterDownloadDialog!=='New release ready';
    click(0,'#update-app');await until(()=>q(0,'#modal-title')?.textContent==='New release ready','second check reaches Apply update');
    await stage({phase:'B',delay:0});
    return {gap:needsSecondCheck,trigger:'Manual check discovers a valid next worker; its main.js download is delayed 3 seconds',firstMessage,firstDialog,afterDownloadDialog,needsSecondCheck,secondCheckShowsApplyUpdate:true,active:B,waiting:A,scope:'A retained release is used as the valid next update; it is not activated'};
  }
};
for(const [name,run] of Object.entries(actions)){const button=document.createElement('button');button.textContent=name;button.style.cssText='padding:10px;cursor:pointer';button.onclick=()=>record(name,run);document.getElementById('actions').append(button);}
output.textContent='Ready. Run numbered checks in sequence.';
