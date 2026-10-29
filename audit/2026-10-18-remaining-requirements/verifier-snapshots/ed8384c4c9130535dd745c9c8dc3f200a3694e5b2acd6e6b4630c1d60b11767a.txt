// Explicit local test controls. This module is not in any release inventory.
export function mount(api) {
 const panel=document.createElement('aside');panel.id='local-proof';
 panel.style.cssText='position:fixed;right:8px;top:72px;z-index:500;max-width:260px;max-height:24vh;overflow:auto;padding:8px;background:#f5f0df;color:#19343b;font:12px system-ui;border:1px solid #19343b';
 panel.innerHTML='<strong>Local verification controls</strong><p>Not shipped. Legal seeded driving is separate from connector keyboard authoring.</p><button id="proof-drive">Verify test laps with legal controller</button><button id="proof-save">Save keyboard creator evidence</button><pre id="proof-output" style="white-space:pre-wrap">Ready</pre>';
 document.body.append(panel);const output=panel.querySelector('pre'),keys=[];let driven=null;
 const snapshot=()=>({view:api.view,state:api.race?.state,focus:document.activeElement?.id,
  input:api.race?api.input():null,player:api.race?.cars.find(car=>car.id==='player')&&(({x,z,heading,vx,vz})=>({x,z,heading,vx,vz}))(api.race.cars.find(car=>car.id==='player'))});
 for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
  if(api.view!=='race'||!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Escape'].includes(event.code))return;
  requestAnimationFrame(()=>{keys.push({type,code:event.code,trusted:event.isTrusted,at:performance.now(),...snapshot()});if(keys.length>120)keys.shift();output.textContent=JSON.stringify({keys,driven},null,2);});
 });
 panel.querySelector('#proof-drive').onclick=async()=>{
  try{
   const race=api.race;if(!race||race.mode!=='workshop')throw Error('Start a real Workshop test drive first');
   const prefix=document.querySelector('base').href,{stepRace,aiInput}=await import(prefix+'simulation.js');
   const deadline=performance.now()+10000;
   while(race.state==='countdown'||race.state==='resuming'){
    if(performance.now()>deadline)throw Error('Test drive never became ready');await new Promise(resolve=>setTimeout(resolve,30));
   }
   if(race.state!=='racing')throw Error('Test drive is interrupted; resume through the game controls');
   const before=structuredClone(race.cars.find(car=>car.id==='player'));document.querySelector('#world').focus();
   while(race.state==='racing'&&race.time<480){
    for(let n=0;n<240&&race.state==='racing';n++)stepRace(race,aiInput(race.cars.find(car=>car.id==='player'),race.track,'club',1,race.cars));
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   const player=race.cars.find(car=>car.id==='player');
   if(race.state!=='finished'||race.dnf!==false||!Number.isFinite(player.finishTime)||player.lapTimes.length!==race.laps)
    throw Error('Legal controller did not finish every lap: '+JSON.stringify({state:race.state,dnf:race.dnf,finishTime:player.finishTime,completed:player.lapTimes.length,expected:race.laps}));
   await api.finish();driven={trackId:race.track.source.id,state:race.state,dnf:race.dnf,laps:race.laps,playerLap:player.lap,completedLapTimes:[...player.lapTimes],finishTime:player.finishTime,
    result:race.result,before:{x:before.x,z:before.z,heading:before.heading},scope:'Actual test race, legal physics controls, no forced finish or award; accelerated seeded controller is separate from connector keyboard samples'};
   output.textContent=JSON.stringify({keys,driven},null,2);
  }catch(error){output.textContent=JSON.stringify({status:'failed',error:error.message,keys,driven});}
 };
 panel.querySelector('#proof-save').onclick=async()=>{
  try{
   const workshop=api.workshop;if(!workshop?.track)throw Error('No current Workshop source');await workshop.flush();
   const release=document.querySelector('base').href.split('/').filter(Boolean).at(-1);
   const record={release,results:[{name:'Connector keyboard creator journey',status:driven?'passed':'partial',
    qualification:{entry:location.href,userAgent:navigator.userAgent,actualViewport:[innerWidth,innerHeight],renderer:api.world.ctx.constructor.name},
    details:{track:structuredClone(workshop.track),sourceHTML:workshop.sourceDocument.html(),compiledValid:workshop.compiled.valid,
     keys,driven,scope:'Sequential connector keyboard authoring/navigation and trusted sampled driving; full valid laps use the explicitly identified legal controller. Export/import/download checks recorded separately.'}}]};
   const response=await fetch('/__audit__/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
   if(!response.ok)throw Error('Evidence was not saved');output.textContent=JSON.stringify({saved:await response.json(),...record},null,2);
  }catch(error){output.textContent=JSON.stringify({status:'failed',error:error.message});}
 };
}
