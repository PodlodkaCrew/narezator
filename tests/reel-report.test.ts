import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildCutReport,cutReportEntries,type Clip} from '../src/renderer/lib/editor-model.ts';
const {cutReport}=createRequire(import.meta.url)('../electron/exporter.cjs');
const words=Array.from({length:60},(_,i)=>({id:i,text:`Слово${i}`,start:i,end:i+.5,speaker:1,section:0}));
const recording={title:'Reel',source:'video.mp4',duration:60,words};
const clip=(start:number,end:number):Clip=>({id:`${start}-${end}`,start,end,label:'Clip'});
function report(clips:Clip[]){
 const result=buildCutReport('Reel','video.mp4',clips,60,words,'reel');
 assert.equal(result,cutReport(clips,recording,'reel'),'Saved report and rendered package use identical formatting');
 return result;
}

test('reel reports start with source span and include only internal cuts, numbered from 01',()=>{
 const clips=[clip(25,30),clip(5,10),clip(15,20)],text=report(clips);
 assert.equal(text.split('\n')[0],'00:00:05 – 00:00:30');
 assert.deepEqual(cutReportEntries(clips,60,words,'reel').map(({start,end})=>[start,end]),[[10,15],[20,25]]);
 assert.equal((text.match(/^## Вырезанный фрагмент/gm)||[]).length,2);
 assert.match(text,/## Вырезанный фрагмент 01/);assert.match(text,/00:00:10 – Слово10/);assert.match(text,/00:00:25 – .*Слово24/);
 assert.doesNotMatch(text,/# Монтажный лист|Источник:|Вырезано фрагментов:|Общая длительность|Все таймкоды|00:00:00|00:01:00/);
 // The original full-video format still includes the surrounding cuts and metadata.
 const main=buildCutReport('Main','video.mp4',clips,60,words);
 assert.match(main,/Вырезано фрагментов: 4/);assert.match(main,/# Монтажный лист: Main/);
});

test('a continuous reel has its span and no artificial cuts',()=>{
 const text=report([clip(5,15),clip(10,20)]);
 assert.equal(text.split('\n')[0],'00:00:05 – 00:00:20');assert.doesNotMatch(text,/## Вырезанный фрагмент/);assert.match(text,/нет вырезанных фрагментов/);
});

test('real cuts are retained when a reel touches either recording boundary',()=>{
 for(const clips of [[clip(0,5),clip(10,15)],[clip(45,50),clip(55,60)],[clip(0,5),clip(55,60)]]){
  assert.equal((report(clips).match(/^## Вырезанный фрагмент/gm)||[]).length,1);
 }
});

test('empty reels do not invent source timestamps',()=>{assert.equal(report([]),'_Рилс пуст._\n')});
