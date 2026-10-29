const frame=document.querySelector('#game'),output=document.querySelector('#results'),results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms)),until=async fn=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error('Readiness timeout');await delay(40);}};
const doc=()=>frame.contentDocument,win=()=>frame.contentWindow,api=()=>win().__layoutReview.review;
await until(()=>win().__layoutReview?.document===doc());await win().__layoutReview.ready;
const check=(v,m)=>{if(!v)throw Error(m);},click=id=>doc().getElementById(id).click(),button=name=>[...doc().querySelectorAll('dialog[open] button')].find(e=>e.textContent.trim()===name);
async function home(){if(win().getComputedStyle(doc().body).getPropertyValue('--host-footer-space').trim()!=='32px')throw Error('Provider-footer fixture was not qualified');doc().querySelector('dialog')?.close();if(api().race?.state==='racing')api().pause();doc().querySelector('dialog')?.close();api().show('start');await delay(30);}
async function size(w,h){frame.style.width=w+'px';frame.style.height=h+'px';await delay(60);check(win().innerWidth===w&&win().innerHeight===h,'Viewport did not apply');}
function geometry(el){const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};}
async function reach(selector){const rows=[];for(const el of doc().querySelectorAll(selector)){if(!el.getClientRects().length)continue;el.scrollIntoView({block:'center',inline:'nearest'});await delay(10);const r=geometry(el),hit=doc().elementFromPoint(r.x+r.width/2,r.y+r.height/2);check(r.x>=-.5&&r.right<=win().innerWidth+.5&&r.y>=0&&r.bottom<=win().innerHeight-31&&el.contains(hit),'Unreachable control '+(el.id||el.textContent.trim().slice(0,30)));check(el.scrollWidth<=el.clientWidth+1,'Clipped control text '+JSON.stringify({id:el.id,text:el.textContent.trim().slice(0,100),width:el.clientWidth,scroll:el.scrollWidth,children:[...el.children].map(c=>({tag:c.tagName,text:c.textContent.trim().slice(0,60),width:c.clientWidth,scroll:c.scrollWidth}))}));rows.push({id:el.id,text:el.textContent.trim().slice(0,40),...r});}return rows;}
async function homeCheck(w,h,scale=1){
 await home();await size(w,h);const update=doc().querySelector("#update-ready"),updateHidden=update.hidden;update.hidden=false;const elements=[doc().querySelector('#header'),...doc().querySelector('#header').querySelectorAll('*'),doc().querySelector('#screen-start'),...doc().querySelector('#screen-start').querySelectorAll('*')],styles=elements.map(e=>e.style.fontSize),fonts=elements.map(e=>parseFloat(win().getComputedStyle(e).fontSize));if(scale!==1)elements.forEach((e,i)=>e.style.fontSize=fonts[i]*scale+'px');
 const row={viewport:[w,h],textScale:scale,containers:[],buttons:[],failures:[]};
 try{
  await delay(40);const stage=doc().querySelector('#stage');stage.scrollTop=0;
  for(const selector of ['.home-copy','.home-actions','.secondary-actions']){const el=doc().querySelector(selector),r=geometry(el);row.containers.push({selector,...r,display:win().getComputedStyle(el).display});if(r.scrollWidth>r.clientWidth+1||r.x<-.5||r.right>w+.5)row.failures.push(selector+' horizontal overflow');}
  for(const el of doc().querySelectorAll('#header button,#screen-start button:not([hidden])')){
   if(!el.getClientRects().length)continue;
   el.scrollIntoView({block:'center',inline:'nearest'});await delay(10);const r=geometry(el),x=r.x+r.width/2,y=r.y+r.height/2,hit=doc().elementFromPoint(x,y),visible=r.x>=-.5&&r.right<=w+.5&&r.y>=0&&r.bottom<=h-31&&el.contains(hit),textFits=el.scrollWidth<=el.clientWidth+1;
   row.buttons.push({id:el.id,text:el.textContent.trim(),...r,visible,textFits,hit:hit?.id||hit?.tagName});if(!visible||!textFits)row.failures.push(el.id+' clipped or obstructed');if(r.width<44||r.height<44)row.failures.push(el.id+' below 44px target');
  }
  if(doc().documentElement.scrollWidth>w+1)row.failures.push('Document horizontal overflow');
 }finally{update.hidden=updateHidden;elements.forEach((e,i)=>e.style.fontSize=styles[i]);doc().querySelector('#stage').scrollTop=0;}
 return row;
}
const actions={
 'Phone menu and race journeys':async()=>{
  const rows=[];for(const [w,h]of [[390,844],[844,390]]){
   await home();await size(w,h);const a=api(),settings=structuredClone(a.settings);Object.assign(a.settings,{touch:true,autoAccelerate:false,assist:false});a.applyPreferences();
   const views=[];try{
    click('trial-button');await until(()=>a.view==='events');views.push({view:'Time Trial',controls:await reach('#screen-events button,#screen-events select')});await home();
    click('garage-button');await until(()=>a.view==='garage');views.push({view:'Garage',controls:await reach('#screen-garage button,#screen-garage select')});await home();
    click('workshop-button');await until(()=>a.view==='workshop'&&doc().querySelector('#track-name').value);await a.workshop.flush();views.push({view:'Workshop',controls:await reach('.workshop-bar button,.workshop-bar input,.editor-sheets button')});await home();
    click('leaderboard-button');await until(()=>doc().querySelector('dialog').open);views.push({view:'Leaderboards',controls:await reach('dialog[open] button,dialog[open] input,dialog[open] select')});doc().querySelector('dialog').close();
    click('quick-race');await until(()=>a.race?.state==='racing');let race=a.race;const key=type=>win().dispatchEvent(new(win().KeyboardEvent)(type,{key:'w',code:'KeyW',bubbles:true}));key('keydown');await delay(350);key('keyup');check(+doc().querySelector('#hud-speed').textContent>0,'Driving did not move car');
    click('pause-button');const clock=race.time;button('Settings').click();views.push({view:'Race settings',controls:await reach('dialog[open] button,dialog[open] input,dialog[open] select')});button('Back to pause').click();check(race.time===clock,'Paused clock advanced');button('Resume').click();await until(()=>race.state==='racing');check(doc().activeElement.id==='world','World focus not restored');
    const identity=race,clockBeforeRotation=race.time;await size(h,w);check(api().race===identity&&race.time>=clockBeforeRotation,'Rotation reset race');await reach('#pause-button,#touch-controls button');await size(w,h);check(api().race===identity,'Return rotation replaced race');
    const prefix=doc().querySelector('base').href,{stepRace,aiInput}=await import(prefix+'simulation.js');while(race.state==='racing'&&race.time<480){for(let n=0;n<240&&race.state==='racing';n++)stepRace(race,aiInput(race.cars.find(c=>c.id==='player'),race.track,'club',1,race.cars));await delay(0);}const p=race.cars.find(c=>c.id==='player');check(race.state==='finished'&&race.dnf===false&&p.lapTimes.length===race.laps,'Legal full-lap completion failed');await a.finish();views.push({view:'Result',controls:await reach('#screen-result button')});const again=[...doc().querySelectorAll('#result-actions button')].find(e=>e.textContent==='Race again');check(again,'Retry missing');again.click();await until(()=>a.race!==race);await until(()=>a.race.state==='racing');click('pause-button');button('Leave race').click();button('Leave race').click();await until(()=>a.view==='start');
    rows.push({viewport:[w,h],views,completedLapTimes:p.lapTimes,retryStartsNewAttempt:true,scope:'Actual DOM journeys and emulated keyboard sample; full race uses legal accelerated controller, no forced terminal state/award'});
   }finally{Object.assign(a.settings,settings);a.applyPreferences();}
  }await size(432,900);return{rows};
 },
 'Viewport heights and safe inset geometry':async()=>{
  const beforeSettings=JSON.stringify(api().settings);const rows=[];for(const [w,h]of [[390,650],[390,844],[390,600],[844,320],[844,390]])rows.push(await homeCheck(w,h));
  await fetch('/audit/insets?enabled=true',{method:'POST'});try{const before=doc();frame.src='/?insets='+Date.now();await until(()=>doc()!==before&&win().__layoutReview?.document===doc());await win().__layoutReview.ready;
   for(const [w,h]of [[390,844],[844,390]]){const row=await homeCheck(w,h);row.injectedCSSInsets={top:20,left:24,right:24,bottom:24};rows.push(row);}
  }finally{await fetch('/audit/insets?enabled=false',{method:'POST'});const before=doc();frame.src='/?ordinary='+Date.now();await until(()=>doc()!==before&&win().__layoutReview?.document===doc());await win().__layoutReview.ready;await size(432,900);}
  check(JSON.stringify(api().settings)===beforeSettings,'Height/inset reload changed settings');return{settingsPreserved:true,rows,failures:rows.flatMap(r=>r.failures.map(error=>({viewport:r.viewport,error}))),scope:'Actual iframe height changes and CSS env safe-inset token substitution in local responses, not native browser bars or real device inset reporting'};
 },
 'Portrait preview':async()=>{await home();await size(432,900);return{preview:true,viewport:[432,900]};},
 'Landscape preview':async()=>{await home();await size(844,390);return{preview:true,viewport:[844,390]};},
 'Home geometry and action reachability':async()=>{const rows=[];for(const [w,h]of [[320,568],[360,800],[390,844],[432,900],[480,800],[720,900],[721,900],[844,390],[1024,768],[1440,900]])rows.push(await homeCheck(w,h));await size(432,900);return{rows,failures:rows.flatMap(r=>r.failures.map(error=>({viewport:r.viewport,error})))};},
 'Enlarged home text':async()=>{const rows=[];for(const [w,h]of [[320,568],[390,844],[432,900],[844,390]])rows.push(await homeCheck(w,h,2));await size(432,900);return{rows,failures:rows.flatMap(r=>r.failures.map(error=>({viewport:r.viewport,error})))};},
};
for(const [name,fn]of Object.entries(actions)){const b=document.createElement('button');b.textContent=name;b.onclick=async()=>{document.querySelectorAll('#actions button').forEach(e=>e.disabled=true);output.textContent='Running '+name;let record;try{const detail=await fn();record={name,status:detail.failures?.length?'failed':'passed',detail};}catch(e){record={name,status:'failed',error:e.message,stack:e.stack};}record.environment={userAgent:navigator.userAgent,viewport:[win().innerWidth,win().innerHeight],release:doc().querySelector('base')?.href};results.push(record);output.textContent=JSON.stringify(results.map(({name,status})=>({name,status})),null,2);await fetch('/audit/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});document.querySelectorAll('#actions button').forEach(e=>e.disabled=false);};document.querySelector('#actions').append(b);}output.textContent='Ready';
