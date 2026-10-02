const fs=require('node:fs');
const {importRecording}=require('./recording-import.cjs');
const {validateProject}=require('./project-store.cjs');
async function newWorkspace({options,store,credentials,transcriptions,dialog,window}){
 credentials.require(options.provider);
 const recording=await importRecording({videoPath:options.videoPath,title:options.title,chaptersPath:options.chaptersPath});
 let project;if(options.editsPath){const raw=JSON.parse(fs.readFileSync(options.editsPath,'utf8'));project=validateProject(raw.project||raw,recording)}
 const result=await dialog.showSaveDialog(window,{title:'Save new Narezator project',defaultPath:recording.title+'.narezator',filters:[{name:'Narezator project',extensions:['narezator']}]});
 if(result.canceled||!result.filePath)return {cancelled:true};
 const config=store.create({manifestPath:result.filePath,videoPath:options.videoPath,recording,project});
 transcriptions.start(config,options.provider);
 return {cancelled:false};
}
module.exports={newWorkspace};
