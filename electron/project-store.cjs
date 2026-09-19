const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {normalizeRecording}=require('./recording-import.cjs');

const EPSILON=.00001;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clone=value=>structuredClone(value);

function validateProject(project,recording){
 if(!project||typeof project!=='object'||project.version!==1||project.source!==recording.source||!finite(project.duration)||Math.abs(project.duration-recording.duration)>.1)throw Error('Project does not match this recording.');
 const clips=value=>{
  if(!Array.isArray(value)||value.length>2000)throw Error('Invalid project clips.');
  const ids=new Set();
  for(const clip of value){
   if(!clip||typeof clip.id!=='string'||ids.has(clip.id)||typeof clip.label!=='string'||clip.label.length>2000||!finite(clip.start)||!finite(clip.end)||clip.start<0||clip.end>recording.duration+.001||clip.end-clip.start<EPSILON)throw Error('Invalid clip.');
   ids.add(clip.id);
  }
 };
 const events=value=>{
  if(!Array.isArray(value)||value.length>100000)throw Error('Invalid edit history.');
  for(const event of value)if(!event||!['id','at','type','label'].every(key=>typeof event[key]==='string'))throw Error('Invalid edit event.');
 };
 const chapters=value=>{
  if(!Array.isArray(value)||value.length!==recording.chapters.length)throw Error('Invalid chapters.');
  const expected=new Set(recording.chapters.map(chapter=>chapter.id)),seen=new Set();
  for(const chapter of value){
   if(!chapter||!expected.has(chapter.id)||seen.has(chapter.id)||typeof chapter.title!=='string'||typeof chapter.question!=='string'||!(chapter.start===null||(finite(chapter.start)&&chapter.start>=0&&chapter.start<recording.duration)))throw Error('Invalid chapter.');
   seen.add(chapter.id);
  }
 };
 const snapshot=value=>{if(!value||typeof value!=='object')throw Error('Invalid project snapshot.');clips(value.clips);chapters(value.chapters)};
 snapshot(project);events(project.events);
 for(const key of ['undo','redo']){if(!Array.isArray(project[key])||project[key].length>75)throw Error('Invalid undo history.');project[key].forEach(snapshot)}
 if(!Array.isArray(project.reels))project.reels=[];
 if(project.reels.length>500)throw Error('Invalid reels.');
 const reelIds=new Set();
 for(const reel of project.reels){
  if(!reel||typeof reel.id!=='string'||reelIds.has(reel.id)||typeof reel.title!=='string'||!reel.title.trim()||typeof reel.createdAt!=='string')throw Error('Invalid reel.');
  reelIds.add(reel.id);clips(reel.clips);events(reel.events);
  for(const key of ['undo','redo']){if(!Array.isArray(reel[key])||reel[key].length>75)throw Error('Invalid reel history.');for(const state of reel[key])clips(state?.clips)}
 }
 if(project.annotations===undefined)project.annotations=[];
 if(!Array.isArray(project.annotations)||project.annotations.length>10000)throw Error('Invalid annotations.');
 const annotationIds=new Set();
 for(const note of project.annotations){
  if(!note||typeof note.id!=='string'||annotationIds.has(note.id)||typeof note.text!=='string'||typeof note.context!=='string'||typeof note.createdAt!=='string'||typeof note.updatedAt!=='string'||(note.reelId!==undefined&&typeof note.reelId!=='string')||!Array.isArray(note.ranges)||!note.ranges.length||note.ranges.length>2000)throw Error('Invalid annotation.');
  annotationIds.add(note.id);
  for(const r of note.ranges)if(!r||!finite(r.start)||!finite(r.end)||r.start<0||r.end>recording.duration+.001||r.end-r.start<EPSILON)throw Error('Invalid annotation range.');
 }
 return project;
}

function initialProject(recording){
 return {version:1,source:recording.source,duration:recording.duration,revision:0,clips:clone(recording.initialClips),chapters:clone(recording.chapters),events:[],undo:[],redo:[],reels:[],annotations:[]};
}

function atomicJson(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=`${file}.tmp`;
 const handle=fs.openSync(temporary,'w');
 try{fs.writeFileSync(handle,JSON.stringify(value,null,2)+'\n','utf8');fs.fsyncSync(handle)}finally{fs.closeSync(handle)}
 fs.renameSync(temporary,file);
}

class ProjectStore{
 constructor({userData,resourcesPath,legacyRoot}){
  this.userData=userData;this.resourcesPath=resourcesPath;this.legacyRoot=legacyRoot;this.configPath=path.join(userData,'workspace.json');this.legacyProjectPath=path.join(userData,'project','recording.edits.json');
 }
 get projectPath(){return this.readConfig()?.projectPath||this.legacyProjectPath}
 bundled(name){return path.join(this.resourcesPath,name)}
 readConfig(){try{return JSON.parse(fs.readFileSync(this.configPath,'utf8'))}catch{return null}}
 writeConfig(config){atomicJson(this.configPath,config);return config}
 recordingPath(config=this.readConfig()){return config?.recordingPath||this.bundled('recording.json')}
 recording(config=this.readConfig()){
  const file=this.recordingPath(config);if(!fs.existsSync(file))throw Error('Recording metadata is missing.');return JSON.parse(fs.readFileSync(file,'utf8'));
 }
 initialize(){
  const configured=this.readConfig();if(configured)return configured;
  if(!this.legacyRoot)return null;
  const videoPath=path.join(this.legacyRoot,'video.mp4'),recordingPath=path.join(this.legacyRoot,'recording-editor','public','recording.json');
  if(!fs.existsSync(videoPath)||!fs.existsSync(recordingPath))return configured;
  const config=this.writeConfig({videoPath,recordingPath,waveformPath:path.join(this.legacyRoot,'recording-editor','public','waveform.json'),captionsPath:path.join(this.legacyRoot,'recording-editor','public','source-captions.vtt'),importedFrom:path.join(this.legacyRoot,'edits','recording.edits.json')});
  if(!fs.existsSync(this.projectPath))this.importProject(config.importedFrom,config);
  return config;
 }
 importProject(source,config=this.readConfig()){
  if(!source||!fs.existsSync(source))throw Error('The selected edit project does not exist.');
  const recording=this.recording(config),raw=JSON.parse(fs.readFileSync(source,'utf8')),project=validateProject(raw.project||raw,recording);
  atomicJson(this.projectPath,project);return project;
 }
 identity(){const config=this.readConfig();return config?.id||'legacy'}
 recent(){try{return JSON.parse(fs.readFileSync(path.join(this.userData,'recent-projects.json'),'utf8'))}catch{return []}}
 remember(config){
  if(!config?.manifestPath)return;
  const entries=this.recent().filter(item=>item.path!==config.manifestPath);
  atomicJson(path.join(this.userData,'recent-projects.json'),[{path:config.manifestPath,title:config.title||path.basename(config.videoPath),id:config.id},...entries].slice(0,20));
 }
 ensureManifest(){
  const config=this.initialize();if(!config||config.closed)return null;
  if(config.manifestPath){this.remember(config);return config}
  // Preserve the existing Electron project in place; no web edit file is written.
  const recording=this.recording(config),manifestPath=path.join(this.userData,'project','current.narezator');
  const next={...config,id:'legacy',title:recording.title,manifestPath,projectPath:this.legacyProjectPath};
  atomicJson(manifestPath,{format:'narezator',version:1,...next});this.writeConfig(next);this.remember(next);return next;
 }
 info(){const config=this.ensureManifest();return {active:!!config,projectId:config?.id||null,title:config?.title||null,manifestPath:config?.manifestPath||null,recent:this.recent()}}
 close(){this.ensureManifest();this.writeConfig({closed:true})}
 create({manifestPath,videoPath,recording,project,waveformPath,captionsPath}){
  recording=normalizeRecording(clone(recording));project=validateProject(clone(project||initialProject(recording)),recording);
  if(!fs.existsSync(videoPath))throw Error('The selected video is missing.');
  manifestPath=path.resolve(manifestPath);
  const dataDir=manifestPath+'.data';
  if(fs.existsSync(manifestPath)||fs.existsSync(dataDir))throw Error('A project already exists at that location. Choose a new name.');
  this.ensureManifest();
  fs.mkdirSync(dataDir,{recursive:true});
  const config={id:randomUUID(),title:recording.title,videoPath:path.resolve(videoPath),recordingPath:path.join(dataDir,'recording.json'),projectPath:path.join(dataDir,'recording.edits.json'),manifestPath};
  atomicJson(config.recordingPath,recording);atomicJson(config.projectPath,project);
  for(const [key,file,name] of [['waveformPath',waveformPath,'waveform.json'],['captionsPath',captionsPath,'source-captions.vtt']]){
   if(file&&fs.existsSync(file)){config[key]=path.join(dataDir,name);fs.copyFileSync(file,config[key])}
  }
  const relative={...config,videoPath:path.relative(path.dirname(manifestPath),config.videoPath),recordingPath:path.relative(path.dirname(manifestPath),config.recordingPath),projectPath:path.relative(path.dirname(manifestPath),config.projectPath)};
  for(const key of ['waveformPath','captionsPath'])if(config[key])relative[key]=path.relative(path.dirname(manifestPath),config[key]);
  atomicJson(manifestPath,{format:'narezator',version:1,...relative});
  this.writeConfig(config);this.remember(config);return config;
 }
 inspect(manifestPath){
  manifestPath=path.resolve(manifestPath);
  const raw=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!['narezator','cutroom'].includes(raw.format)||raw.version!==1||typeof raw.id!=='string')throw Error('Choose a .narezator or legacy .cutroom project file. To transfer browser edits, use Import Web Project.');
  const config={...raw,manifestPath};
  for(const key of ['videoPath','recordingPath','projectPath']){if(typeof raw[key]!=='string'||!raw[key])throw Error('Invalid project file.');config[key]=path.resolve(path.dirname(manifestPath),raw[key])}
  for(const key of ['waveformPath','captionsPath'])if(raw[key])config[key]=path.resolve(path.dirname(manifestPath),raw[key]);
  const recording=normalizeRecording(this.recording(config));validateProject(JSON.parse(fs.readFileSync(config.projectPath,'utf8')),recording);
  return config;
 }
 open(manifestPath,replacementVideo){
  const config=this.inspect(manifestPath);
  if(replacementVideo)config.videoPath=path.resolve(replacementVideo);
  if(!fs.existsSync(config.videoPath))throw Error('The video was moved. Locate it to open this project.');
  this.ensureManifest();
  if(replacementVideo)atomicJson(manifestPath,{format:config.format||'narezator',version:1,...config});
  this.writeConfig(config);this.remember(config);return config;
 }

 load(){
  const config=this.initialize();if(config?.closed||!config?.videoPath||!fs.existsSync(config.videoPath))throw Object.assign(Error('Open a project or locate its video to continue.'),{code:'NO_WORKSPACE'});
  const recording=this.recording(config);
  if(!fs.existsSync(this.projectPath))atomicJson(this.projectPath,initialProject(recording));
  const project=validateProject(JSON.parse(fs.readFileSync(this.projectPath,'utf8')),recording);
  return {config,recording,project};
 }
 save(project,baseRevision,projectId){
  if(projectId&&projectId!==this.identity())throw Error('The active project changed. This save belongs to another project.');
  const {recording,project:previous}=this.load();if(baseRevision!==previous.revision)throw Object.assign(Error('Edits changed in another Electron window. Reload before continuing.'),{code:'REVISION_CONFLICT'});
  const next=validateProject(clone(project),recording);next.revision=previous.revision+1;next.savedAt=new Date().toISOString();
  atomicJson(path.join(path.dirname(this.projectPath),'recording.edits.previous.json'),previous);atomicJson(this.projectPath,next);return {revision:next.revision};
 }
}

module.exports={ProjectStore,atomicJson,initialProject,validateProject};
