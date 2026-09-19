const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {ProjectStore}=require('../electron/project-store.cjs');
const {ffmpegPath,renderEdit}=require('../electron/exporter.cjs');

const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'narezator-electron-test-'));
const recording={title:'Test recording',source:'video.mp4',duration:2,fps:30,width:320,height:180,language:'ru',words:[{id:1,text:'Проверка.',start:.2,end:.7,speaker:1,section:0}],chapters:[],initialClips:[{id:'main',start:0,end:2,label:'Main'}],priorCuts:[]};
const project={version:1,source:'video.mp4',duration:2,revision:7,clips:[{id:'main',start:0,end:2,label:'Main'}],chapters:[],events:[],undo:[],redo:[],reels:[{id:'reel',title:'Reel 01',createdAt:'2026-09-18T00:00:00Z',clips:[{id:'r1',start:.2,end:.8,label:'Reel'}],events:[],undo:[],redo:[]}]};

void test('migration copies current web progress and never writes to the live web project',()=>{
 const root=temporary(),userData=temporary(),resources=temporary();
 fs.mkdirSync(path.join(root,'recording-editor','public'),{recursive:true});fs.mkdirSync(path.join(root,'edits'),{recursive:true});
 fs.writeFileSync(path.join(root,'video.mp4'),'video');fs.writeFileSync(path.join(root,'recording-editor','public','recording.json'),JSON.stringify(recording));fs.writeFileSync(path.join(root,'recording-editor','public','waveform.json'),'{"peaks":[]}');fs.writeFileSync(path.join(root,'recording-editor','public','source-captions.vtt'),'WEBVTT\n');
 const legacy=path.join(root,'edits','recording.edits.json'),before=JSON.stringify(project,null,2);fs.writeFileSync(legacy,before);
 const store=new ProjectStore({userData,resourcesPath:resources,legacyRoot:root}),loaded=store.load();
 assert.deepEqual(loaded.project.reels,project.reels);assert.notEqual(store.projectPath,legacy);assert.equal(fs.readFileSync(legacy,'utf8'),before);
 const changed={...loaded.project,clips:[{...loaded.project.clips[0],end:1.5}]};assert.equal(store.save(changed,7).revision,8);assert.equal(fs.readFileSync(legacy,'utf8'),before);assert.equal(JSON.parse(fs.readFileSync(store.projectPath)).clips[0].end,1.5);
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(userData,{recursive:true,force:true});fs.rmSync(resources,{recursive:true,force:true});
});

void test('Node-only FFmpeg export writes the video and the complete edit package',async()=>{
 const root=temporary(),source=path.join(root,'source.mp4'),folder=path.join(root,'export');
 const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const exportProject={...project,clips:[{id:'r1',start:.2,end:.8,label:'Reel'}]},job={cancelled:false,process:null};
 await renderEdit({source,folder,project:exportProject,recording:{...recording,title:'Reel 01'},burn:true,height:180,job,update:()=>{}});
 for(const name of ['edited-video.mp4','project.json','edit-list.json','cut-report.md','transcript.txt','subtitles.srt'])assert.ok(fs.statSync(path.join(folder,name)).size>0,name);
 const editList=JSON.parse(fs.readFileSync(path.join(folder,'edit-list.json'),'utf8'));assert.equal(editList.title,'Reel 01');assert.deepEqual(editList.clips.map(clip=>[clip.start,clip.end]),[[.2,.8]]);assert.match(fs.readFileSync(path.join(folder,'cut-report.md'),'utf8'),/# Монтажный лист: Reel 01/);
 fs.rmSync(root,{recursive:true,force:true});
});
