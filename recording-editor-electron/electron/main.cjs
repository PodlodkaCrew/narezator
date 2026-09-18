const {app,BrowserWindow,dialog,ipcMain,net,protocol,shell}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const crypto=require('node:crypto');
const {ProjectStore,atomicJson,validateProject}=require('./project-store.cjs');
const {renderEdit}=require('./exporter.cjs');

protocol.registerSchemesAsPrivileged([{scheme:'cutroom-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setName('Cutroom');

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
async function chooseWorkspace(){
 const video=await dialog.showOpenDialog(window,{title:'Choose the original video',properties:['openFile'],filters:[{name:'Video',extensions:['mp4','mov','mkv','m4v']}]});if(video.canceled||!video.filePaths[0])return {cancelled:true};
 const choice=await dialog.showMessageBox(window,{type:'question',title:'Import existing edits?',message:'Would you like to copy your existing Cutroom edit project?',detail:'Choose Import to transfer the latest main cut, reels, history, and undo data. The original file will not be changed.',buttons:['Import edits','Start fresh','Cancel'],defaultId:0,cancelId:2});if(choice.response===2)return {cancelled:true};
 let projectToImport=null;if(choice.response===0){const project=await dialog.showOpenDialog(window,{title:'Choose recording.edits.json',properties:['openFile'],filters:[{name:'Cutroom project',extensions:['json']}]});if(project.canceled||!project.filePaths[0])return {cancelled:true};projectToImport=project.filePaths[0]}
 store.configure({videoPath:video.filePaths[0],projectToImport});window?.webContents.reload();return {cancelled:false};
}
function registerIpc(){
 ipcMain.handle('workspace:choose',chooseWorkspace);
 ipcMain.handle('recording:load',()=>workspace().recording);
 ipcMain.handle('waveform:load',()=>{const file=workspace().config.waveformPath;try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {peaks:[]}}});
 ipcMain.handle('media:info',()=>({burnedIn:false,source:'video.mp4',duration:workspace().recording.duration,url:'cutroom-media://video/source'}));
 ipcMain.handle('project:load',()=>{const {project}=workspace();return {project,revision:project.revision}});
 ipcMain.handle('project:save',(_event,{project,baseRevision})=>store.save(project,baseRevision));
 ipcMain.handle('text:save',async(_event,{suggestedName,text})=>{const result=await dialog.showSaveDialog(window,{defaultPath:suggestedName,filters:[{name:'Markdown or JSON',extensions:['md','json','txt']}]});if(result.canceled||!result.filePath)return {cancelled:true};fs.writeFileSync(result.filePath,text,'utf8');return {cancelled:false,filePath:result.filePath}});
 ipcMain.handle('exports:list',()=>({jobs:[...jobs.values()].map(publicJob)}));
 ipcMain.handle('exports:get',(_event,id)=>{const job=jobs.get(id);if(!job)throw Error('Export not found.');return publicJob(job)});
 ipcMain.handle('exports:start',(_event,{project,burn,height,title,kind})=>{
  const {recording,config}=workspace(),snapshot=validateProject(structuredClone(project),recording);if(!snapshot.clips.length)throw Error('Add a clip before exporting.');if(![720,1080].includes(height))throw Error('Unsupported export size.');if([...jobs.values()].some(job=>['queued','rendering'].includes(job.status)))throw Error('An export is already running.');
  const id=crypto.randomUUID(),folder=path.join(exportRoot(),id),job={id,status:'queued',progress:0,message:kind==='reel'?'Preparing reel':'Preparing export',kind,title,folder,process:null,cancelled:false};fs.mkdirSync(folder,{recursive:true});jobs.set(id,job);updateJob(job,{});
  void renderEdit({source:config.videoPath,folder,project:snapshot,recording:{...recording,title},burn,height,job,update:fields=>updateJob(job,fields)}).catch(error=>updateJob(job,{status:job.cancelled?'cancelled':'error',message:error.message}));return publicJob(job);
 });
 ipcMain.handle('exports:cancel',(_event,id)=>{const job=jobs.get(id);if(!job)return {ok:false};job.cancelled=true;job.process?.kill('SIGTERM');updateJob(job,{status:'cancelled',message:'Export cancelled.'});return {ok:true}});
 ipcMain.handle('exports:saveFile',async(_event,{id,name})=>{const job=jobs.get(id),allowed=new Set(['edited-video.mp4','project.json','edit-list.json','cut-report.md','transcript.txt','subtitles.srt']);if(!job||!allowed.has(name))throw Error('Export file not found.');const source=path.join(job.folder,name);if(!fs.existsSync(source))throw Error('Export file not found.');const result=await dialog.showSaveDialog(window,{defaultPath:name});if(result.canceled||!result.filePath)return {cancelled:true};fs.copyFileSync(source,result.filePath);return {cancelled:false,filePath:result.filePath}});
 ipcMain.handle('exports:reveal',(_event,id)=>{const job=jobs.get(id);if(!job)throw Error('Export not found.');shell.showItemInFolder(path.join(job.folder,'edited-video.mp4'));return {ok:true}});
}
function createWindow(){
 window=new BrowserWindow({width:1500,height:980,minWidth:980,minHeight:700,backgroundColor:'#fff6e9',title:'Cutroom',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const dev=process.env.CUTROOM_DEV_URL;if(dev)window.loadURL(dev);else window.loadFile(path.join(__dirname,'..','dist','renderer','index.html'));
}

app.whenReady().then(()=>{
 const legacyRoot=process.env.CUTROOM_LEGACY_ROOT||path.resolve(__dirname,'../..');store=new ProjectStore({userData:app.getPath('userData'),resourcesPath:app.isPackaged?process.resourcesPath:path.join(__dirname,'..','public'),legacyRoot});store.initialize();loadJobs();
 protocol.handle('cutroom-media',request=>{const file=mediaFile(new URL(request.url).hostname);if(!file||!fs.existsSync(file))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(file).toString(),{headers:request.headers,bypassCustomProtocolHandlers:true})});
 registerIpc();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
