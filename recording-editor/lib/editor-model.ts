export interface Word { id:number; text:string; start:number; end:number; speaker:number; section:number }
export interface Chapter { id:string; number:number; title:string; question:string; start:number|null; end:number|null; kind:'direct'|'covered'|'missing'|'manual'; note:string; evidence:string }
export interface Clip { id:string; start:number; end:number; label:string; chapterId?:string }
export interface Recording { title:string; source:string; duration:number; fps:number; width:number; height:number; language:string; words:Word[]; chapters:Chapter[]; initialClips:Clip[]; priorCuts:{start:number;end:number;reason:string}[] }
export interface Snapshot { clips:Clip[]; chapters:Chapter[] }
export interface ReelSnapshot { clips:Clip[] }
export interface EditEvent { id:string; at:string; type:string; label:string; detail?:unknown }
export interface Reel extends ReelSnapshot { id:string; title:string; createdAt:string; events:EditEvent[]; undo:ReelSnapshot[]; redo:ReelSnapshot[] }
export interface Project extends Snapshot { version:1; source:string; duration:number; revision:number; events:EditEvent[]; undo:Snapshot[]; redo:Snapshot[]; reels:Reel[] }
export interface PositionedClip extends Clip { offset:number; index:number }
export interface TimeRange { start:number; end:number }
export interface CutReportEntry extends TimeRange { first:string; last:string; wordCount:number }
export type ViewMode = 'edit'|'source';
export const EPSILON = 0.00001;
export const uid = () => crypto.randomUUID();
export function timecode(value:number, precise=false) {
  const ms=Math.round(Math.max(0,Number.isFinite(value)?value:0)*1000);
  return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${precise?'.'+String(ms%1000).padStart(3,'0'):''}`;
}
export function parseTimecode(value:string) {
 const parts=value.trim().split(':');
 if(parts.length>3||parts.some(x=>!/^\d+(\.\d+)?$/.test(x)))return null;
 const nums=parts.map(Number);
 if(nums.some((x,i)=>i>0&&x>=60))return null;
 return nums.reduce((a,b)=>a*60+b,0);
}
export function duration(clips:Clip[]) {return clips.reduce((n,c)=>n+c.end-c.start,0)}
export function removedRanges(clips:Clip[],sourceDuration:number):TimeRange[] {
 const end=Math.max(0,sourceDuration);
 const retained=clips
  .map(c=>({start:Math.max(0,Math.min(end,c.start)),end:Math.max(0,Math.min(end,c.end))}))
  .filter(c=>c.end-c.start>EPSILON)
  .sort((a,b)=>a.start-b.start||a.end-b.end);
 const merged:TimeRange[]=[];
 for(const range of retained){
  const previous=merged.at(-1);
  if(previous&&range.start<=previous.end+EPSILON)previous.end=Math.max(previous.end,range.end);
  else merged.push({...range});
 }
 const cuts:TimeRange[]=[];let cursor=0;
 for(const range of merged){
  if(range.start-cursor>EPSILON)cuts.push({start:cursor,end:range.start});
  cursor=Math.max(cursor,range.end);
 }
 if(end-cursor>EPSILON)cuts.push({start:cursor,end});
 return cuts;
}
function transcriptWords(words:Word[],range:TimeRange) {
 return words.filter(w=>w.text.trim()&&w.start<range.end-EPSILON&&w.end>range.start+EPSILON);
}
function phraseEnd(text:string) {return /[.!?…](?:["'»”\])}]+)?$/.test(text.trim())}
function phraseStart(words:Word[]) {
 const selected:Word[]=[];
 for(const word of words.slice(0,12)){
  selected.push(word);
  if(selected.length>=2&&phraseEnd(word.text))break;
 }
 return selected.map(w=>w.text.trim()).join(' ');
}
function phraseFinish(words:Word[]) {
 let start=Math.max(0,words.length-12);
 for(let index=words.length-2;index>=start;index--){
  if(phraseEnd(words[index].text)){start=index+1;break}
 }
 return words.slice(start).map(w=>w.text.trim()).join(' ');
}
export function cutReportEntries(clips:Clip[],sourceDuration:number,words:Word[]):CutReportEntry[] {
 return removedRanges(clips,sourceDuration).map(range=>{
  const inside=transcriptWords(words,range);
  if(!inside.length)return {...range,first:'(нет распознанной речи)',last:'(нет распознанной речи)',wordCount:0};
  const short=range.end-range.start<=3;
  return {...range,first:short?inside[0].text.trim():phraseStart(inside),last:short?inside.at(-1)!.text.trim():phraseFinish(inside),wordCount:inside.length};
 });
}
export function buildCutReport(title:string,source:string,clips:Clip[],sourceDuration:number,words:Word[]) {
 const entries=cutReportEntries(clips,sourceDuration,words);
 const removed=entries.reduce((sum,cut)=>sum+cut.end-cut.start,0);
 const lines=[
  `# Монтажный лист: ${title}`,
  '',
  `Источник: \`${source}\`  `,
  `Вырезано фрагментов: ${entries.length}  `,
  `Общая длительность вырезанных фрагментов: ${timecode(removed)}  `,
  'Все таймкоды относятся к исходной записи.',
  '',
 ];
 if(!entries.length)lines.push('_В текущей версии нет вырезанных фрагментов._','');
 entries.forEach((cut,index)=>{
  lines.push(
   `## Вырезанный фрагмент ${String(index+1).padStart(2,'0')}`,
   '',
   `${timecode(cut.start)} – ${cut.first}`,
   `${timecode(cut.end)} – ${cut.last}`,
   '',
  );
 });
 return lines.join('\n');
}
export function positioned(clips:Clip[]):PositionedClip[] {
 let offset=0; return clips.map((c,index)=>{const result={...c,offset,index};offset+=c.end-c.start;return result});
}
export function atEditTime(clips:Clip[],time:number) {
 const list=positioned(clips); const total=duration(clips);
 const t=Math.max(0,Math.min(time,total));
 const clip=list.find(c=>t<c.offset+c.end-c.start-EPSILON)||list.at(-1);
 return clip?{clip,source:Math.min(clip.end,clip.start+Math.max(0,t-clip.offset)),time:t}:null;
}
export function sourceToEdit(clips:Clip[],source:number,preferredId?:string) {
 const list=positioned(clips);
 const candidates=list.filter(c=>source>=c.start-EPSILON&&source<c.end-EPSILON);
 const clip=candidates.find(c=>c.id===preferredId)||candidates[0];
 return clip?{clip,time:clip.offset+source-clip.start}:null;
}
export function splitClip(clips:Clip[],id:string,sourceTime:number):Clip[] {
 return clips.flatMap(c=>c.id!==id||sourceTime<=c.start+EPSILON||sourceTime>=c.end-EPSILON?[c]:[
 {...c,end:sourceTime},{...c,id:uid(),start:sourceTime}]);
}
export function cutRange(clips:Clip[],range:TimeRange,mode:ViewMode):Clip[] {
 const a=Math.min(range.start,range.end), b=Math.max(range.start,range.end);
 if(b-a<EPSILON)return clips;
 return positioned(clips).flatMap(c=>{
  const lo=mode==='edit'?c.start+Math.max(0,a-c.offset):Math.max(c.start,a);
  const hi=mode==='edit'?c.start+Math.min(c.end-c.start,b-c.offset):Math.min(c.end,b);
  if(hi<=lo+EPSILON||lo>=c.end||hi<=c.start)return [clips[c.index]];
  const keep:Clip[]=[];
  if(lo>c.start+EPSILON)keep.push({...clips[c.index],end:lo});
  if(hi<c.end-EPSILON)keep.push({...clips[c.index],id:keep.length?uid():c.id,start:hi});
  return keep;
 });
}
export function isolateRange(clips:Clip[],range:TimeRange,mode:ViewMode):{clips:Clip[];ids:string[]} {
 const a=Math.min(range.start,range.end),b=Math.max(range.start,range.end);const ids:string[]=[];
 const result=positioned(clips).flatMap(c=>{
  const lo=Math.max(c.start,mode==='edit'?c.start+a-c.offset:a);
  const hi=Math.min(c.end,mode==='edit'?c.start+b-c.offset:b);
  if(hi<=lo+EPSILON)return [clips[c.index]];
  const parts:Clip[]=[];
  if(lo>c.start+EPSILON)parts.push({...clips[c.index],end:lo});
  const center={...clips[c.index],id:parts.length?uid():c.id,start:lo,end:hi};parts.push(center);ids.push(center.id);
  if(hi<c.end-EPSILON)parts.push({...clips[c.index],id:uid(),start:hi});
  return parts;
 });return {clips:result,ids};
}
export function extractEditRange(clips:Clip[],range:TimeRange):Clip[] {
 const a=Math.min(range.start,range.end),b=Math.max(range.start,range.end);
 if(b-a<EPSILON)return [];
 return positioned(clips).flatMap(c=>{
  const start=Math.max(0,a-c.offset),end=Math.min(c.end-c.start,b-c.offset);
  if(end-start<EPSILON)return [];
  return [{...clips[c.index],id:uid(),start:c.start+start,end:c.start+end}];
 });
}
export function moveClips(clips:Clip[],ids:string[],beforeId:string|null):Clip[] {
 const selected=new Set(ids);if(beforeId&&selected.has(beforeId))return clips;
 const moving=clips.filter(c=>selected.has(c.id));const rest=clips.filter(c=>!selected.has(c.id));
 const target=beforeId?rest.findIndex(c=>c.id===beforeId):rest.length;
 if(!moving.length||target<0)return clips;
 return [...rest.slice(0,target),...moving,...rest.slice(target)];
}
export function createProject(data:Recording):Project {
 return {version:1,source:data.source,duration:data.duration,revision:0,clips:data.initialClips,chapters:data.chapters,events:[],undo:[],redo:[],reels:[]};
}
export function createReel(title:string,clips:Clip[]):Reel {
 return {id:uid(),title,createdAt:new Date().toISOString(),clips,events:[],undo:[],redo:[]};
}
export function commit(project:Project,next:Snapshot,type:string,label:string,detail?:unknown):Project {
 return {...project,...next,undo:[...project.undo,{clips:project.clips,chapters:project.chapters}].slice(-75),redo:[],events:[...project.events,{id:uid(),at:new Date().toISOString(),type,label,detail}]};
}
export function commitReel(reel:Reel,next:ReelSnapshot,type:string,label:string,detail?:unknown):Reel {
 return {...reel,...next,undo:[...reel.undo,{clips:reel.clips}].slice(-75),redo:[],events:[...reel.events,{id:uid(),at:new Date().toISOString(),type,label,detail}]};
}
export function undoProject(p:Project,redo=false):Project {
 const stack=redo?p.redo:p.undo;const snapshot=stack.at(-1);if(!snapshot)return p;
 const current={clips:p.clips,chapters:p.chapters};
 return {...p,...snapshot,undo:redo?[...p.undo,current]:p.undo.slice(0,-1),redo:redo?p.redo.slice(0,-1):[...p.redo,current],events:[...p.events,{id:uid(),at:new Date().toISOString(),type:redo?'redo':'undo',label:redo?'Redo edit':'Undo edit'}]};
}
export function undoReel(reel:Reel,redo=false):Reel {
 const stack=redo?reel.redo:reel.undo;const snapshot=stack.at(-1);if(!snapshot)return reel;
 const current={clips:reel.clips};
 return {...reel,...snapshot,undo:redo?[...reel.undo,current]:reel.undo.slice(0,-1),redo:redo?reel.redo.slice(0,-1):[...reel.redo,current],events:[...reel.events,{id:uid(),at:new Date().toISOString(),type:redo?'redo':'undo',label:redo?'Redo reel edit':'Undo reel edit'}]};
}
export function validateProject(value:unknown,data:Recording):Project {
 if(!value||typeof value!=='object')throw Error('This is not an edit project.');
 const p=value as Project;
 if(p.version!==1||p.source!==data.source||!Number.isFinite(p.duration)||Math.abs(p.duration-data.duration)>.1)throw Error('This project belongs to a different recording.');
 const checkClips=(clips:Clip[])=>{
  if(!Array.isArray(clips)||clips.length>2000)throw Error('Invalid project contents.');
  const ids=new Set<string>();
  for(const c of clips){if(typeof c.id!=='string'||ids.has(c.id)||typeof c.label!=='string'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>data.duration+.001||c.end-c.start<EPSILON)throw Error('Invalid clip boundary.');ids.add(c.id)}
 };
 const checkEvents=(events:EditEvent[])=>{
  if(!Array.isArray(events)||events.length>100000)throw Error('Invalid edit history.');
  for(const e of events)if(typeof e.id!=='string'||typeof e.at!=='string'||typeof e.label!=='string'||typeof e.type!=='string')throw Error('Invalid history entry.');
 };
 const check=(snapshot:Snapshot)=>{
  if(!snapshot||!Array.isArray(snapshot.clips)||snapshot.clips.length>2000||!Array.isArray(snapshot.chapters)||snapshot.chapters.length!==data.chapters.length)throw Error('Invalid project contents.');
  checkClips(snapshot.clips);
  const chapters=new Set<string>();
  for(const c of snapshot.chapters){if(typeof c.title!=='string'||typeof c.question!=='string'||typeof c.note!=='string'||typeof c.evidence!=='string'||!Number.isInteger(c.number)||!['direct','covered','missing','manual'].includes(c.kind))throw Error('Invalid chapter details.');if(!data.chapters.some(d=>d.id===c.id)||chapters.has(c.id)||!(c.start===null||(Number.isFinite(c.start)&&c.start>=0&&c.start<data.duration)))throw Error('Invalid chapter marker.');chapters.add(c.id)}
 };
 check(p);
 if(!Array.isArray(p.events)||!Array.isArray(p.undo)||!Array.isArray(p.redo)||p.undo.length>75||p.redo.length>75)throw Error('Invalid edit history.');
 p.undo.forEach(check);p.redo.forEach(check);
 checkEvents(p.events);
 if(!Array.isArray(p.reels))p.reels=[];
 if(p.reels.length>500)throw Error('Invalid reels.');
 const reelIds=new Set<string>();
 for(const reel of p.reels){
  if(!reel||typeof reel.id!=='string'||reelIds.has(reel.id)||typeof reel.title!=='string'||!reel.title.trim()||typeof reel.createdAt!=='string'||!Array.isArray(reel.undo)||!Array.isArray(reel.redo)||reel.undo.length>75||reel.redo.length>75)throw Error('Invalid reel.');
  reelIds.add(reel.id);checkClips(reel.clips);checkEvents(reel.events);
  for(const state of [...reel.undo,...reel.redo])checkClips(state.clips);
 }
 return p;
}
