const fs=require('node:fs');
const path=require('node:path');
const {renderEdit}=require('./exporter.cjs');
const {atomicJson}=require('./project-store.cjs');

function folderName(title){return Array.from(String(title).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/^[.\s]+|[.\s]+$/g,'')).slice(0,60).join('')||'Reel'}
function createReelsFolder(destination){return fs.mkdtempSync(path.join(destination,'Narezator-reels-'))}

// Render a fixed snapshot sequentially so all reels share the existing cancellation handle.
async function renderReels({source,folder,project,recording,burn,height,job,update,render=renderEdit}){
 const snapshot=structuredClone(project),reels=snapshot.reels.filter(reel=>reel.clips.length);
 if(!reels.length)throw Error('There are no non-empty reels to export.');
 const entries=snapshot.reels.map((reel,index)=>({id:reel.id,title:reel.title,folder:reel.clips.length?`${String(index+1).padStart(2,'0')}-${folderName(reel.title)}`:null,status:reel.clips.length?'queued':'skipped'}));
 const manifest={title:recording.title,source:recording.source,createdAt:new Date().toISOString(),reels:entries};
 const save=()=>atomicJson(path.join(folder,'reels.json'),manifest);
 fs.mkdirSync(folder,{recursive:true});save();
 let completed=0;
 update({status:'rendering',completed,total:reels.length,skipped:entries.length-reels.length,progress:0});
 for(const reel of reels){
  if(job.cancelled)throw Error('Export cancelled.');
  const entry=entries.find(item=>item.id===reel.id);entry.status='rendering';save();
  const prefix=`Reel ${completed+1} of ${reels.length}: ${reel.title}`;
  update({message:prefix});
  try{
   await render({source,folder:path.join(folder,entry.folder),project:{...snapshot,clips:reel.clips},recording:{...recording,title:reel.title},burn,height,job,kind:'reel',update:fields=>{
    // A finished reel is still part of an active batch.
    update({status:'rendering',...(fields.message?{message:`${prefix} · ${fields.message}`} : {}),...(typeof fields.progress==='number'?{progress:(completed+fields.progress)/reels.length}: {})});
   }});
   entry.status='done';completed++;save();update({completed,progress:completed/reels.length});
  }catch(error){entry.status=job.cancelled?'cancelled':'error';entry.message=error.message;save();throw Error(`${prefix} · ${error.message}`)}
 }
 update({status:'done',progress:1,completed,message:`${completed} reel${completed===1?'':'s'} exported${entries.length>completed?` · ${entries.length-completed} empty skipped`:''}`});
}

module.exports={createReelsFolder,folderName,renderReels};
