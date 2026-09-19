// Run with Electron after building. Uses only an isolated profile and fixture.
const {app,BrowserWindow,ipcMain,protocol}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {mediaResponse}=require('../electron/media-response.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cutroom-seek-'));
app.setPath('userData',path.join(root,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'cutroom-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const clip=(id,start,end)=>({id,start,end,label:id});
const recording={title:'Seek regression',source:'video.mp4',duration:12,language:'en',width:160,height:90,fps:30,priorCuts:[],chapters:[],words:Array.from({length:12},(_,i)=>({id:i,text:`Word${i}`,start:i,end:i+.8,speaker:1,section:0}))};
const project={version:1,source:'video.mp4',duration:12,revision:0,chapters:[],clips:[clip('a',1,5),clip('b',7,11)],events:[],undo:[],redo:[],reels:[{id:'reel',title:'Seek reel',createdAt:new Date().toISOString(),clips:[clip('r',3,9)],events:[],undo:[],redo:[]}]};
const file=path.join(root,'video.mp4');
const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=12','-c:v','libx264','-pix_fmt','yuv420p',file]);
if(generated.status!==0)throw Error(String(generated.stderr));
app.whenReady().then(async()=>{
 let window;
 try{
  protocol.handle('cutroom-media',request=>new URL(request.url).hostname==='video'?mediaResponse(request,file):new Response('WEBVTT\n',{headers:{'Content-Type':'text/vtt'}}));
  for(const [channel,value] of [['workspace:info',{active:true,projectId:'test',recent:[]}],['recording:load',recording],['project:load',{project,revision:0,projectId:'test'}],['waveform:load',{peaks:[]}],['media:info',{burnedIn:false}],['exports:list',{jobs:[]}]] )ipcMain.handle(channel,()=>value);
  window=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await window.loadFile(path.join(__dirname,'../dist/renderer/index.html'));
  const result=await window.webContents.executeJavaScript(`(async()=>{
   const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   async function until(check,label){for(let i=0;i<200;i++){if(check())return;await delay(50)}throw Error('Timed out: '+label)}
   await until(()=>document.querySelector('video')?.readyState>=2,'video ready');
   const video=document.querySelector('video');video.muted=true;
   function tapWord(id){
    const word=document.querySelector('[data-word$="-'+id+'"]');if(!word)throw Error('Missing word '+id);
    word.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.getSelection().setPosition(word.firstChild,0);word.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
   }
   async function clickWord(id,source){
    tapWord(id);
    await until(()=>!video.seeking&&Math.abs(video.currentTime-source)<.1,'word seek to '+source);
    if(!video.paused)throw Error('Paused word click started playback');
    document.querySelector('button[aria-label="Play"]').click();
    await until(()=>video.currentTime>source+.15,'play from '+source);video.pause();
    if(video.currentTime>source+1)throw Error('Wrong playback position '+video.currentTime);
    return {word:id,source,actual:video.currentTime};
   }
   async function jumpWhilePlaying(from,to){
    tapWord(from);await until(()=>!video.seeking,'initial seek');await video.play();
    await until(()=>video.currentTime>from+.15,'initial playback');
    let pauses=0;const countPause=()=>pauses++;video.addEventListener('pause',countPause);
    tapWord(to);
    await until(()=>!video.seeking&&video.currentTime>to+.15&&video.currentTime<to+1,'continued playback at '+to);
    video.removeEventListener('pause',countPause);
    if(video.paused||pauses)throw Error('Word click interrupted playback');
    video.pause();return {from,to,continuous:true};
   }
   async function selectWhilePlaying(){
    tapWord(4);await until(()=>!video.seeking,'selection setup');await video.play();
    const first=document.querySelector('[data-word$="-4"]'),last=document.querySelector('[data-word$="-5"]');
    first.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.getSelection().setBaseAndExtent(first.firstChild,0,last.firstChild,last.firstChild.length);last.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    await until(()=>video.paused,'text range pauses for editing');
   }
   const results=[await clickWord(8,8),await clickWord(2,2)];
   results.push(await jumpWhilePlaying(2,8),await jumpWhilePlaying(8,2));
   [...document.querySelectorAll('.mode-switch button')].find(b=>b.textContent==='Source').click();await delay(200);results.push(await clickWord(10,10));
   results.push(await jumpWhilePlaying(2,10),await jumpWhilePlaying(10,2));
   document.querySelectorAll('.workspace-tabs button')[1].click();await delay(200);results.push(await clickWord(6,6));
   results.push(await jumpWhilePlaying(4,7),await jumpWhilePlaying(7,4));await selectWhilePlaying();
   return results;
  })()`);
  console.log('Transcript seeking and playback passed:',JSON.stringify(result));window.destroy();app.exit(0);
 }catch(error){console.error(error);window?.destroy();app.exit(1)}
});
