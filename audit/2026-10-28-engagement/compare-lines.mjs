import fs from 'node:fs/promises';
import { loadContent } from '../../tools/content.mjs';
import { compile, nearest, atDistance } from '../../app/track.js';
import { assemble, STARTER, BUILD_PRESETS } from '../../app/builds.js';
import { wrap, clamp } from '../../app/model.js';
import { createCar, aiInput, stepRace, DT } from '../../app/simulation.js';
const content=await loadContent(), rows=[];
for(const slug of ['yard-loop','dockside-dash','furnace-bend']){
 const source=content.tracks.find(t=>t.track.slug===slug).track;
 const bend=source.patches.at(-2).pieceId, exit=source.patches.at(-1).pieceId;
 for(const [buildName,build] of [['starter',STARTER],['mixed',BUILD_PRESETS[2].build]]){
  for(const choice of ['safe','inside']){
   const track=compile(source), c=createCar(assemble(build,content.parts),track.grid[0]);
   const r={state:'racing',time:0,tick:0,track,laps:1,cars:[c],ghost:[],difficulty:'expert',seed:1};
   let padSteps=0,gravelSteps=0;
   while(r.state==='racing'){
    const input=aiInput(c,track,'expert',.9,[]),q=nearest(track,c.x,c.z),speed=Math.hypot(c.vx,c.vz),goal=atDistance(track,q.s+8+speed*.65);
    const goalLocal=nearest(track,goal.x,goal.z);
    const lane=choice==='inside' && (goalLocal.pieceId===bend || (goalLocal.pieceId===exit && goalLocal.local<35))?3.1:0;
    goal.x-=Math.sin(goal.heading)*lane;goal.z+=Math.cos(goal.heading)*lane;
    const error=wrap(Math.atan2(goal.z-c.z,goal.x-c.x)-c.heading),look=Math.hypot(goal.x-c.x,goal.z-c.z);
    const angle=Math.atan2(2*c.spec.chassis.wheelbase*Math.sin(error),look),limit=c.spec.chassis.steer*Math.PI/180/(1+speed*.055);
    input.steer=clamp(angle/limit*1.45,-1,1);
    stepRace(r,input,DT); if(c.padTime>0)padSteps++;if(c.surface==='gravel')gravelSteps++;
   }
   rows.push({slug,build:buildName,choice,elapsedMs:Math.round(r.time*1000),dnf:r.dnf,incidents:c.insights?.incidents,resets:c.resets,padSeconds:padSteps*DT,gravelSeconds:gravelSteps*DT});
  }
 }
}
await fs.writeFile(new URL('./line-comparison-corrected-controller.json',import.meta.url),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
