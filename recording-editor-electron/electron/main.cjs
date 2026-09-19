const {app,BrowserWindow,dialog,ipcMain,protocol,shell}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {mediaResponse}=require('./media-response.cjs');
const crypto=require('node:crypto');
const {ProjectStore,atomicJson,validateProject}=require('./project-store.cjs');
const {renderEdit}=require('./exporter.cjs');
const {createReelsFolder,renderReels}=require('./reels-export.cjs');
const {importRecording,probeVideo}=require('./recording-import.cjs');
const {importWebProject}=require('./web-project-import.cjs');

protocol.registerSchemesAsPrivileged([{scheme:'cutroom-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setName('Cutroom');
if(!app.requestSingleInstanceLock()){app.quit();return}

let window,store;const jobs=new Map();
const publicJob=job=>Object.fromEntries(Object.entries(job).filter(([key])=>!['process','cancelled','folder'].includes(key)));
const exportRoot=()=>path.join(app.getPath('userData'),'exports');
function updateJob(job,fields){Object.assign(job,fields);atomicJson(path.join(job.folder,'status.json'),publicJob(job))}
function loadJobs(){
 fs.mkdirSync(exportRoot(),{recursive:true});
 for(const entry of fs.readdirSync(exportRoot(),{withFileTypes:true})){if(!entry.isDirectory())continue;try{const folder=path.join(exportRoot(),entry.name),job={...JSON.parse(fs.readFileSync(path.join(folder,'status.json'),'utf8')),folder,process:null,cancelled:false};if(['queued','rendering'].includes(job.status)){job.status='error';job.message='Export was interrupted.';atomicJson(path.join(folder,'status.json'),publicJob(job))}jobs.set(job.id,job)}catch{}}
}
function workspace(){const loaded=store.load();return loaded}
function mediaFile(host){const config=store.initialize();if(host==='video')return config?.videoPath;if(host==='captions')return config?.captionsPath;return null}
async function pickFile(kind){
 const options={video:{name:'Video',extensions:['mp4','mov','mkv','m4v','webm']},transcript:{name:'Timed transcript',extensions:['json','srt','vtt']},chapters:{name:'Chapters',extensions:['json','md','txt']},edits:{name:'Edit snapshot',extensions:['json']}};
 if(!options[kind])throw Error('Unknown file type.');
 const result=await dialog.showOpenDialog(window,{title:'Choose '+options[kind].name,properties:['openFile'],filters:[options[kind]]});
 return result.canceled?null:result.filePaths[0];
}
async function openWorkspace(file){
 if(!file){const result=await dialog.showOpenDialog(window,{title:'Open Cutroom project',properties:['openFile'],filters:[{name:'Cutroom project',extensions:['cutroom']}]});if(result.canceled)return {cancelled:true};file=result.filePaths[0]}
 const config=store.inspect(file);let replacement;
 if(!fs.existsSync(config.videoPath)){
  const result=await dialog.showOpenDialog(window,{title:'Locate missing video: '+path.basename(config.videoPath),properties:['openFile'],filters:[{name:'Video',extensions:['mp4','mov','mkv','m4v','webm']}]});if(result.canceled)return {cancelled:true};replacement=result.filePaths[0];
  const media=await probeVideo(replacement);if(Math.abs(media.duration-store.recording(config).duration)>.5)throw Error('That video has a different duration. Choose the original recording.');
 }
 store.open(file,replacement);return {cancelled:false};
}
async function newWorkspace(options){
 const recording=await importRecording(options);
 let project;
 if(options.editsPath){const raw=JSON.parse(fs.readFileSync(options.editsPath,'utf8'));project=validateProject(raw.project||raw,recording)}
 const result=await dialog.showSaveDialog(window,{title:'Save new Cutroom project',defaultPath:recording.title+'.cutroom',filters:[{name:'Cutroom project',extensions:['cutroom']}]});if(result.canceled||!result.filePath)return {cancelled:true};
 store.create({manifestPath:result.filePath,videoPath:options.videoPath,recording,project});return {cancelled:false};
}
function registerIpc(){
 ipcMain.handle('workspace:info',()=>store.info());
 ipcMain.handle('workspace:pick',(_event,kind)=>pickFile(kind));
 ipcMain.handle('workspace:new',(_event,options)=>newWorkspace(options));
 ipcMain.handle('workspace:importWeb',()=>importWebProject({store,dialog,window}));
 ipcMain.handle('workspace:open',(_event,file)=>openWorkspace(file));
 ipcMain.handle('workspace:close',()=>{store.close();return {cancelled:false}});
 ipcMain.handle('recording:load',()=>workspace().recording);
 ipcMain.handle('waveform:load',()=>{const file=workspace().config.waveformPath;try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {peaks:[]}}});
 ipcMain.handle('media:info',()=>({burnedIn:false,source:workspace().recording.source,duration:workspace().recording.duration,url:'cutroom-media://video/source'}));
 ipcMain.handle('project:load',()=>{const {project}=workspace();return {project,revision:project.revision,projectId:store.identity()}});
 ipcMain.handle('project:save',(_event,{project,baseRevision,projectId})=>store.save(project,baseRevision,projectId));
 ipcMain.handle('text:save',async(_event,{suggestedName,text})=>{const result=await dialog.showSaveDialog(window,{defaultPath:suggestedName,filters:[{name:'Markdown or JSON',extensions:['md','json','txt']}]});if(result.canceled||!result.filePath)return {cancelled:true};fs.writeFileSync(result.filePath,text,'utf8');return {cancelled:false,filePath:result.filePath}});
 ipcMain.handle('exports:list',()=>({jobs:[...jobs.values()].filter(job=>job.projectId===store.identity()||(!job.projectId&&store.identity()==='legacy')).map(publicJob)}));
 ipcMain.handle('exports:get',(_event,id)=>{const job=jobs.get(id);if(!job)throw Error('Export not found.');return publicJob(job)});
 ipcMain.handle('exports:start',(_event,{project,burn,height,title,kind})=>{
  const {recording,config}=workspace(),snapshot=validateProject(structuredClone(project),recording);if(!snapshot.clips.length)throw Error('Add a clip before exporting.');if(![720,1080].includes(height))throw Error('Unsupported export size.');if([...jobs.values()].some(job=>['queued','rendering'].includes(job.status)||job.process))throw Error('An export is already running.');
  const id=crypto.randomUUID(),folder=path.join(exportRoot(),id),job={id,projectId:store.identity(),status:'queued',progress:0,message:kind==='reel'?'Preparing reel':'Preparing export',kind,title,folder,process:null,cancelled:false};fs.mkdirSync(folder,{recursive:true});jobs.set(id,job);updateJob(job,{});
  void renderEdit({source:config.videoPath,folder,project:snapshot,recording:{...recording,title},burn,height,job,kind,update:fields=>updateJob(job,fields)}).catch(error=>updateJob(job,{status:job.cancelled?'cancelled':'error',message:error.message}));return publicJob(job);
 });
 ipcMain.handle('exports:reels',async(_event,{project,burn,height})=>{
  const {recording,config}=workspace(),projectId=store.identity(),snapshot=validateProject(structuredClone(project),recording);
  if(!snapshot.reels.some(reel=>reel.clips.length))throw Error('There are no non-empty reels to export.');
  if(![720,1080].includes(height))throw Error('Unsupported export size.');
  const checkBusy=()=>{if([...jobs.values()].some(job=>['queued','rendering'].includes(job.status)||job.process))throw Error('An export is already running.')};
  checkBusy();
  const result=await dialog.showOpenDialog(window,{title:'Choose where to export all reels',properties:['openDirectory','createDirectory']});
  if(result.canceled||!result.filePaths.length)return null;
  checkBusy();
  const id=crypto.randomUUID(),folder=path.join(exportRoot(),id),outputFolder=createReelsFolder(result.filePaths[0]);
  const job={id,projectId,status:'queued',progress:0,message:'Preparing all reels',kind:'reels',title:recording.title,folder,outputFolder,completed:0,total:snapshot.reels.filter(reel=>reel.clips.length).length,process:null,cancelled:false};
  fs.mkdirSync(folder,{recursive:true});jobs.set(id,job);updateJob(job,{});
  void renderReels({source:config.videoPath,folder:outputFolder,project:snapshot,recording,burn,height,job,update:fields=>updateJob(job,fields)}).catch(error=>updateJob(job,{status:job.cancelled?'cancelled':'error',message:error.message}));
  return publicJob(job);
 });
 ipcMain.handle('exports:cancel',(_event,id)=>{const job=jobs.get(id);if(!job||!['queued','rendering'].includes(job.status))return {ok:false};job.cancelled=true;job.process?.kill('SIGTERM');updateJob(job,{status:'cancelled',message:'Export cancelled.'});return {ok:true}});
 ipcMain.handle('exports:saveFile',async(_event,{id,name})=>{const job=jobs.get(id),allowed=new Set(['edited-video.mp4','project.json','edit-list.json','cut-report.md','transcript.txt','subtitles.srt']);if(!job||!allowed.has(name))throw Error('Export file not found.');const source=path.join(job.folder,name);if(!fs.existsSync(source))throw Error('Export file not found.');const result=await dialog.showSaveDialog(window,{defaultPath:name});if(result.canceled||!result.filePath)return {cancelled:true};fs.copyFileSync(source,result.filePath);return {cancelled:false,filePath:result.filePath}});
 ipcMain.handle('exports:reveal',async(_event,id)=>{const job=jobs.get(id);if(!job)throw Error('Export not found.');if(job.kind==='reels'){const error=await shell.openPath(job.outputFolder);if(error)throw Error(error)}else shell.showItemInFolder(path.join(job.folder,'edited-video.mp4'));return {ok:true}});
}
function createWindow(){
 window=new BrowserWindow({width:1500,height:980,minWidth:980,minHeight:700,backgroundColor:'#2c3b44',title:'Cutroom',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const dev=process.env.CUTROOM_DEV_URL;if(dev)window.loadURL(dev);else window.loadFile(path.join(__dirname,'..','dist','renderer','index.html'));
}

app.whenReady().then(()=>{
 const legacyRoot=process.env.CUTROOM_LEGACY_ROOT||path.resolve(__dirname,'../..');store=new ProjectStore({userData:app.getPath('userData'),resourcesPath:app.isPackaged?process.resourcesPath:path.join(__dirname,'..','public'),legacyRoot});store.initialize();loadJobs();
 protocol.handle('cutroom-media',request=>mediaResponse(request,mediaFile(new URL(request.url).hostname)));
 registerIpc();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
