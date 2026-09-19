const fs=require('node:fs');
const path=require('node:path');
const {normalizeRecording,probeVideo}=require('./recording-import.cjs');
const {validateProject}=require('./project-store.cjs');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const firstFile=files=>files.find(file=>{try{return fs.statSync(file).isFile()}catch{return false}});

// Only read browser files. ProjectStore.create writes a new independent copy.
async function importWebProject({store,dialog,window}){
 const old=store.readConfig();
 const defaultPath=firstFile([old?.importedFrom, store.legacyRoot&&path.join(store.legacyRoot,'edits','recording.edits.json')].filter(Boolean));
 const selected=await dialog.showOpenDialog(window,{title:'Import web project — choose recording.edits.json',defaultPath,properties:['openFile'],filters:[{name:'Web edit project',extensions:['json']}]});
 if(selected.canceled)return {cancelled:true};
 const editsPath=selected.filePaths[0],dir=path.dirname(editsPath);
 const roots=[dir,path.dirname(dir)];
 const candidates=roots.flatMap(root=>[path.join(root,'recording-editor','public','recording.json'),path.join(root,'public','recording.json'),path.join(root,'recording.json')]);
 const raw=readJson(editsPath),snapshot=raw.project||raw;
 let recordingPath=candidates.find(file=>{
  try{const recording=normalizeRecording(readJson(file));validateProject(structuredClone(snapshot),recording);return true}catch{return false}
 });
 if(!recordingPath){
  const result=await dialog.showOpenDialog(window,{title:'Locate transcript — recording.json',defaultPath:dir,properties:['openFile'],filters:[{name:'Recording metadata',extensions:['json']}]});
  if(result.canceled)return {cancelled:true};recordingPath=result.filePaths[0];
 }
 const recording=normalizeRecording(readJson(recordingPath));validateProject(structuredClone(snapshot),recording);
 const metadataDir=path.dirname(recordingPath);
 let videoPath=firstFile([...roots,metadataDir,path.dirname(metadataDir),path.resolve(metadataDir,'../..')].map(root=>path.resolve(root,recording.source)));
 if(!videoPath){
  const result=await dialog.showOpenDialog(window,{title:'Locate original video — '+recording.source,defaultPath:dir,properties:['openFile'],filters:[{name:'Video',extensions:['mp4','mov','mkv','m4v','webm']}]});
  if(result.canceled)return {cancelled:true};videoPath=result.filePaths[0];
 }
 const media=await probeVideo(videoPath);
 if(Math.abs(media.duration-recording.duration)>.1)throw Error('That video has a different duration. Choose the original recording.');
 const result=await dialog.showSaveDialog(window,{title:'Save imported Narezator project',defaultPath:recording.title+'.narezator',filters:[{name:'Narezator project',extensions:['narezator']}]});
 if(result.canceled||!result.filePath)return {cancelled:true};
 // Read again after the dialogs: the browser may have saved more work meanwhile.
 const latest=readJson(editsPath),project=validateProject(latest.project||latest,recording);
 store.create({manifestPath:result.filePath,videoPath,recording,project,waveformPath:firstFile([path.join(metadataDir,'waveform.json')]),captionsPath:firstFile([path.join(metadataDir,'source-captions.vtt')])});
 return {cancelled:false};
}
module.exports={importWebProject};
