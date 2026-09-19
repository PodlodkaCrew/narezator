const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {renderReels,createReelsFolder,folderName}=require('../electron/reels-export.cjs');
const {ffmpegPath,cutReport}=require('../electron/exporter.cjs');
const clip=(id,start,end)=>({id,start,end,label:id});
const recording={title:'Recording',source:'source.mp4',duration:2,words:[{text:'Первое',start:0,end:.4,speaker:1},{text:'Последнее',start:1.5,end:2,speaker:1}]};
const project={version:1,source:'source.mp4',duration:2,clips:[clip('main',0,2)],reels:[{id:'one',title:'../Одинаково / название',clips:[clip('b',1,1.5),clip('a',0,.5)]},{id:'two',title:'../Одинаково / название',clips:[clip('c',.5,1)]},{id:'empty',title:'Empty',clips:[]}],annotations:[{text:'Keep note'}]};
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root}

test('all reels render independent edits and complete reports to unique safe folders',async t=>{
 const root=setup(t),source=path.join(root,'source.mp4'),folder=createReelsFolder(root),second=createReelsFolder(root);
 assert.notEqual(folder,second);assert.equal(folderName('../'),'-');assert.equal(folderName('...'),'Reel');
 const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30:d=2','-c:v','libx264',source]);assert.equal(generated.status,0,String(generated.stderr));
 const before=JSON.stringify(project),updates=[];
 await renderReels({source,folder,project,recording,burn:true,height:90,job:{cancelled:false},update:fields=>updates.push(fields)});
 assert.equal(JSON.stringify(project),before);
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'reels.json')));assert.deepEqual(manifest.reels.map(r=>r.status),['done','done','skipped']);assert.notEqual(manifest.reels[0].folder,manifest.reels[1].folder);
 for(let i=0;i<2;i++){
  const reel=project.reels[i],dir=path.join(folder,manifest.reels[i].folder);assert.equal(path.dirname(dir),folder);
  for(const name of ['edited-video.mp4','project.json','cut-report.md','edit-list.json','transcript.txt','subtitles.srt'])assert.ok(fs.existsSync(path.join(dir,name)),name);
  assert.ok(fs.statSync(path.join(dir,'edited-video.mp4')).size>0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'project.json'))).clips,reel.clips);
  const edit=JSON.parse(fs.readFileSync(path.join(dir,'edit-list.json')));assert.deepEqual(edit.clips.map(c=>[c.start,c.end]),reel.clips.map(c=>[c.start,c.end]));assert.equal(edit.title,reel.title);
  assert.equal(fs.readFileSync(path.join(dir,'cut-report.md'),'utf8'),cutReport(reel.clips,{...recording,title:reel.title},'reel'));
 }
 assert.equal(updates.filter(u=>u.status==='done').length,1);assert.equal(updates.at(-1).completed,2);assert.equal(updates.at(-1).progress,1);assert.ok(updates.some(u=>u.progress===.5));
});

test('batch snapshot survives edits while rendering and forwards export options',async t=>{
 const folder=setup(t),p=structuredClone(project),seen=[];
 await renderReels({source:'original.mp4',folder,project:p,recording,burn:false,height:720,job:{},update:()=>{},render:async options=>{
  seen.push(options);p.reels[1].clips=[];p.reels[1].title='Changed';p.clips=[];
 }});
 assert.equal(seen.length,2);assert.equal(seen[1].recording.title,project.reels[1].title);assert.deepEqual(seen[1].project.clips,project.reels[1].clips);assert.equal(seen[1].source,'original.mp4');assert.equal(seen[1].burn,false);assert.equal(seen[1].height,720);
});

test('cancellation stops the queue and retains completed reels',async t=>{
 const folder=setup(t),job={cancelled:false},updates=[];let count=0;
 await assert.rejects(renderReels({folder,project,recording,job,update:u=>updates.push(u),render:async()=>{count++;job.cancelled=true}}),/cancelled/);
 assert.equal(count,1);assert.equal(updates.some(u=>u.status==='done'),false);assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'reels.json'))).reels[0].status,'done');
});

test('a failed reel records its error without erasing finished outputs',async t=>{
 const folder=setup(t);let count=0;
 await assert.rejects(renderReels({folder,project,recording,job:{},update:()=>{},render:async()=>{if(++count===2)throw Error('Disk full')}}),/Reel 2 of 2.*Disk full/);
 const entries=JSON.parse(fs.readFileSync(path.join(folder,'reels.json'))).reels;assert.equal(entries[0].status,'done');assert.equal(entries[1].status,'error');assert.equal(entries[1].message,'Disk full');
});

test('an entirely empty batch cannot be exported',async t=>{
 await assert.rejects(renderReels({folder:setup(t),project:{reels:[{id:'empty',clips:[]}]},recording,job:{},update:()=>{}}),/no non-empty reels/);
});
