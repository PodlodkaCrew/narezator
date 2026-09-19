// Run with Electron after building. Uses only an isolated profile and fixture.
const {app,BrowserWindow,ipcMain,protocol}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {mediaResponse}=require('../electron/media-response.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-seek-'));
app.setPath('userData',path.join(root,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'narezator-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const clip=(id,start,end)=>({id,start,end,label:id});
const recording={title:'Seek regression',source:'video.mp4',duration:12,language:'en',width:160,height:90,fps:30,priorCuts:[],chapters:[],words:Array.from({length:12},(_,i)=>({id:i,text:`Word${i}`,start:i,end:i+.8,speaker:1,section:0}))};
const project={version:1,source:'video.mp4',duration:12,revision:0,chapters:[],clips:[clip('a',1,5),clip('b',7,11),clip('again',1,5)],events:[],undo:[],redo:[],reels:[{id:'reel',title:'Seek reel',createdAt:new Date().toISOString(),clips:[clip('r',3,9)],events:[],undo:[],redo:[]},{id:'second',title:'Second reel',createdAt:'today',clips:[clip('s',1,4)],events:[],undo:[],redo:[]}],annotations:[{id:'note',text:'Look here',createdAt:'today',updatedAt:'today',context:'Source',ranges:[{start:10,end:11}]}]};
const file=path.join(root,'video.mp4');
const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=12','-c:v','libx264','-pix_fmt','yuv420p',file]);
if(generated.status!==0)throw Error(String(generated.stderr));
app.whenReady().then(async()=>{
 let window;
 try{
  protocol.handle('narezator-media',request=>new URL(request.url).hostname==='video'?mediaResponse(request,file):new Response('WEBVTT\n',{headers:{'Content-Type':'text/vtt'}}));
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
   const tab=index=>document.querySelectorAll('.workspace-tabs button')[index].click();
   const expectSource=async(source,label)=>{await until(()=>!video.seeking&&Math.abs(video.currentTime-source)<.1,label);await delay(120);if(Math.abs(video.currentTime-source)>.1)throw Error('Position changed after render: '+label)};
   // Main cut can contain the same source twice; restore the selected occurrence.
   tab(0);await delay(150);
   [...document.querySelectorAll('.mode-switch button')].find(b=>b.textContent==='Your cut').click();await delay(150);
   const duplicate=document.querySelector('[data-word="again-2"]');duplicate.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.getSelection().setPosition(duplicate.firstChild,0);duplicate.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
   await expectSource(2,'duplicate occurrence');
   tab(1);await delay(150);tapWord(6);await expectSource(6,'first reel');
   [...document.querySelectorAll('.reel-item')].find(b=>b.textContent.includes('Second reel')).click();await delay(150);tapWord(2);await expectSource(2,'second reel');
   tab(0);await expectSource(2,'restore main');
   if(!document.querySelector('.transport-time b').textContent.startsWith('00:00:09'))throw Error('Returned to wrong repeated clip');
   tab(0);await expectSource(2,'active tab is a no-op');
   tab(1);await expectSource(2,'restore last selected reel');
   if(!document.querySelector('.reel-item.active').textContent.includes('Second reel'))throw Error('Forgot last reel');
   [...document.querySelectorAll('.reel-item')].find(b=>b.textContent.includes('Seek reel')).click();await expectSource(6,'restore first reel independently');
   const inWord=document.querySelector('[data-word$="-6"]'),outWord=document.querySelector('[data-word$="-7"]');
   inWord.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.getSelection().setBaseAndExtent(inWord.firstChild,0,outWord.firstChild,outWord.firstChild.length);outWord.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));await delay(100);
   const selectionStart=document.querySelector('input[aria-label="In"]').value,selectionEnd=document.querySelector('input[aria-label="Out"]').value;
   tab(2);await expectSource(6,'opening annotations retains current position');
   document.querySelector('.annotation-range').click();await expectSource(10,'annotation navigation');
   tab(1);await expectSource(6,'annotation navigation leaves reel bookmark intact');
   if(document.querySelector('input[aria-label="In"]').value!==selectionStart||document.querySelector('input[aria-label="Out"]').value!==selectionEnd)throw Error('Selection was lost');
   tab(2);await expectSource(10,'restore annotation position');
   if(![...document.querySelectorAll('.mode-switch .active')].some(b=>b.textContent==='Source'))throw Error('Annotation source mode was lost');
   tab(0);await expectSource(2,'restore main again');
   [...document.querySelectorAll('.mode-switch button')].find(b=>b.textContent==='Source').click();await delay(150);tapWord(9);await expectSource(9,'main source view');
   tab(1);await expectSource(6,'reel stays in edit view');tab(0);await expectSource(9,'restore main source view');
   if(document.querySelector('.mode-switch .active').textContent!=='Source')throw Error('Main source mode was lost');
   const style=document.createElement('style');style.textContent='.transcript-scroll{max-height:60px}.word-paragraph{line-height:100px}';document.head.append(style);await delay(200);
   const scroller=document.querySelector('.transcript-scroll');scroller.scrollTop=70;scroller.dispatchEvent(new Event('scroll'));await delay(150);const scrollTop=scroller.scrollTop;
   if(!scrollTop||document.querySelector('.follow-button').classList.contains('active'))throw Error('Manual scrolling did not disable follow');
   tab(1);await expectSource(6,'leave manually scrolled transcript');tab(0);await expectSource(9,'return to manually scrolled transcript');
   if(Math.abs(document.querySelector('.transcript-scroll').scrollTop-scrollTop)>1)throw Error('Transcript scroll was lost');
   results.push({tabMemory:'main, each reel, annotations, source mode, repeated clips and selection passed'});
   return results;
  })()`);
  console.log('Transcript seeking and playback passed:',JSON.stringify(result));window.destroy();app.exit(0);
 }catch(error){console.error(error);window?.destroy();app.exit(1)}
});
