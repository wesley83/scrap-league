export async function extraActions({api,frame,doc,win,home,click,button,check,waitFor,delay,connect}) {
 return {
  'Inspect campaign persistence':async()=>{
   const s=api().store;
   let readError=null;
   try{await s.get('progress');}catch(error){readError=error.message;}
   const raw=await s.atomic((tx,done)=>{
    const data={};let left=3;
    for(const [name,key] of [['progression','progress'],['cups','current'],['presets','garage']]){
     const req=tx.objectStore(name).get(key);req.onsuccess=()=>{data[name]=req.result;if(!--left)done(data);};
    }
   },'readonly');
   return{scope:'Diagnostic of owned isolated fixture, not a passing campaign',readError,raw,visibleProgress:api().progress};
  },
  'Root and composed dependency parity':async()=>{
   const load=async path=>{
    document.querySelector('#results').textContent='Parity: loading '+path;
    if(doc().querySelector('#screen-workshop')&&!doc().querySelector('#screen-workshop').hidden)
      await waitFor(()=>doc().querySelector('#draft-status')?.textContent.startsWith('Draft saved'));
    const before=doc();frame.src=path;
    await waitFor(()=>doc()!==before&&(doc().querySelector('#loading')?.hidden||doc().querySelector('#loading')?.getAttribute('role')==='alert'));
   };
   const appearance=()=>{const el=doc().querySelector('#settings-button'),s=win().getComputedStyle(el),r=el.getBoundingClientRect();return {font:s.fontFamily,fontSize:s.fontSize,color:s.color,background:s.backgroundColor,minHeight:s.minHeight,height:r.height,core:win().getComputedStyle(doc().documentElement).getPropertyValue('--scrap-core-ready').trim(),arcade:win().getComputedStyle(doc().documentElement).getPropertyValue('--scrap-arcade-ready').trim(),viewport:[win().innerWidth,win().innerHeight]};};
   await load('/?parity-root='+Date.now());const root=appearance();
   await load('/editor/yard-loop');await waitFor(()=>!doc().querySelector('#screen-workshop').hidden&&doc().querySelector('#track-name'));const composed=appearance();
   check(JSON.stringify(root)===JSON.stringify(composed),'Root/composed control typography or style differs');
   const results=[];
   try{
    for(const path of ['/?style-fault=1','/editor/yard-loop']){
     await fetch('/__audit__/fault?value=css',{method:'POST'});
     await load(path);
     const css=[...doc().querySelectorAll('link[rel=stylesheet]')].find(l=>l.href.endsWith('/arcade.css'));
     const response=await fetch(css.href,{cache:'no-store'});
     check(response.status===503&&(css.sheet?.cssRules.length??0)===0,'Missing dependency not established');
     check(!doc().querySelector('#loading').hidden&&!doc().querySelector('#startup-retry').hidden,'Missing dependency has no recovery');
     check(doc().querySelector('#stage').inert&&doc().querySelector('#header').inert,'Failed startup exposed controls');
     await fetch('/__audit__/fault?value=none',{method:'POST'});
     const beforeReload=doc();doc().querySelector('#startup-retry').click();
     await waitFor(()=>doc()!==beforeReload&&doc().querySelector('#loading')?.hidden);
     check(doc().querySelector('#loading').hidden&&!doc().querySelector('#stage').inert,'Ordinary reload did not recover');
     results.push({path,faultStatus:response.status,reloadRecovered:true});
    }
    return {root,composed,results,scope:'Actual browser, local include emulation; public host composition read separately'};
   }finally{await fetch('/__audit__/fault?value=none',{method:'POST'});await load('/?parity-return='+Date.now());await connect();}
  },
  'Qualified first-entry failure and export':async()=>{
   frame.src='/?qualified-entry='+Date.now();await new Promise(r=>frame.addEventListener('load',r,{once:true}));await connect();await home();
   const current=api(),store=current.store,original=store.keys;
   check(!current.workshop.track,'Fixture must start without an editor source');
   let reached=0;
   store.keys=async()=>{reached++;throw Error('Qualified first-entry storage-read failure');};
   try{
    click('workshop-button');
    await waitFor(()=>current.view==='workshop'&&doc().querySelector('#modal')?.open);
    check(reached===1,'Fault did not reach actual first editor listing');
    check(current.workshop.track?.pieces.length>0,'No valid recovery source');
    check(doc().querySelector('#modal-title').textContent==='Saved drafts need recovery','Wrong recovery dialog');
    button('Continue with separate copy').click();
    const field=doc().querySelector('#track-name');field.value='Qualified first-entry recovery';field.dispatchEvent(new(win().Event)('change'));
    store.keys=original;
    await current.workshop.flush();
    click('work-file');await waitFor(()=>doc().querySelector('[data-file="export"]'));
    let exported;const download=current.workshop.download;current.workshop.download=(name,html)=>{exported={name,html};};
    try{doc().querySelector('[data-file="export"]').click();await waitFor(()=>exported);}finally{current.workshop.download=download;}
    check(exported.html.includes('Qualified first-entry recovery'),'Export lost recovered edits');
    return {actualEntry:'Track Workshop button',positiveControl:'Fresh game ready; editor has no source',faultReached:reached,sourcePreserved:true,normalFilesExport:true,exportBytes:exported.html.length,limits:'Download capture intercepts file delivery only; no disk delivery claim'};
   }finally{store.keys=original;}
  },
  'Required CSS missing is recoverable':async()=>{
   await fetch('/__audit__/fault?value=css',{method:'POST'});
   try{
    frame.src='/?missing-css='+Date.now();await new Promise(r=>frame.addEventListener('load',r,{once:true}));
    await delay(500);
    const css=[...doc().querySelectorAll('link[rel=stylesheet]')].find(l=>l.href.endsWith('/arcade.css'));
    const faultResponse=css&&await fetch(css.href,{cache:'no-store'});
    const rules=css?.sheet?.cssRules.length??0;
    check(css&&faultResponse.status===503&&rules===0,'Fault fixture did not omit arcade.css');
    const loading=doc().querySelector('#loading'),retry=doc().querySelector('#startup-retry');
    check(loading&&!loading.hidden&&retry&&!retry.hidden,'Missing required CSS allowed ordinary game entry without recovery');
    check(doc().querySelector('#loading-message').textContent.includes('could not open'),'No useful dependency failure');
    return{fault:'arcade.css HTTP 503',faultObserved:{status:faultResponse.status,rules},recoveryVisible:true};
   }finally{
    await fetch('/__audit__/fault?value=none',{method:'POST'});
    frame.src='/?css-restored='+Date.now();await new Promise(r=>frame.addEventListener('load',r,{once:true}));await connect();
   }
  }
 };
}
