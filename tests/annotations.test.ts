import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {annotationRanges,buildAnnotationReport,createProject,commit,undoProject,validateProject,type Annotation,type Recording} from '../src/renderer/lib/editor-model.ts';
const require=createRequire(import.meta.url);
const {ProjectStore,validateProject:validateBackend}=require('../electron/project-store.cjs');
const data:Recording={title:'Notes',source:'video.mp4',duration:60,fps:30,width:160,height:90,language:'ru',chapters:[],priorCuts:[],initialClips:[{id:'b',start:30,end:40,label:'B'},{id:'a',start:10,end:20,label:'A'}],words:[{id:0,start:38,end:39,text:'Начало',speaker:1,section:0},{id:1,start:39,end:40,text:'конец.',speaker:1,section:0},{id:2,start:10,end:11,text:'Первая фраза.',speaker:1,section:0},{id:3,start:13,end:14,text:'Последняя фраза.',speaker:1,section:0}]};
const note:Annotation={id:'note',text:'Добавить титр <b>как текст</b>\n\nВторая строка 🎬',createdAt:'today',updatedAt:'today',context:'Main cut',ranges:[{start:38,end:40},{start:10,end:14}]};
test('annotations retain only selected source ranges across reordered, removed and repeated clips',()=>{
 assert.deepEqual(annotationRanges(data.initialClips,{start:8,end:14},'edit',60),note.ranges);
 assert.deepEqual(annotationRanges(data.initialClips,{start:14,end:8},'edit',60),note.ranges);
 assert.deepEqual(annotationRanges(data.initialClips,{start:9,end:5},'source',60),[{start:5,end:9}]);
 assert.deepEqual(annotationRanges([{id:'a',start:1,end:3,label:''},{id:'b',start:3,end:5,label:''}],{start:0,end:4},'edit',60),[{start:1,end:5}]);
 assert.deepEqual(annotationRanges([...data.initialClips,data.initialClips[0]],{start:0,end:30},'edit',60),[{start:30,end:40},{start:10,end:20},{start:30,end:40}]);
 const p={...createProject(data),annotations:[note]};const edited=commit(p,{clips:[],chapters:[]},'cut','Cut all');assert.deepEqual(edited.annotations,[note]);assert.deepEqual(undoProject(edited).annotations,[note]);
});
test('annotation report includes each source interval, boundary phrases, and multiline note text',()=>{
 const report=buildAnnotationReport(data.title,data.source,[note],data.words);
 assert.ok(report.includes('00:00:38 – Начало  \n00:00:40 – конец.'));
 assert.ok(report.includes('00:00:10 – Первая фраза. Последняя фраза.  \n00:00:14 – Последняя фраза.'));
 assert.ok(report.includes(note.text));assert.equal((report.match(/## Аннотация /g)||[]).length,1);
 assert.ok(buildAnnotationReport('',data.source,[{...note,ranges:[{start:50,end:51}]}],data.words).includes('(нет распознанной речи)'));
});
test('both validators migrate absent notes and reject invalid data without silently discarding annotations',()=>{
 const p=createProject(data);const legacy={...p};delete (legacy as Partial<typeof p>).annotations;
 for(const validate of [validateProject,validateBackend]){
  assert.deepEqual(validate(structuredClone(legacy),data).annotations,[]);
  assert.deepEqual(validate({...p,annotations:[note]},data).annotations,[note]);
  for(const annotations of [null,{},[note,note],[{...note,text:5}],[{...note,ranges:[]}],[{...note,ranges:[{start:-1,end:2}]}],[{...note,ranges:[{start:1,end:61}]}],[{...note,ranges:[{start:3,end:3}]}]])assert.throws(()=>validate({...p,annotations},data));
 }
});
test('annotations persist through saves, close/reopen and copied projects without altering cuts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'narezator-notes-'));try{
  const videoPath=join(dir,'video.mp4');writeFileSync(videoPath,'fixture');const store=new ProjectStore({userData:join(dir,'user'),resourcesPath:dir,legacyRoot:dir});
  const p={...createProject(data),annotations:[note]};const config=store.create({manifestPath:join(dir,'a.narezator'),videoPath,recording:data,project:p});
  store.save({...store.load().project,annotations:[{...note,text:'Updated'}]},0,config.id);store.close();store.open(config.manifestPath);
  assert.equal(store.load().project.annotations[0].text,'Updated');assert.deepEqual(store.load().project.clips,p.clips);
  const bytes=readFileSync(config.projectPath);store.create({manifestPath:join(dir,'b.narezator'),videoPath,recording:data,project:store.load().project});assert.deepEqual(store.load().project.annotations,[{...note,text:'Updated'}]);assert.deepEqual(readFileSync(config.projectPath),bytes);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
