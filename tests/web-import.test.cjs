const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {ProjectStore,initialProject,validateProject}=require('../electron/project-store.cjs');
const {importRecording}=require('../electron/recording-import.cjs');
const {importWebProject}=require('../electron/web-project-import.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-web-import-'));
 const web=path.join(root,'web'),metadata=path.join(web,'recording-editor','public');fs.mkdirSync(metadata,{recursive:true});fs.mkdirSync(path.join(web,'edits'));
 const videoPath=path.join(web,'video.mp4');
 const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=s=160x90:r=30','-frames:v','91','-c:v','libx264',videoPath]);assert.equal(generated.status,0,String(generated.stderr));
 const recording={title:'Web interview',source:'video.mp4',duration:91/30,language:'en',words:[{id:42,start:.1,end:.5,text:'Hello',speaker:2,section:0}],chapters:[{id:'c',number:1,title:'Intro',question:'Hello?',note:'',evidence:'Hello',kind:'direct',start:0}]};
 const recordingPath=path.join(metadata,'recording.json');fs.writeFileSync(recordingPath,JSON.stringify(recording));
 recording.initialClips=[{id:'a',start:0,end:recording.duration,label:'Full source'}];
 const project=initialProject(recording);project.revision=47;project.undo=[{clips:structuredClone(project.clips),chapters:project.chapters}];project.clips[0].start=1;project.events=[{id:'e',at:'today',type:'cut',label:'Removed intro'}];project.reels=[{id:'r',title:'Reel',createdAt:'today',clips:project.clips,events:project.events,undo:[{clips:project.undo[0].clips}],redo:[]}];
 const editsPath=path.join(web,'edits','recording.edits.json');fs.writeFileSync(editsPath,JSON.stringify(project));fs.writeFileSync(path.join(metadata,'waveform.json'),'{"peaks":[0.2,0.8]}');fs.writeFileSync(path.join(metadata,'source-captions.vtt'),'WEBVTT\n');
 const store=new ProjectStore({userData:path.join(root,'profile'),resourcesPath:root,legacyRoot:root});
 const original=store.create({manifestPath:path.join(root,'original.narezator'),videoPath,recording});
 return {root,store,original,recording,project,editsPath,videoPath,recordingPath};
}
test('New Project retains full precision and word IDs from web metadata',async()=>{
 const f=fixture();try{
  const recording=await importRecording({videoPath:f.videoPath,transcriptPath:f.recordingPath});
  assert.equal(recording.duration,91/30);assert.equal(recording.words[0].id,42);
  assert.doesNotThrow(()=>validateProject(f.project,recording));
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});
test('web import discovers assets, copies latest edits/reels/history and keeps both originals untouched',async()=>{
 const f=fixture();try{
  const originalBytes=fs.readFileSync(f.original.projectPath),recordingBytes=fs.readFileSync(f.recordingPath);
  const latest=structuredClone(f.project);latest.revision++;latest.reels[0].title='Latest browser reel';
  const dialog={showOpenDialog:async()=>({canceled:false,filePaths:[f.editsPath]}),showSaveDialog:async()=>{
   fs.writeFileSync(f.editsPath,JSON.stringify(latest));return {canceled:false,filePath:path.join(f.root,'imported.narezator')};
  }};
  assert.deepEqual(await importWebProject({store:f.store,dialog}),{cancelled:false});
  const imported=f.store.load();assert.deepEqual(imported.project,latest);assert.equal(imported.recording.duration,f.recording.duration);assert.equal(imported.recording.words[0].id,42);
  assert.notEqual(imported.config.recordingPath,f.recordingPath);assert.notEqual(imported.config.projectPath,f.editsPath);
  assert.deepEqual(JSON.parse(fs.readFileSync(imported.config.waveformPath)),{peaks:[.2,.8]});assert.equal(fs.readFileSync(imported.config.captionsPath,'utf8'),'WEBVTT\n');
  f.store.save({...imported.project,revision:latest.revision},latest.revision,imported.config.id);
  assert.equal(fs.readFileSync(f.editsPath,'utf8'),JSON.stringify(latest));assert.deepEqual(fs.readFileSync(f.recordingPath),recordingBytes);assert.deepEqual(fs.readFileSync(f.original.projectPath),originalBytes);
  f.store.close();f.store.open(imported.config.manifestPath);assert.equal(f.store.load().project.reels[0].title,'Latest browser reel');
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});
test('cancel at every web import dialog leaves current project and web edits unchanged',async()=>{
 const f=fixture();try{
  // Exported snapshot outside its original folder exercises manual metadata/video lookup.
  const detached=path.join(f.root,'snapshot.json');fs.copyFileSync(f.editsPath,detached);
  const metadata=path.join(f.root,'metadata','recording.json');fs.mkdirSync(path.dirname(metadata));fs.copyFileSync(f.recordingPath,metadata);
  const bytes=fs.readFileSync(f.editsPath),config=fs.readFileSync(f.store.configPath);
  for(let cancelAt=0;cancelAt<4;cancelAt++){
   let step=0;const choices=[detached,metadata,f.videoPath];
   const dialog={showOpenDialog:async()=>step===cancelAt?{canceled:true}:{canceled:false,filePaths:[choices[step++]]},showSaveDialog:async()=>({canceled:true})};
   assert.deepEqual(await importWebProject({store:f.store,dialog}),{cancelled:true});
   assert.deepEqual(fs.readFileSync(f.store.configPath),config);assert.deepEqual(fs.readFileSync(f.editsPath),bytes);
  }
  const dialog={showOpenDialog:async()=>({canceled:false,filePaths:[f.editsPath]}),showSaveDialog:async()=>({canceled:false,filePath:f.original.manifestPath})};
  await assert.rejects(()=>importWebProject({store:f.store,dialog}),/already exists/);assert.deepEqual(fs.readFileSync(f.store.configPath),config);
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});

test('archived snapshots import from flat project data without a legacy app directory',async()=>{
 const f=fixture();try{
  const data=path.dirname(f.videoPath),metadata=path.dirname(f.recordingPath);
  for(const name of ['recording.json','waveform.json','source-captions.vtt'])fs.renameSync(path.join(metadata,name),path.join(data,name));
  fs.rmSync(path.join(data,'recording-editor'),{recursive:true});
  f.store.legacyRoot=undefined;
  let picks=0;const dialog={showOpenDialog:async()=>{picks++;return {canceled:false,filePaths:[f.editsPath]}},showSaveDialog:async()=>({canceled:false,filePath:path.join(f.root,'archived.narezator')})};
  assert.deepEqual(await importWebProject({store:f.store,dialog}),{cancelled:false});assert.equal(picks,1);assert.deepEqual(f.store.load().project,f.project);
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});
