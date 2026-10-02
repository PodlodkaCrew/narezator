import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chapterRange,currentSummary,validSummary} from '../src/renderer/lib/chapter-summary.ts';
import {createProject,validateProject,type Chapter,type Recording} from '../src/renderer/lib/editor-model.ts';
const require=createRequire(import.meta.url);
const backend=require('../electron/chapter-summaries.cjs');
const {normalizeRecording}=require('../electron/recording-import.cjs');
const {validateProject:validateStored}=require('../electron/project-store.cjs');
const summary={flow:'The discussion moves from the problem to a practical solution.',insights:['A narrower scope improves reliability.','Checking results prevents silent failures.']};
const chapter=(id:string,start:number|null,end:number|null=null,kind:Chapter['kind']='direct'):Chapter=>({id,number:1,title:id,question:`What is ${id}?`,start,end,kind,note:'',evidence:''});
const chapters=[chapter('first',0),chapter('nested',4,10,'covered'),chapter('second',10),chapter('missing',null,null,'missing')];
const recording:Recording={title:'Test',source:'video.mp4',duration:20,fps:30,width:160,height:90,language:'en',chapters,priorCuts:[],initialClips:[{id:'source',start:0,end:20,label:'Source'}],words:[{id:0,start:0,end:1,text:'Start.',speaker:1,section:0},{id:1,start:4,end:5,text:'An insight.',speaker:2,section:0},{id:2,start:10,end:11,text:'Next chapter.',speaker:1,section:0}]};

void test('summary boundaries exclude the next chapter and retain covered discussions inside the main answer',()=>{
 for(const range of [chapterRange,backend.chapterRange]){
  assert.deepEqual(range(chapters[0],chapters,20),{start:0,end:10});
  assert.deepEqual(range(chapters[1],chapters,20),{start:4,end:10});
  assert.deepEqual(range(chapters[2],chapters,20),{start:10,end:20});
  assert.equal(range(chapters[3],chapters,20),null);
  assert.deepEqual(range({...chapters[0],end:5},chapters,20),{start:0,end:5});
  assert.deepEqual(range({...chapters[2],start:12,end:10},chapters,20),{start:12,end:20});
 }
});
void test('old projects remain valid and imported summaries survive project saves and undo snapshots',()=>{
 const project=createProject(structuredClone(recording));assert.equal(validateProject(project,recording),project);
 project.chapters[0]={...project.chapters[0],summary};project.undo=[{clips:project.clips,chapters:structuredClone(project.chapters)}];
 assert.deepEqual(validateProject(project,recording).undo[0].chapters[0].summary,summary);
 assert.deepEqual(validateStored(structuredClone(project),recording).chapters[0].summary,summary);
 assert.deepEqual(normalizeRecording({...recording,chapters:project.chapters}).chapters[0].summary,summary);
 for(const bad of [{...summary,insights:['Only one']},{...summary,insights:['One','Two','Three','Four']},{...summary,flow:''},{...summary,insights:['One',{}]},{...summary,range:{start:0,end:100}}]){
  assert.equal(validSummary(bad,20),false);assert.equal(backend.validSummary(bad,20),false);
  const invalid={...project,chapters:project.chapters.map((c,i)=>i?c:{...c,summary:bad})};
  assert.throws(()=>validateProject(invalid,recording),/chapter details/);
  assert.throws(()=>validateStored(invalid,recording),/chapter/);
  assert.throws(()=>normalizeRecording({...recording,chapters:invalid.chapters}),/chapter/);
 }
});
void test('summaries generated for old boundaries are not displayed after markers change',()=>{
 const c={...chapters[0],summary:{...summary,range:{start:0,end:10}}};
 for(const get of [currentSummary,backend.currentSummary]){
  assert.deepEqual(get(c,{start:0,end:10}),c.summary);
  assert.equal(get(c,{start:0,end:9}),null);
  assert.equal(get(c,{start:1,end:10}),null);
  assert.deepEqual(get({...c,summary},null),summary);
 }
});
void test('generation scopes text to the source chapter, deduplicates requests, and leaves cuts and history intact',async()=>{
 let calls=0,input:any,release:((value:unknown)=>void)|undefined;
 const manager=new backend.ChapterSummaries({credentials:{get:()=> 'test-key'},request:(value:unknown)=>{calls++;input=value;return new Promise(resolve=>{release=resolve})}});
 const project=createProject(structuredClone(recording)),before=structuredClone(project),args={config:{recordingPath:'/fixture/recording.json'},project,recording,chapterId:'first'};
 const a=manager.generate(args),b=manager.generate(args);assert.equal(calls,1);release!(summary);
 assert.deepEqual(await a,{...summary,range:{start:0,end:10}});assert.deepEqual(await b,await a);
 assert.match(input.transcript,/Start\./);assert.match(input.transcript,/An insight\./);assert.doesNotMatch(input.transcript,/Next chapter/);
 assert.deepEqual(project,before);await manager.generate(args);assert.equal(calls,1);
 // Moving the next main marker changes the preceding chapter's input.
 const moved={...project,chapters:project.chapters.map(c=>c.id==='second'?{...c,start:12}:c)};
 const next=manager.generate({...args,project:moved});assert.equal(calls,2);release!(summary);assert.deepEqual((await next).range,{start:0,end:12});
});
void test('saved summaries need no key; missing chapters and transcripts make no requests; failures can be retried',async()=>{
 let calls=0;
 const manager=new backend.ChapterSummaries({credentials:{get:()=>null},request:()=>{calls++;return summary}});
 const project=createProject(structuredClone(recording)),args={config:{recordingPath:'/fixture/recording.json'},project,recording,chapterId:'first'};
 const saved={...project,chapters:project.chapters.map((c,i)=>i?c:{...c,summary})};assert.deepEqual(await manager.generate({...args,project:saved}),summary);
 await assert.rejects(()=>manager.generate({...args,chapterId:'missing'}),/start/);
 await assert.rejects(()=>manager.generate({...args,recording:{...recording,words:[]}}),/transcript/);
 await assert.rejects(()=>manager.generate(args),/OpenAI API key/);assert.equal(calls,0);
 const retry=new backend.ChapterSummaries({credentials:{get:()=> 'test-key'},request:async()=>{calls++;if(calls===1)throw Error('Temporary failure');return summary}});
 await assert.rejects(()=>retry.generate(args),/Temporary failure/);assert.deepEqual((await retry.generate(args)).insights,summary.insights);assert.equal(calls,2);
});
void test('OpenAI request uses a strict summary schema and parses raw Responses output',async()=>{
 let payload:any;
 const result=await backend.requestSummary({apiKey:'test-key',chapter:chapters[0],transcript:'Discussion',language:'en',signal:new AbortController().signal,fetchImpl:async(url:string,options:any)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer test-key');payload=JSON.parse(options.body);
  return Response.json({status:'completed',output:[{type:'reasoning',content:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify(summary)}]}]});
 }});
 assert.deepEqual(result,summary);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.equal(payload.text.format.schema.properties.insights.minItems,2);assert.equal(payload.text.format.schema.properties.insights.maxItems,3);assert.ok(!JSON.stringify(payload).includes('test-key'));
 for(const response of [Response.json({error:{message:'SECRET provider body'}},{status:401}),Response.json({status:'incomplete'}),Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'SECRET refusal'}]}]}),Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...summary,insights:['One']})}]}]})]){
  await assert.rejects(()=>backend.requestSummary({apiKey:'test-key',chapter:chapters[0],transcript:'Discussion',language:'en',signal:new AbortController().signal,fetchImpl:async()=>response}),e=>{assert.ok(e instanceof Error);assert.doesNotMatch(e.message,/SECRET/);return true});
 }
});
