// End-to-end notes workflow with a temporary project and generated video.
const {app,BrowserWindow,ipcMain,protocol}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {ProjectStore,initialProject}=require('../electron/project-store.cjs');
const {mediaResponse}=require('../electron/media-response.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-annotations-'));app.setPath('userData',path.join(root,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'narezator-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const videoPath=path.join(root,'video.mp4');const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=12','-c:v','libx264',videoPath]);assert.equal(generated.status,0,String(generated.stderr));
const clip=(id,start,end)=>({id,start,end,label:id});
const data={title:'Annotation test',source:'video.mp4',duration:12,language:'en',words:Array.from({length:12},(_,i)=>({id:i,text:`Word${i}`,start:i,end:i+.8,speaker:1,section:0})),chapters:[],initialClips:[clip('b',7,11),clip('a',1,5)]};
const project=initialProject(data);project.reels=[{id:'reel',title:'My reel',createdAt:'today',clips:[clip('r',3,9)],events:[],undo:[],redo:[]}];
const store=new ProjectStore({userData:path.join(root,'profile'),resourcesPath:root,legacyRoot:root});store.create({manifestPath:path.join(root,'notes.narezator'),videoPath,recording:data,project});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let report;
app.whenReady().then(async()=>{
 let win;const deadline=setTimeout(()=>{console.error('Annotation UI timed out');app.exit(1)},60000);
 try{
  protocol.handle('narezator-media',r=>new URL(r.url).hostname==='video'?mediaResponse(r,videoPath):new Response('WEBVTT\n',{headers:{'Content-Type':'text/vtt'}}));
  ipcMain.handle('workspace:info',()=>store.info());ipcMain.handle('recording:load',()=>store.load().recording);
  ipcMain.handle('project:load',()=>({project:store.load().project,revision:store.load().project.revision,projectId:store.identity()}));
  ipcMain.handle('project:save',(_,{project,baseRevision,projectId})=>store.save(project,baseRevision,projectId));
  ipcMain.handle('waveform:load',()=>({peaks:[]}));ipcMain.handle('media:info',()=>({burnedIn:false}));ipcMain.handle('exports:list',()=>({jobs:[]}));
  ipcMain.handle('text:save',(_,payload)=>{report=payload;return {cancelled:false}});
  win=new BrowserWindow({show:false,width:1500,height:980,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<180;i++){if(await run(code))return;await delay(30)}throw Error('UI condition failed: '+code)}
  const click=label=>run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
  const selectWords=(a,b)=>run(`(()=>{const a=document.querySelector('[data-word$="-${a}"]'),b=document.querySelector('[data-word$="-${b}"]');a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.getSelection().setBaseAndExtent(a.firstChild,0,b.firstChild,b.firstChild.length);b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))})()`);
  const type=text=>run(`(()=>{const el=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const saveNote=async text=>{await click('Annotate');await until("!!document.querySelector('textarea')");await type(text);await click('Save annotation');await until("!document.querySelector('[role=dialog]')&&document.querySelector('.local-status')?.textContent==='All edits saved'")};
  await win.loadFile(path.join(__dirname,'../dist/renderer/index.html'));await until("document.querySelector('video')?.readyState>=2");
  await selectWords(9,2);await until("!document.querySelector('.create-annotation').disabled");
  await click('Annotate');await until("!!document.querySelector('textarea')");await type('Discard me');await click('Cancel');assert.equal(store.load().project.annotations.length,0);
  await saveNote('Добавить титр <b>как текст</b>\nВторая строка 🎬');
  assert.deepEqual(store.load().project.annotations[0].ranges,[{start:9,end:11},{start:1,end:2.8}]);
  assert.equal(await run("document.querySelector('.annotation-text b')===null"),true);
  await run("document.querySelectorAll('.annotation-range')[1].click()");await until("!document.querySelector('video').seeking&&Math.abs(document.querySelector('video').currentTime-1)<.1");
  await run("document.querySelector('[aria-label=\"Edit annotation 1\"]').click()");await until("!!document.querySelector('textarea')");await type('Updated note\nKeep this line');await click('Save annotation');await until("document.querySelector('.annotation-text')?.textContent==='Updated note\\nKeep this line'");
  // A real waveform drag in source mode creates a second note.
  const bounds=await run("(()=>{const r=document.querySelector('.waveform').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  const y=Math.round(bounds.y+bounds.height/2),x1=Math.round(bounds.x+bounds.width*.2),x2=Math.round(bounds.x+bounds.width*.4);
  win.webContents.sendInputEvent({type:'mouseDown',x:x1,y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:x2,y,button:'left'});win.webContents.sendInputEvent({type:'mouseUp',x:x2,y,button:'left',clickCount:1});await delay(100);
  await saveNote('Waveform annotation');const second=store.load().project.annotations[1];assert.ok(Math.abs(second.ranges[0].start-2.4)<.04);assert.ok(Math.abs(second.ranges[0].end-4.8)<.04);
  await run("document.querySelectorAll('.workspace-tabs button')[1].click()");await delay(120);await selectWords(4,5);await saveNote('Reel note');assert.equal(store.load().project.annotations[2].reelId,'reel');
  assert.deepEqual(store.load().project.clips,project.clips);assert.deepEqual(store.load().project.reels,project.reels);
  await run("document.querySelector('[aria-label=\"Delete annotation 2\"]').click()");await until("document.querySelectorAll('.annotation-card').length===2");await click('Undo delete');await until("document.querySelectorAll('.annotation-card').length===3");
  await click('Export annotations');assert.equal(report.suggestedName,'annotations.md');assert.ok(report.text.includes('00:00:09 – Word9'));assert.ok(report.text.includes('00:00:11 – Word10'));assert.ok(report.text.includes('Updated note\nKeep this line'));assert.equal((report.text.match(/## Аннотация /g)||[]).length,3);
  await until("document.querySelector('.local-status')?.textContent==='All edits saved'");await win.loadFile(path.join(__dirname,'../dist/renderer/index.html'));await until("document.querySelectorAll('.workspace-tabs button').length===3");await run("document.querySelectorAll('.workspace-tabs button')[2].click()");await until("document.querySelectorAll('.annotation-card').length===3");
  await run('document.fonts.ready');await delay(300);fs.writeFileSync(path.join(root,'annotations.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(980,700);await delay(350);assert.equal(await run("(()=>{const b=document.querySelector('.create-annotation').getBoundingClientRect(),p=document.querySelector('.viewer-panel').getBoundingClientRect();return b.bottom<=p.bottom})()"),true,'Annotate visible at minimum window size');fs.writeFileSync(path.join(root,'annotations-compact.png'),(await win.webContents.capturePage()).toPNG());
  console.log('Annotations UI passed: transcript, waveform, reel, edit, delete/restore, source navigation, export and reload. Screenshots: '+root);
  clearTimeout(deadline);win.destroy();app.exit(0);
 }catch(e){console.error(e);clearTimeout(deadline);win?.destroy();app.exit(1)}
});
