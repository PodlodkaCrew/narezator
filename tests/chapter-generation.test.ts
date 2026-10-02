import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createProject,validateProject,undoProject,type Recording,type Chapter} from '../src/renderer/lib/editor-model.ts';
const require=createRequire(import.meta.url);
const {ChapterGeneration,transcriptBlocks,chaptersFromOutline,requestChapters}=require('../electron/chapter-generation.cjs');
const {ProjectStore,validateProject:validateStored}=require('../electron/project-store.cjs');
const recording:Recording={title:'Topics',source:'video.mp4',duration:30,fps:30,width:160,height:90,language:'en',chapters:[],priorCuts:[],initialClips:[{id:'source',start:0,end:30,label:'Source'}],words:Array.from({length:30},(_,id)=>({id,start:id,end:id+.8,text:`Word${id}.`,speaker:id<15?1:2,section:0}))};
const description={flow:'The conversation moves from a problem to possible solutions.',insights:['The first approach has a cost.','The second approach offers a tradeoff.']};
const outline={chapters:[{title:'First topic',startWordId:0,...description},{title:'Second topic',startWordId:15,...description}]};
const generated=()=>chaptersFromOutline(outline,recording) as Chapter[];

void test('generated chapter boundaries use exact source words and cover the recording in order',()=>{
 const result=generated();assert.deepEqual(result.map(c=>[c.start,c.end]),[[0,15],[15,30]]);assert.equal(result[1].id,'auto-15');assert.equal(result[1].number,2);assert.deepEqual(result[1].summary?.range,{start:15,end:30});
 for(const bad of [{chapters:[]},{chapters:[outline.chapters[1],outline.chapters[0]]},{chapters:[{...outline.chapters[0],startWordId:99}]},{chapters:[outline.chapters[0],outline.chapters[0]]},{chapters:[{...outline.chapters[0],insights:['One']}]},{chapters:[outline.chapters[1]]}])assert.throws(()=>chaptersFromOutline(bad,recording),/chapter/);
});
void test('transcript blocks preserve sentence starts, speaker changes, pauses and source IDs',()=>{
 const words=[{id:7,start:1,end:1.5,text:'First',speaker:1},{id:8,start:1.5,end:2,text:'sentence.',speaker:1},{id:9,start:2,end:2.5,text:'Next',speaker:1},{id:10,start:2.5,end:3,text:'speaker',speaker:2},{id:11,start:8,end:9,text:'after pause.',speaker:2}];
 assert.deepEqual(transcriptBlocks(words).map((b:any)=>[b.startWordId,b.start,b.text]),[[7,1,'First sentence.'],[9,2,'Next'],[10,2.5,'speaker'],[11,8,'after pause.']]);
 assert.deepEqual(words.map(w=>w.id),[7,8,9,10,11]);
});
void test('projects with no supplied chapter file can save generated chapters while preserving their edits and undo',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-chapter-store-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const store=new ProjectStore({userData:path.join(root,'profile'),resourcesPath:root}),videoPath=path.join(root,'video.mp4');fs.writeFileSync(videoPath,'fixture');
 const config=store.create({manifestPath:path.join(root,'chapters.narezator'),recording,videoPath});
 const project=createProject(structuredClone(recording));project.clips[0].start=2;project.undo=[{clips:[{...project.clips[0],start:0}],chapters:[]}];project.annotations=[{id:'note',text:'Keep it',createdAt:'today',updatedAt:'today',context:'Source',ranges:[{start:3,end:4}]}];
 const next={...project,chapters:generated(),undo:project.undo.map(s=>({...s,chapters:generated()}))};
 validateProject(next,recording);validateStored(next,recording);store.save(next,0,config.id);store.close();store.open(config.manifestPath);
 assert.equal(store.load().project.chapters.length,2);assert.equal(store.load().project.clips[0].start,2);assert.equal(store.load().project.annotations[0].text,'Keep it');
 assert.equal(undoProject(next).chapters.length,2);assert.equal(undoProject(next).clips[0].start,0);
 const imported={...recording,chapters:generated()};assert.throws(()=>validateProject({...next,chapters:[]},imported),/imported chapter/);assert.throws(()=>validateStored({...next,chapters:[]},imported),/imported chapter/);
});
void test('generation caches descriptions for the original project, deduplicates and survives a restart without a key',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-chapter-cache-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const config={recordingPath:path.join(root,'recording.json')},project=createProject(structuredClone(recording)),args={config,recording,project};let requests=0,release:((value:unknown)=>void)|undefined;
 const manager=new ChapterGeneration({credentials:{get:()=> 'test-key'},request:()=>{requests++;return new Promise(resolve=>{release=resolve})}});
 const a=manager.generate(args),b=manager.generate(args);assert.equal(requests,1);release!(generated());assert.deepEqual(await a,await b);assert.deepEqual(project.chapters,[]);
 const saved=JSON.parse(fs.readFileSync(manager.cachePath(config),'utf8'));assert.ok(!JSON.stringify(saved).includes('test-key'));
 const restart=new ChapterGeneration({credentials:{get:()=>null}});assert.deepEqual(await restart.generate(args),generated());
 assert.equal(restart.cached(config,{...recording,words:recording.words.slice(1)}),null);
 assert.equal(restart.cached({recordingPath:path.join(root,'other','recording.json')},recording),null);
 await assert.rejects(()=>restart.generate({...args,config:{recordingPath:path.join(root,'other','recording.json')}}),/OpenAI key/);
});
void test('supplied chapters skip generation; failures retry; an empty transcript cannot trigger a request',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-chapter-retry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let requests=0;
 const manager=new ChapterGeneration({credentials:{get:()=> 'test-key'},request:async()=>{requests++;if(requests===1)throw Error('Connection failed');return generated()}}),args={config:{recordingPath:path.join(root,'recording.json')},recording,project:createProject(structuredClone(recording))};
 assert.deepEqual(await manager.generate({...args,project:{...args.project,chapters:generated()}}),generated());assert.equal(requests,0);
 await assert.rejects(()=>manager.generate({...args,recording:{...recording,words:[]}}),/transcription/);assert.equal(requests,0);
 await assert.rejects(()=>manager.generate(args),/Connection failed/);assert.deepEqual(await manager.generate(args),generated());assert.equal(requests,2);
});
void test('the provider receives source sentence anchors and must return strict chapters with 2–3 insights',async()=>{
 const chapters=await requestChapters({apiKey:'test-key',recording,signal:new AbortController().signal,fetchImpl:async(url:string,options:any)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body),input=JSON.parse(body.input);
  assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.properties.chapters.items.properties.insights.minItems,2);assert.equal(body.text.format.schema.properties.chapters.items.properties.insights.maxItems,3);
  assert.equal(input.transcript[15].startWordId,15);assert.equal(input.transcript[15].start,15);assert.ok(!options.body.includes('test-key'));
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(outline)}]}]});
 }});
 assert.deepEqual(chapters,generated());
});
