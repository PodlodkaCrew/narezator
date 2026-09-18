const fs=require('node:fs');
const path=require('node:path');

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
 return project;
}

function initialProject(recording){
 return {version:1,source:recording.source,duration:recording.duration,revision:0,clips:clone(recording.initialClips),chapters:clone(recording.chapters),events:[],undo:[],redo:[],reels:[]};
}

function atomicJson(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=`${file}.tmp`;
 const handle=fs.openSync(temporary,'w');
 try{fs.writeFileSync(handle,JSON.stringify(value,null,2)+'\n','utf8');fs.fsyncSync(handle)}finally{fs.closeSync(handle)}
 fs.renameSync(temporary,file);
}

class ProjectStore{
 constructor({userData,resourcesPath,legacyRoot}){
  this.userData=userData;this.resourcesPath=resourcesPath;this.legacyRoot=legacyRoot;this.configPath=path.join(userData,'workspace.json');this.projectPath=path.join(userData,'project','recording.edits.json');
 }
 bundled(name){return path.join(this.resourcesPath,name)}
 readConfig(){try{return JSON.parse(fs.readFileSync(this.configPath,'utf8'))}catch{return null}}
 writeConfig(config){atomicJson(this.configPath,config);return config}
 recordingPath(config=this.readConfig()){return config?.recordingPath||this.bundled('recording.json')}
 recording(config=this.readConfig()){
  const file=this.recordingPath(config);if(!fs.existsSync(file))throw Error('Recording metadata is missing.');return JSON.parse(fs.readFileSync(file,'utf8'));
 }
 initialize(){
  const configured=this.readConfig();if(configured?.videoPath&&fs.existsSync(configured.videoPath))return configured;
  const videoPath=path.join(this.legacyRoot,'video.mp4'),recordingPath=path.join(this.legacyRoot,'recording-editor','public','recording.json');
  if(!fs.existsSync(videoPath)||!fs.existsSync(recordingPath))return configured;
  const config=this.writeConfig({videoPath,recordingPath,waveformPath:path.join(this.legacyRoot,'recording-editor','public','waveform.json'),captionsPath:path.join(this.legacyRoot,'recording-editor','public','source-captions.vtt'),importedFrom:path.join(this.legacyRoot,'edits','recording.edits.json')});
  if(!fs.existsSync(this.projectPath))this.importProject(config.importedFrom,config);
  return config;
 }
 configure({videoPath,projectToImport}){
  const config=this.writeConfig({videoPath,recordingPath:this.bundled('recording.json'),waveformPath:this.bundled('waveform.json'),captionsPath:this.bundled('source-captions.vtt'),importedFrom:projectToImport||null});
  if(projectToImport)this.importProject(projectToImport,config);else atomicJson(this.projectPath,initialProject(this.recording(config)));
  return config;
 }
 importProject(source,config=this.readConfig()){
  if(!source||!fs.existsSync(source))throw Error('The selected edit project does not exist.');
  const recording=this.recording(config),raw=JSON.parse(fs.readFileSync(source,'utf8')),project=validateProject(raw.project||raw,recording);
  atomicJson(this.projectPath,project);return project;
 }
 load(){
  const config=this.initialize();if(!config?.videoPath||!fs.existsSync(config.videoPath))throw Object.assign(Error('Choose video.mp4 to start the standalone editor.'),{code:'NO_WORKSPACE'});
  const recording=this.recording(config);
  if(!fs.existsSync(this.projectPath))atomicJson(this.projectPath,initialProject(recording));
  const project=validateProject(JSON.parse(fs.readFileSync(this.projectPath,'utf8')),recording);
  return {config,recording,project};
 }
 save(project,baseRevision){
  const {recording,project:previous}=this.load();if(baseRevision!==previous.revision)throw Object.assign(Error('Edits changed in another Electron window. Reload before continuing.'),{code:'REVISION_CONFLICT'});
  const next=validateProject(clone(project),recording);next.revision=previous.revision+1;next.savedAt=new Date().toISOString();
  atomicJson(path.join(path.dirname(this.projectPath),'recording.edits.previous.json'),previous);atomicJson(this.projectPath,next);return {revision:next.revision};
 }
}

module.exports={ProjectStore,atomicJson,initialProject,validateProject};
