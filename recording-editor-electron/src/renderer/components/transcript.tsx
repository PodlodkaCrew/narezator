'use client';
/* eslint-disable jsx-a11y/prefer-tag-over-role -- Timed word spans require a rich contenteditable textbox, rather than a plain textarea. */
import {forwardRef,memo,useCallback,useEffect,useLayoutEffect,useImperativeHandle,useMemo,useRef} from 'react';
import {type Clip,type Recording,type TimeRange,type ViewMode,timecode,positioned} from '@/lib/editor-model';
export interface TranscriptHandle {follow:(time:number,force?:boolean)=>void;nextMatch:()=>void;clearSelection:()=>void}
interface Props {data:Recording;clips:Clip[];mode:ViewMode;query:string;follow:boolean;onFollowChange:(follow:boolean)=>void;onSeek:(t:number)=>void;onRange:(r:TimeRange|null)=>void;onSearchCount:(n:number)=>void}
interface Occurrence {key:string;id:number;text:string;start:number;end:number;speaker:number;section:number;clipId:string}
const Transcript= memo(forwardRef<TranscriptHandle,Props>(function Transcript({data,clips,mode,query,follow,onFollowChange,onSeek,onRange,onSearchCount},ref){
 const container=useRef<HTMLDivElement>(null),active=useRef<HTMLElement|null>(null),pointer=useRef(false),ignoreUntil=useRef(0),ignoreScrollUntil=useRef(0),userCaretUntil=useRef(0),lastTime=useRef(0),matchIndex=useRef(-1),followRef=useRef(follow);
 const onSeekRef=useRef(onSeek),onRangeRef=useRef(onRange),onFollowChangeRef=useRef(onFollowChange);useLayoutEffect(()=>{onSeekRef.current=onSeek;onRangeRef.current=onRange;onFollowChangeRef.current=onFollowChange;followRef.current=follow},[onSeek,onRange,onFollowChange,follow]);
 const model=useMemo(()=>{
  const source=mode==='source'?[{id:'source',start:0,end:data.duration,label:'Original recording'}]:clips;
  return positioned(source).map(clip=>({...clip,rows:[] as {key:string;speaker:number;start:number;words:Occurrence[]}[]})).map(clip=>{
   for(const w of data.words){
    if(w.end<=clip.start||w.start>=clip.end)continue;
    const word={...w,key:`${clip.id}-${w.id}`,start:clip.offset+Math.max(w.start,clip.start)-clip.start,end:clip.offset+Math.min(w.end,clip.end)-clip.start,clipId:clip.id};
    let row=clip.rows.at(-1);
    if(!row||row.words[0].section!==w.section||row.speaker!==w.speaker){row={key:word.key,speaker:w.speaker,start:w.start,words:[]};clip.rows.push(row)}
    row.words.push(word);
   }return clip;
  });
 },[data,clips,mode]);
 const words=useMemo(()=>model.flatMap(c=>c.rows.flatMap(r=>r.words)),[model]);
 const elements=useRef(new Map<string,HTMLElement>());
 useEffect(()=>{elements.current=new Map(Array.from(container.current?.querySelectorAll<HTMLElement>('[data-word]')||[]).map(el=>[el.dataset.word!,el]));active.current=null},[model]);
 const search=useMemo(()=>{
  if(!query.trim())return {keys:new Set<string>(),matches:[] as Occurrence[]};
  const normalized=query.trim().toLocaleLowerCase();let full='';const starts:number[]=[];
  words.forEach(w=>{starts.push(full.length);full+=w.text.toLocaleLowerCase()+' '});
  const keys=new Set<string>(),matches:Occurrence[]=[];let index=full.indexOf(normalized);
  while(index!==-1){
   let lo=0,hi=starts.length-1;
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(starts[mid]<=index)lo=mid;else hi=mid-1}
   if(words[lo])matches.push(words[lo]);
   for(let i=lo;i<words.length&&starts[i]<index+normalized.length;i++)keys.add(words[i].key);
   index=full.indexOf(normalized,index+Math.max(1,normalized.length));
  }
  return {keys,matches};
 },[query,words]);
 useEffect(()=>{matchIndex.current=-1;onSearchCount(search.matches.length)},[search,onSearchCount]);
 const stopFollowing=useCallback(()=>{
  if(!followRef.current)return;followRef.current=false;onFollowChangeRef.current(false);
 },[]);
 const scrollTo=useCallback((el:HTMLElement,force=false)=>{
  const box=container.current;if(!box||(!followRef.current&&!force))return;
  const rect=el.getBoundingClientRect(),bounds=box.getBoundingClientRect();
  if(force||rect.top<bounds.top+30||rect.bottom>bounds.bottom-35){ignoreScrollUntil.current=performance.now()+120;box.scrollTop+=rect.top-bounds.top-box.clientHeight*.35}
 },[]);
 useImperativeHandle(ref,()=>({
  follow(time,force=false){
   lastTime.current=time;if(pointer.current)return;
   let lo=0,hi=words.length-1;
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(words[mid].start<=time+.005)lo=mid;else hi=mid-1}
   const word=words[lo];if(!word)return;
   const el=elements.current.get(word.key);if(!el)return;
   const selection=window.getSelection();const selecting=selection&&!selection.isCollapsed&&container.current?.contains(selection.anchorNode);
   if(el===active.current&&!force)return;
   active.current?.classList.remove('current-word');el.classList.add('current-word');active.current=el;
   if(!selecting){scrollTo(el,force);if((followRef.current||force)&&performance.now()>userCaretUntil.current&&document.activeElement===container.current&&selection&&el.firstChild){ignoreUntil.current=performance.now()+80;selection.setPosition(el.firstChild,0)}}
  },
  nextMatch(){
   if(!search.matches.length)return;matchIndex.current=(matchIndex.current+1)%search.matches.length;const word=search.matches[matchIndex.current];
   const el=elements.current.get(word.key);if(el)scrollTo(el,true);onSeekRef.current(word.start);
  },
  clearSelection(){ignoreUntil.current=performance.now()+80;window.getSelection()?.removeAllRanges();onRangeRef.current(null)}
 }),[words,search,scrollTo]);
 useEffect(()=>{
  function elementFor(node:Node|null,offset=0):HTMLElement|null{
   if(!node)return null;
   let el=node instanceof HTMLElement?node:node.parentElement;
   if(el?.hasAttribute('data-word'))return el;
   if(node.nodeType===Node.ELEMENT_NODE){const child=node.childNodes[Math.min(offset,node.childNodes.length-1)];if(child)el=child instanceof HTMLElement?child:child.parentElement}
   return el?.closest<HTMLElement>('[data-word]')||el?.querySelector<HTMLElement>('[data-word]')||null;
  }
  function sync(shouldSeek=false){
   if(performance.now()<ignoreUntil.current)return;
   const sel=window.getSelection(),box=container.current;
   if(!sel||!box||!sel.rangeCount||!box.contains(sel.anchorNode)||!box.contains(sel.focusNode))return;
   const range=sel.getRangeAt(0),a=elementFor(range.startContainer,range.startOffset),b=elementFor(range.endContainer,range.endOffset);
   if(!a||!b)return;
   const start=Number(a.dataset.start),end=range.endOffset===0&&a!==b?Number(b.dataset.start):Number(b.dataset.end);
   if(sel.isCollapsed){userCaretUntil.current=performance.now()+160;onRangeRef.current(null);if(!pointer.current||shouldSeek)onSeekRef.current(start)}
   else {onRangeRef.current({start,end:Math.max(end,start+.001)});if(shouldSeek)onSeekRef.current(start)}
  }
  const selectionChange=()=>sync(false);
  const up=()=>{if(pointer.current){pointer.current=false;ignoreUntil.current=0;sync(true)}};
  document.addEventListener('selectionchange',selectionChange);document.addEventListener('pointerup',up);
  return()=>{document.removeEventListener('selectionchange',selectionChange);document.removeEventListener('pointerup',up)};
 },[]);
 return <div ref={container} className="transcript-scroll editable-transcript" contentEditable suppressContentEditableWarning tabIndex={0} role="textbox" aria-label="Synchronized transcript. Select text to cut; move the caret to seek." aria-multiline="true" aria-readonly="true" lang={data.language} spellCheck={false}
  onBeforeInput={e=>e.preventDefault()} onPaste={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()}
  onWheel={stopFollowing} onTouchMove={stopFollowing} onScroll={()=>{if(performance.now()>ignoreScrollUntil.current)stopFollowing()}}
  onPointerDown={()=>{pointer.current=true;ignoreUntil.current=0}}>
  {!words.length&&<div className="empty-state" contentEditable={false}>{!data.words.length?'No timed transcript in this project. Use video and in/out marks to edit.':'Your edit is empty. Switch to Source to restore a range, or undo the last cut.'}</div>}
  {model.map(clip=><div key={clip.id} className="transcript-clip">
   {mode==='edit'&&<div className="transcript-chapter" contentEditable={false}><span>{clip.label}</span><span>{timecode(clip.offset)}</span></div>}
   {clip.rows.map(row=><div key={row.key} className="transcript-row">
    <div className={`speaker-label speaker-${row.speaker}`} contentEditable={false}><span className="speaker-dot"/>SPEAKER {row.speaker}<span>{timecode(row.start)}</span></div>
    <p className="word-paragraph">{row.words.map(w=><span key={w.key} data-word={w.key} data-start={w.start} data-end={w.end} className={search.keys.has(w.key)?'search-word':''}>{w.text}{' '}</span>)}</p>
   </div>)}
  </div>)}
 </div>;
}));
export default Transcript;
