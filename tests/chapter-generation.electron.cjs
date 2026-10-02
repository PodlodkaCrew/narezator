const {app,BrowserWindow,ipcMain,protocol,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {ProjectStore}=require('../electron/project-store.cjs');
const {TranscriptionCredentials}=require('../electron/transcription-credentials.cjs');
const {TranscriptionManager}=require('../electron/transcription.cjs');
const {ChapterGeneration,chaptersFromOutline}=require('../electron/chapter-generation.cjs');
const {newWorkspace}=require('../electron/new-workspace.cjs');
const {mediaResponse}=require('../electron/media-response.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-auto-chapters-ui-'));app.setPath('userData',path.join(root,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'narezator-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const videoPath=path.join(root,'interview.mp4');const video=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=12','-f','lavfi','-i','sine=frequency=440:duration=12','-shortest','-c:v','libx264','-c:a','aac',videoPath]);assert.equal(video.status,0,String(video.stderr));
const store=new ProjectStore({userData:path.join(root,'profile'),resourcesPath:root});
const description={flow:'The discussion starts with a problem and explores a practical solution.',insights:['A narrower scope makes the solution easier to maintain.','Validation checks the result against the original goal.']};
const outline={chapters:[{title:'The problem',startWordId:0,...description},{title:'Solutions and tradeoffs',startWordId:24,...description}]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let win,releaseTranscript,releaseChapters,requests=0;
app.whenReady().then(async()=>{
 const deadline=setTimeout(()=>{console.error('Chapter generation UI timed out');app.exit(1)},60000);
 try{
  const credentials=new TranscriptionCredentials({userData:path.join(root,'profile'),safeStorage});credentials.save({provider:'elevenlabs',apiKey:'test-only-elevenlabs-key'});
  const transcriptions=new TranscriptionManager({credentials,request:()=>new Promise(resolve=>{releaseTranscript=()=>resolve({language_code:'en',words:Array.from({length:48},(_,id)=>({type:'word',text:`Word${id}.`,start:id*.2,end:id*.2+.15,speaker_id:'speaker_0'}))})})});
  const generation=new ChapterGeneration({credentials,request:async({recording})=>{requests++;if(requests===1)throw Error('Temporary connection failure.');return new Promise(resolve=>{releaseChapters=()=>resolve(chaptersFromOutline(outline,recording))})}});
  protocol.handle('narezator-media',r=>new URL(r.url).hostname==='video'?mediaResponse(r,store.readConfig()?.videoPath):new Response('WEBVTT\n',{headers:{'Content-Type':'text/vtt'}}));
  ipcMain.handle('workspace:info',()=>store.info());ipcMain.handle('recording:load',()=>store.load().recording);ipcMain.handle('workspace:pick',()=>videoPath);
  ipcMain.handle('workspace:new',(_,options)=>newWorkspace({options,store,credentials,transcriptions,dialog:{showSaveDialog:async()=>({canceled:false,filePath:path.join(root,'interview.narezator')})}}));
  ipcMain.handle('project:load',()=>({project:store.load().project,revision:store.load().project.revision,projectId:store.identity()}));ipcMain.handle('project:save',(_,{project,baseRevision,projectId})=>store.save(project,baseRevision,projectId));
  ipcMain.handle('waveform:load',()=>({peaks:[]}));ipcMain.handle('media:info',()=>({burnedIn:false}));ipcMain.handle('exports:list',()=>({jobs:[]}));
  ipcMain.handle('transcription:credentials',()=>credentials.status());ipcMain.handle('transcription:saveKey',(_,payload)=>credentials.save(payload));ipcMain.handle('transcription:status',()=>transcriptions.status(store.readConfig()));
  ipcMain.handle('chapters:cached',(_,{projectId})=>{assert.equal(projectId,store.identity());const {config,recording}=store.load();return generation.cached(config,recording)});
  ipcMain.handle('chapters:generate',(_,{projectId})=>{assert.equal(projectId,store.identity());return generation.generate(store.load())});
  win=new BrowserWindow({show:false,width:1500,height:980,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<300;i++){if(await run(code))return;await delay(30)}throw Error('UI condition failed: '+code+'\n'+await run('document.body.innerText'))}
  const click=label=>run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing/disabled '+${JSON.stringify(label)});b.click()})()`);
  await win.loadFile(path.join(__dirname,'../dist/renderer/index.html'));await until("document.body.innerText.includes('Narezator projects')");await click('New Project');await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose…'&&!b.disabled)");await click('Choose…');await until("[...document.querySelectorAll('input')].some(i=>i.value==='interview')");await click('Create project…');
  await until("document.querySelector('.transcription-progress')?.textContent.includes('Transcribing')");assert.equal(store.load().project.chapters.length,0);assert.equal(await run("document.querySelector('.chapter-generation-empty')?.textContent.includes('after transcription')"),true);assert.equal(requests,0);
  releaseTranscript();await until("document.querySelectorAll('[data-word]').length===48&&document.querySelector('[aria-label=\"Chapter generation API key\"]')");assert.equal(requests,0,'An ElevenLabs-only project must show chapter key setup');
  await run("(()=>{const el=document.querySelector('[aria-label=\"Chapter generation API key\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'test-only-chapter-key');el.dispatchEvent(new Event('input',{bubbles:true}))})()");await click('Save key');await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='Generate chapters'&&!b.disabled)");await click('Generate chapters');await until("document.querySelector('.chapter-generation-empty [role=alert]')");assert.equal(requests,1);
  await click('Retry chapter generation');await until("document.querySelector('.chapter-generation-empty [role=status]')");assert.equal(requests,2);
  await run("document.querySelector('video').currentTime=2");await until("!document.querySelector('video').seeking&&document.querySelector('.source-time')?.textContent.includes('02.000')");await run("[...document.querySelectorAll('.assembly-actions button')].find(b=>b.textContent.startsWith('Split at playhead')).click()");await until("document.querySelector('.local-status')?.textContent==='All edits saved'");assert.equal(store.load().project.clips.length,2);
  releaseChapters();await until("document.querySelectorAll('.chapter-item').length===2&&document.querySelector('.local-status')?.textContent==='All edits saved'");
  const saved=store.load().project,marker=store.load().recording.words[24].start;assert.equal(saved.clips.length,2);assert.equal(saved.undo.length,1);assert.equal(saved.undo[0].chapters.length,2);assert.equal(store.load().recording.chapters.length,0);assert.deepEqual(saved.chapters.map(c=>[c.start,c.end]),[[0,marker],[marker,12]]);
  await run("document.querySelector('[aria-label=\"Show summary for chapter 2\"]').click()");await until("document.querySelectorAll('#chapter-summary-auto-24 li').length===2");assert.equal(await run("document.querySelector('#chapter-summary-auto-24 .chapter-summary-flow').textContent"),description.flow);
  await run("document.querySelector('[aria-label=\"Undo edit\"]').click()");await until("document.querySelector('.local-status')?.textContent==='All edits saved'");assert.equal(store.load().project.clips.length,1);assert.equal(store.load().project.chapters.length,2,'Undoing a cut must retain generated chapters');
  await win.loadFile(path.join(__dirname,'../dist/renderer/index.html'));await until("document.querySelectorAll('.chapter-item').length===2");assert.equal(requests,2);
  // An older transcript-only project resumes its saved generation without a key.
  const p=store.load().project;store.save({...p,chapters:[],undo:[],redo:[]},p.revision,store.identity());credentials.session.clear();await win.loadFile(path.join(__dirname,'../dist/renderer/index.html'));await until("document.querySelectorAll('.chapter-item').length===2&&document.querySelector('.local-status')?.textContent==='All edits saved'");assert.equal(requests,2);
  win.setSize(980,700);await delay(150);assert.equal(await run("(()=>{const p=document.querySelector('.chapter-panel');return p.scrollWidth===p.clientWidth})()"),true);
  console.log('Chapter generation UI passed: New Project without a chapter file, transcription completion, key setup, retry, automatic installation, concurrent edits, retained undo, saved summaries and offline recovery.');
  clearTimeout(deadline);win.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(0);
 }catch(e){console.error(e);clearTimeout(deadline);win?.destroy();app.exit(1)}
});
