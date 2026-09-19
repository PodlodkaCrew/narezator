const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {ProjectStore,initialProject}=require('../electron/project-store.cjs');
const {readTranscript,readChapters,importRecording}=require('../electron/recording-import.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');
const {spawnSync}=require('node:child_process');
const recording={title:'A',source:'a.mp4',duration:10,words:[],chapters:[],initialClips:[{id:'a',start:0,end:10,label:'A'}]};
void test('switching and closing retain independent edits, reels, history and project identity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-projects-'));
 try{
  const store=new ProjectStore({userData:path.join(dir,'user'),resourcesPath:dir,legacyRoot:dir}),videoPath=path.join(dir,'a.mp4');fs.writeFileSync(videoPath,'fixture');
  const project=initialProject(recording);project.reels=[{id:'r',title:'Reel',createdAt:'today',clips:[{id:'r',start:1,end:4,label:'R'}],events:[],undo:[],redo:[]}];
  const a=store.create({manifestPath:path.join(dir,'a.narezator'),videoPath,recording,project});
  const edited=store.load().project;edited.clips[0].start=2;edited.undo.push({clips:project.clips,chapters:[]});store.save(edited,0,a.id);
  const aBytes=fs.readFileSync(a.projectPath);
  const b=store.create({manifestPath:path.join(dir,'b.narezator'),videoPath,recording:{...recording,title:'B'}});
  assert.equal(store.load().project.reels.length,0);
  assert.throws(()=>store.save(edited,0,a.id),/another project/);
  assert.deepEqual(fs.readFileSync(a.projectPath),aBytes);
  store.close();assert.equal(store.info().active,false);
  const restarted=new ProjectStore({userData:path.join(dir,'user'),resourcesPath:dir,legacyRoot:dir});assert.equal(restarted.info().active,false);
  restarted.open(a.manifestPath);assert.equal(restarted.load().project.clips[0].start,2);assert.deepEqual(restarted.load().project.reels,project.reels);assert.equal(restarted.load().project.undo.length,1);
  restarted.open(b.manifestPath);assert.equal(restarted.load().project.clips[0].start,0);
  assert.equal(restarted.info().recent.length,2);
  assert.throws(()=>restarted.create({manifestPath:a.manifestPath,videoPath,recording}),/already exists/);assert.equal(restarted.identity(),b.id);
  fs.writeFileSync(path.join(dir,'invalid.narezator'),'{}');assert.throws(()=>restarted.open(path.join(dir,'invalid.narezator')));assert.equal(restarted.identity(),b.id);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
void test('existing Electron project remains in place and appears in Recent Projects',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-legacy-'));
 try{
  const videoPath=path.join(dir,'a.mp4'),recordingPath=path.join(dir,'recording.json');fs.writeFileSync(videoPath,'fixture');fs.writeFileSync(recordingPath,JSON.stringify(recording));
  fs.mkdirSync(path.join(dir,'project'));const legacy=path.join(dir,'project','recording.edits.json'),bytes=JSON.stringify({...initialProject(recording),revision:55});fs.writeFileSync(legacy,bytes);fs.writeFileSync(path.join(dir,'workspace.json'),JSON.stringify({videoPath,recordingPath}));
  const store=new ProjectStore({userData:dir,resourcesPath:dir,legacyRoot:dir}),info=store.info();assert.equal(info.projectId,'legacy');assert.equal(info.recent.length,1);assert.equal(fs.readFileSync(legacy,'utf8'),bytes);
  store.close();store.open(info.manifestPath);assert.equal(store.load().project.revision,55);assert.equal(fs.readFileSync(legacy,'utf8'),bytes);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
void test('new recording uses selected video and subtitles instead of bundled metadata',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-import-'));
 try{
  const videoPath=path.join(dir,'other.mp4'),transcriptPath=path.join(dir,'other.srt'),chaptersPath=path.join(dir,'chapters.md');
  const result=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=s=160x90:r=30:d=3','-c:v','libx264',videoPath]);assert.equal(result.status,0,String(result.stderr));
  fs.writeFileSync(transcriptPath,'1\n00:00:00,500 --> 00:00:02,500\nA new recording\n');fs.writeFileSync(chaptersPath,'# Chapters\n00:00:00 Intro\n2. A question without timestamp\n');
  const data=await importRecording({videoPath,transcriptPath,chaptersPath,title:'Other'});assert.equal(data.source,'other.mp4');assert.equal(data.duration,3);assert.equal(data.words.length,3);assert.equal(data.words[0].start,.5);assert.equal(data.transcriptTiming,'estimated');assert.equal(data.chapters[0].start,0);assert.equal(data.chapters[1].start,null);
  assert.equal((await importRecording({videoPath})).words.length,0);
  fs.writeFileSync(path.join(dir,'bad.json'),JSON.stringify({words:[{text:'wrong',start:20,end:22}]}));await assert.rejects(()=>importRecording({videoPath,transcriptPath:path.join(dir,'bad.json')}),/timing/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

void test('a fresh standalone install needs no bundled recording or legacy directory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-standalone-'));
 try{
  const store=new ProjectStore({userData:dir,resourcesPath:path.join(dir,'empty-resources')});
  assert.equal(store.initialize(),null);assert.equal(store.info().active,false);assert.deepEqual(store.recent(),[]);
  assert.throws(()=>store.load(),error=>error.code==='NO_WORKSPACE');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
