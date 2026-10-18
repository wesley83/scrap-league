import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

test('startup missing either required stylesheet keeps controls inert and exposes independent recovery',async()=>{
 const source=await fs.readFile(new URL('../app/bootstrap.js',import.meta.url),'utf8');
 for(const missing of ['--scrap-core-ready','--scrap-arcade-ready']){
  const nodes=Object.fromEntries(['loading','loading-message','startup-retry','stage','header'].map(id=>[id,{hidden:true,style:{},setAttribute(name,value){this[name]=value;},focus(){this.focused=true;}}]));
  let timerCleared=false,imports=0;
  const context=vm.createContext({document:{documentElement:{},getElementById:id=>nodes[id]},getComputedStyle:()=>({getPropertyValue:name=>name===missing?'':'1'}),setTimeout:()=>1,clearTimeout:()=>{timerCleared=true;},location:{reload(){}}});
  const script=new vm.Script(source,{importModuleDynamically:()=>{imports++;throw Error('Game import must not start');}});
  script.runInContext(context);
  assert.equal(imports,0);
  assert.equal(timerCleared,true);
  assert.equal(nodes.stage.inert,true);
  assert.equal(nodes.header.inert,true);
  assert.equal(nodes.loading.hidden,false);
  assert.equal(nodes['startup-retry'].hidden,false);
  assert.equal(nodes['startup-retry'].focused,true);
  assert.equal(nodes.loading.role,'alert');
  assert.match(nodes.loading.style.cssText,/position:fixed/);
  assert.match(nodes['loading-message'].textContent,/required game stylesheet/);
 }
});
