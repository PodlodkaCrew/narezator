import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atEditTime,buildCutReport,commit,commitReel,createProject,createReel,cutRange,cutReportEntries,duration,extractEditRange,isolateRange,moveClips,parseTimecode,positioned,removedRanges,sourceToEdit,splitClip,undoProject,undoReel,validateProject} from '../src/renderer/lib/editor-model.ts';
import type {Recording} from '../src/renderer/lib/editor-model.ts';
const fixture=():Recording=>({title:'Test recording',source:'fixture.mp4',duration:60,fps:30,width:160,height:90,language:'en',words:[],priorCuts:[],initialClips:[{id:'full',start:0,end:60,label:'Full recording'}],chapters:[{id:'intro',number:1,title:'Introduction',question:'What is this?',start:0,end:60,kind:'direct',note:'',evidence:''}]});
const a={id:'a',start:10,end:20,label:'A'},b={id:'b',start:30,end:40,label:'B'},c={id:'c',start:50,end:55,label:'C'};
const bounds=(clips:{start:number;end:number}[])=>clips.map(c=>[c.start,c.end]);
void test('a cut across reordered clips removes precisely the selected edit-time interval',()=>{
 const clips=[b,a,c];
 assert.deepEqual(bounds(cutRange(clips,{start:8,end:14},'edit')),[[30,38],[14,20],[50,55]]);
 assert.equal(duration(cutRange(clips,{start:14,end:8},'edit')),19);
});
void test('source cuts apply to all occurrences without disturbing their edit order',()=>{
 const result=cutRange([b,a,{...a,id:'copy'}],{start:12,end:16},'source');
 assert.deepEqual(bounds(result),[[30,40],[10,12],[16,20],[10,12],[16,20]]);
 assert.equal(new Set(result.map(c=>c.id)).size,result.length);
});
void test('isolating a range preserves every frame and makes a movable group',()=>{
 const result=isolateRange([b,a,c],{start:8,end:14},'edit');
 assert.equal(duration(result.clips),25);assert.equal(result.ids.length,2);
 const moved=moveClips(result.clips,result.ids,null);
 assert.deepEqual(bounds(moved),[[30,38],[14,20],[50,55],[38,40],[10,14]]);
});
void test('split at a boundary is a no-op and interior split retains the original ID',()=>{
 assert.equal(splitClip([a],a.id,10).length,1);
 assert.deepEqual(bounds(splitClip([a],a.id,15)),[[10,15],[15,20]]);
 assert.equal(splitClip([a],a.id,15)[0].id,a.id);
});
void test('source/edit mapping resolves boundaries, repetitions, and removed source time',()=>{
 const clips=[b,a,{...b,id:'again'}];
 assert.equal(atEditTime(clips,10)?.source,10);
 assert.equal(atEditTime(clips,30)?.source,40);
 assert.equal(sourceToEdit(clips,35,'again')?.time,25);
 assert.equal(sourceToEdit(clips,25),null);
 assert.deepEqual(positioned(clips).map(c=>c.offset),[0,10,20]);
});
void test('undo/redo restores exact clips and chapter positions while preserving the audit trail',()=>{
 const data=fixture();
 const original=createProject(data);const next=commit(original,{clips:[a],chapters:original.chapters},'test','Edit');
 const undone=undoProject(next);assert.deepEqual(undone.clips,original.clips);
 assert.deepEqual(undoProject(undone,true).clips,[a]);assert.equal(undone.events.length,2);
 assert.equal(commit(undone,{clips:[b],chapters:original.chapters},'new','Branch').redo.length,0);
});
void test('invalid imports cannot replace the current project',()=>{
 const data=fixture();
 const p=createProject(data);
 assert.throws(()=>validateProject({...p,clips:[{...a,start:NaN}]},data));
 assert.throws(()=>validateProject({...p,clips:[a,a]},data));
 assert.throws(()=>validateProject({...p,source:'elsewhere.mp4'},data));
 assert.throws(()=>validateProject({...p,chapters:[]},data));
 assert.throws(()=>validateProject({...p,chapters:p.chapters.map((c,i)=>i?c:{...c,question:{bad:true}})},data));
 assert.deepEqual(validateProject(p,data),p);
});
void test('time input handles hours and decimals, rejects malformed time',()=>{
 assert.equal(parseTimecode('01:02:03.456'),3723.456);assert.equal(parseTimecode('72.25'),72.25);
 assert.equal(parseTimecode('01:60:00'),null);assert.equal(parseTimecode('-2'),null);assert.equal(parseTimecode(''),null);
});
void test('cut and isolate agree with a discrete playback oracle over 400 intervals',()=>{
 const clips=[b,c,a];const samples=clips.flatMap(c=>Array.from({length:c.end-c.start},(_,i)=>c.start+i));
 for(let lo=0;lo<20;lo++)for(let hi=lo+1;hi<=Math.min(25,lo+20);hi++){
  const expected=samples.filter((_,i)=>i<lo||i>=hi);
  const remaining=cutRange(clips,{start:lo,end:hi},'edit').flatMap(c=>Array.from({length:c.end-c.start},(_,i)=>c.start+i));
  assert.deepEqual(remaining,expected);
  const split=isolateRange(clips,{start:lo,end:hi},'edit');
  assert.deepEqual(split.clips.flatMap(c=>Array.from({length:c.end-c.start},(_,i)=>c.start+i)),samples);
 }
});
void test('cut report finds every removed source range after moves, overlaps, and duplicates',()=>{
 const clips=[
  {id:'later',start:30,end:40,label:'Later'},
  {id:'early',start:10,end:20,label:'Early'},
  {id:'bridge',start:18,end:35,label:'Bridge'},
  {id:'duplicate',start:30,end:40,label:'Duplicate'},
 ];
 assert.deepEqual(removedRanges(clips,60),[{start:0,end:10},{start:40,end:60}]);
});
void test('short cuts use boundary words and longer cuts use boundary phrases',()=>{
 const words=[
  {id:1,text:'Коротко',start:1,end:1.4,speaker:1,section:0},
  {id:2,text:'да.',start:2,end:2.3,speaker:1,section:0},
  {id:3,text:'Первая',start:10,end:10.4,speaker:1,section:0},
  {id:4,text:'фраза.',start:10.5,end:11,speaker:1,section:0},
  {id:5,text:'Середина',start:12,end:12.4,speaker:1,section:0},
  {id:6,text:'фрагмента.',start:13,end:13.5,speaker:1,section:0},
  {id:7,text:'Последняя',start:14,end:14.5,speaker:1,section:0},
  {id:8,text:'фраза.',start:15,end:15.5,speaker:1,section:0},
 ];
 const clips=[{id:'kept',start:3,end:10,label:'Kept'},{id:'tail',start:16,end:20,label:'Tail'}];
 const entries=cutReportEntries(clips,20,words);
 assert.deepEqual(entries.map(({start,end,first,last})=>({start,end,first,last})),[
  {start:0,end:3,first:'Коротко',last:'да.'},
  {start:10,end:16,first:'Первая фраза.',last:'Последняя фраза.'},
 ]);
});
void test('markdown report lists both hh:mm:ss boundaries for every cut',()=>{
 const words=[{id:1,text:'слово',start:2,end:2.5,speaker:1,section:0}];
 const report=buildCutReport('Интервью','video.mp4',[{id:'kept',start:5,end:8,label:'Kept'}],10,words);
 assert.match(report,/Вырезано фрагментов: 2/);
 assert.match(report,/00:00:00 – слово\n00:00:05 – слово/);
 assert.match(report,/00:00:08 – \(нет распознанной речи\)\n00:00:10 – \(нет распознанной речи\)/);
 assert.equal((report.match(/^## Вырезанный фрагмент/gm)||[]).length,2);
});
void test('a reel extracts the selected edit-time sequence without changing the main cut',()=>{
 const main=[b,a,c];
 const extracted=extractEditRange(main,{start:8,end:14});
 assert.deepEqual(bounds(extracted),[[38,40],[10,14]]);
 const reel=createReel('Short answer',extracted);
 const edited=commitReel(reel,{clips:cutRange(reel.clips,{start:.5,end:2.5},'edit')},'cut','Tighten reel');
 assert.deepEqual(bounds(main),[[30,40],[10,20],[50,55]]);
 assert.deepEqual(bounds(edited.clips),[[38,38.5],[10.5,14]]);
 assert.deepEqual(bounds(undoReel(edited).clips),bounds(extracted));
 assert.equal(edited.events.at(-1)?.label,'Tighten reel');
});
void test('old projects migrate to an empty reels collection during validation',()=>{
 const data=fixture();
 const legacy={...createProject(data)} as Record<string,unknown>;
 delete legacy.reels;
 assert.deepEqual(validateProject(legacy,data).reels,[]);
});
