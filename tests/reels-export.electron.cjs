// Renderer workflow, isolated from the user's app and projects.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {initialProject}=require('../electron/project-store.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-reels-ui-'));app.setPath('userData',path.join(root,'profile'));
const clip=(id,start,end)=>({id,start,end,label:id});
const data={title:'Export test',language:'en',source:'video.mp4',duration:12,words:[],chapters:[],priorCuts:[],initialClips:[clip('main',0,12)]};
const project=initialProject(data);project.reels=[{id:'one',title:'First reel',clips:[clip('a',1,3)],events:[],undo:[],redo:[]},{id:'two',title:'Second reel',clips:[clip('b',6,7)],events:[],undo:[],redo:[]},{id:'empty',title:'Empty reel',clips:[],events:[],undo:[],redo:[]}];
project.reels.forEach(reel=>reel.createdAt=new Date().toISOString());
const delay=ms=>new Promise(r=>setTimeout(r,ms));let calls=0,payload,job=null,revealed=null,win;
app.whenReady().then(async()=>{
 const deadline=setTimeout(()=>{console.error('Reels export UI timed out');app.exit(1)},45000);
 try{
  ipcMain.handle('workspace:info',()=>({active:true,projectId:'test',title:data.title,recent:[]}));ipcMain.handle('recording:load',()=>data);ipcMain.handle('project:load',()=>({project,revision:0,projectId:'test'}));
  ipcMain.handle('waveform:load',()=>({peaks:[]}));ipcMain.handle('media:info',()=>({burnedIn:false}));ipcMain.handle('exports:list',()=>({jobs:[]}));
  ipcMain.handle('exports:reels',(_,p)=>{payload=p;if(++calls===1)return null;return job={id:'batch',kind:'reels',status:'rendering',progress:.25,message:'Reel 1 of 2: First reel',completed:0,total:2,outputFolder:path.join(root,'exports')}});
  ipcMain.handle('exports:get',()=>job);ipcMain.handle('exports:cancel',()=>{job={...job,status:'cancelled',message:'Export cancelled.'};return {ok:true}});ipcMain.handle('exports:reveal',(_,id)=>{revealed=id;return {ok:true}});
  win=new BrowserWindow({show:false,width:1500,height:980,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>console.log(event.message));
  const run=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<200;i++){if(await run(code))return;await delay(30)}throw Error('UI condition failed: '+code+' Body: '+await run('document.body.innerText'))}
  const click=label=>run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing/disabled '+${JSON.stringify(label)});b.click()})()`);
  await win.loadFile(path.join(__dirname,'../dist/renderer/index.html'));await until("document.querySelectorAll('.workspace-tabs button').length===3");
  await run("document.querySelectorAll('.workspace-tabs button')[1].click()");await click('Export all reels');await until("document.querySelector('[role=dialog]')?.textContent.includes('2 reels')");
  assert.equal(await run("document.querySelector('[role=dialog]').textContent.includes('1 empty reel will be skipped.')"),true);
  await run("(()=>{const select=document.querySelector('.export-option select');select.value='720';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.export-check input').click()})()");
  await click('Choose folder & export');await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose folder & export'&&!b.disabled)");assert.equal(calls,1);assert.equal(await run("document.querySelector('.export-progress')===null"),true,'Cancelling folder selection starts no job');
  await click('Choose folder & export');await until("document.querySelector('.export-progress')?.textContent.includes('Reel 1 of 2')");
  assert.equal(payload.height,720);assert.equal(payload.burn,false);assert.deepEqual(payload.project.reels,project.reels);assert.deepEqual(payload.project.clips,project.clips);
  assert.equal(await run("document.querySelector('.export-option select').disabled"),true);await click('Cancel export');await until("document.querySelector('.export-progress')?.textContent.includes('Completed reels remain')");
  await click('Choose folder & export');await until("document.querySelector('.export-progress')?.textContent.includes('Reel 1 of 2')");job={...job,status:'done',progress:1,completed:2,message:'2 reels exported · 1 empty skipped'};
  await until("document.querySelector('.export-progress')?.textContent.includes('2 of 2 reels saved')");
  await click('Show folder');assert.equal(revealed,'batch');assert.equal(await run("[...document.querySelectorAll('.export-downloads button')].length"),1,'Batch opens its folder, not single-export download buttons');
  win.setSize(980,700);await delay(200);assert.equal(await run("document.querySelector('[role=dialog]').getBoundingClientRect().width<=innerWidth"),true);
  console.log('All-reels UI passed: entry point, options, cancelled folder selection, full project snapshot, progress, cancellation and folder result.');
  clearTimeout(deadline);win.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(0);
 }catch(e){console.error(e);clearTimeout(deadline);win?.destroy();app.exit(1)}
});
