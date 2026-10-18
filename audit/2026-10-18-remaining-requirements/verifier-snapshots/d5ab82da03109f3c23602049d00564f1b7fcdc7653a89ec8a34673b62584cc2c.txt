// Isolated real IndexedDB termination fixture. Never shipped to players.
self.onmessage=async({data})=>{
 try{
  const {openStore}=await import(data.prefix+'storage.js');
  const store=await openStore({name:data.database});
  if(data.phase==='before'){
   const original=await store.saveDraft(data.track,0,{zoom:1,pan:{x:0,y:0}},null);
   self.postMessage({event:'baseline-committed',revision:original.revision});
   const transaction=store.db.transaction.bind(store.db);
   store.db.transaction=(...args)=>{
    const tx=transaction(...args);
    if(args[1]!=='readwrite')return tx;
    const objectStore=tx.objectStore.bind(tx);
    tx.objectStore=name=>{
     const object=objectStore(name);
     if(name!=='drafts')return object;
     const put=object.put.bind(object);
     object.put=(...values)=>{
      const request=put(...values);
      request.addEventListener('success',()=>{
       self.postMessage({event:'request-succeeded-transaction-incomplete'});
       // Keep the success callback outstanding so the transaction cannot
       // auto-commit before the parent terminates this actual Worker context.
       // The cap makes a failed fixture self-terminating, not an endless spin.
       const until=performance.now()+5000;while(performance.now()<until){}
      },{once:true});
      return request;
     };
     return object;
    };
    tx.addEventListener('complete',()=>self.postMessage({event:'unexpected-before-commit-complete'}),{once:true});
    return tx;
   };
   await store.saveDraft({...data.track,name:'Must not survive uncommitted termination'},original.revision,{zoom:1,pan:{x:0,y:0}},null);
   self.postMessage({event:'unexpected-save-resolved'});
  }else{
   const before=await store.get('draft:'+data.track.id);
   const after=await store.saveDraft({...data.track,name:'Committed before termination'},before.revision,{zoom:1,pan:{x:0,y:0}},null);
   self.postMessage({event:'transaction-committed',revision:after.revision});
  }
 }catch(error){self.postMessage({event:'fixture-error',message:error.message});}
};
