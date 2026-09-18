'use client';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowRight,Check,ChevronDown,ChevronLeft,ChevronRight,Clapperboard,Download,Film,GripVertical,History,ListVideo,Maximize,Pause,Play,Redo2,RotateCcw,Scissors,Search,Split,Undo2,Upload,Volume2,VolumeX,X,Captions,Keyboard,AlignLeft,LocateFixed} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import Transcript,{type TranscriptHandle} from '@/components/transcript';
import Waveform from '@/components/waveform';
import {useProject} from '@/lib/use-project';
import {atEditTime,buildCutReport,commit,commitReel,createReel,cutRange,duration,extractEditRange,isolateRange,moveClips,parseTimecode,positioned,removedRanges,sourceToEdit,splitClip,timecode,uid,undoProject,undoReel,validateProject,type Chapter,type Clip,type Recording,type Snapshot,type TimeRange,type ViewMode} from '@/lib/editor-model';
const EMPTY:Clip[]=[];
interface ExportJob {id:string;status:string;progress:number;message:string}
function download(name:string,text:string,type='application/json'){
 void type;void window.cutroom.saveText({suggestedName:name,text});
}
function TimeField({label,value,onChange}:{label:string;value:number;onChange:(n:number)=>void}){
 const [text,setText]=useState(timecode(value,true));const focus=useRef(false);
 useEffect(()=>{if(!focus.current)setText(timecode(value,true))},[value]);
 function apply(){focus.current=false;const result=parseTimecode(text);if(result===null){setText(timecode(value,true));return}onChange(result)}
 return <label className="time-field"><span>{label}</span><Input aria-label={label} value={text} onFocus={()=>{focus.current=true}} onChange={e=>setText(e.target.value)} onBlur={apply} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur()}if(e.key==='Escape'){setText(timecode(value,true));e.currentTarget.blur()}}}/></label>;
}
export default function Home(){
 const [data,setData]=useState<Recording|null>(null),[loadError,setLoadError]=useState('');
 const {project,update,status,error,flush,hasRecovery}=useProject(data);
 const [mode,setMode]=useState<ViewMode>('edit'),[clock,setClock]=useState(113.66),[sourceClock,setSourceClock]=useState(113.66),[playing,setPlaying]=useState(false);
 const [range,setRange]=useState<TimeRange|null>(null),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[searchCount,setSearchCount]=useState(0),[follow,setFollow]=useState(true);
 const [leftTab,setLeftTab]=useState<'chapters'|'history'>('chapters'),[pickedChapter,setPickedChapter]=useState<string|null>(null),[chapterQuery,setChapterQuery]=useState('');
 const [workspace,setWorkspace]=useState<'main'|'reels'>('main'),[activeReelId,setActiveReelId]=useState<string|null>(null);
 const [toast,setToast]=useState(''),[muted,setMuted]=useState(false),[speed,setSpeed]=useState('1'),[burned,setBurned]=useState(false),[peaks,setPeaks]=useState<number[]>([]);
 const [exportOpen,setExportOpen]=useState(false),[shortcutsOpen,setShortcutsOpen]=useState(false),[burnExport,setBurnExport]=useState(true),[exportHeight,setExportHeight]=useState('1080'),[job,setJob]=useState<ExportJob|null>(null),[exportError,setExportError]=useState('');
 const [dragIds,setDragIds]=useState<string[]>([]),[dropBefore,setDropBefore]=useState<string|null>(null);
 const video=useRef<HTMLVideoElement>(null),frame=useRef<HTMLDivElement>(null),transcript=useRef<TranscriptHandle>(null),importFile=useRef<HTMLInputElement>(null),clipRail=useRef<HTMLDivElement>(null);
 const projectRef=useRef(project),modeRef=useRef(mode),dataRef=useRef(data),workspaceRef=useRef(workspace),activeReelIdRef=useRef(activeReelId),activeClipsRef=useRef<Clip[]>(EMPTY),sourceTime=useRef(113.66),viewTime=useRef(113.66),activeClip=useRef<string|null>(null),forceFollow=useRef(false),mediaReady=useRef(false);
 const activeReel=workspace==='reels'?project?.reels.find(reel=>reel.id===activeReelId)||null:null;
 const clips=workspace==='reels'?(activeReel?.clips||EMPTY):(project?.clips||EMPTY),total=duration(clips),displayDuration=mode==='edit'?total:data?.duration||0;
 useLayoutEffect(()=>{projectRef.current=project;modeRef.current=mode;dataRef.current=data;workspaceRef.current=workspace;activeReelIdRef.current=activeReelId;activeClipsRef.current=clips},[project,mode,data,workspace,activeReelId,clips]);
 const clipPositions=useMemo(()=>positioned(clips),[clips]);
 const selectedClip=clips.find(c=>c.id===selected[0]);
 const liveChapter=[...(project?.chapters||[])].filter(c=>c.kind==='direct'||c.kind==='manual').sort((a,b)=>(a.start||0)-(b.start||0)).findLast(c=>c.start!==null&&c.start<=sourceClock);
 const chapter=workspace==='main'?(project?.chapters.find(c=>c.id===pickedChapter)||liveChapter):null;
 const activeId=mode==='edit'?atEditTime(clips,clock)?.clip.id:sourceToEdit(clips,sourceClock)?.clip.id;
 const notify=useCallback((text:string)=>setToast(text),[]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer)},[toast]);
 useEffect(()=>{
  window.cutroom.loadRecording().then((d:Recording)=>{d.words.sort((a,b)=>a.start-b.start||a.id-b.id);setData(d)}).catch(e=>setLoadError(e.message));
  window.cutroom.mediaInfo().then(d=>setBurned(d.burnedIn)).catch(()=>{});
  window.cutroom.loadWaveform().then(d=>setPeaks(d.peaks||[])).catch(()=>{});
  window.cutroom.listExports().then(d=>{if(d.jobs?.length)setJob(d.jobs.at(-1)||null)}).catch(()=>{});
 },[]);
 const jobId=job?.id,jobStatus=job?.status;
 useEffect(()=>{
  if(!jobId||!['queued','rendering'].includes(jobStatus||''))return;
  const interval=setInterval(()=>window.cutroom.getExport(jobId).then(setJob).catch(()=>setExportError('Cannot read export progress.')),1500);
  return()=>clearInterval(interval);
 },[jobId,jobStatus]);
 const pause=useCallback(()=>video.current?.pause(),[]);
 const seek=useCallback((time:number,force=true)=>{
  const p=projectRef.current,d=dataRef.current,v=video.current,list=activeClipsRef.current;if(!p||!d)return;
  let source:number,t:number;
  if(modeRef.current==='edit'){
   const found=atEditTime(list,time);if(!found)return;activeClip.current=found.clip.id;source=found.source;t=found.time;
  }else{source=Math.max(0,Math.min(time,d.duration));t=source;activeClip.current=sourceToEdit(list,source)?.clip.id||null}
  sourceTime.current=source;viewTime.current=t;setClock(t);setSourceClock(source);forceFollow.current=force;
  if(v&&Number.isFinite(v.duration))v.currentTime=Math.min(source,Math.max(0,v.duration-.001));
  if(force)transcript.current?.follow(t,true);
 },[]);
 const seekText=useCallback((time:number)=>seek(time,false),[seek]);
 const selectRange=useCallback((value:TimeRange|null)=>{if(value)pause();setRange(value)},[pause]);
 function switchMode(next:ViewMode){
  pause();transcript.current?.clearSelection();setRange(null);modeRef.current=next;setMode(next);
  if(next==='source')seek(sourceTime.current);else{const found=sourceToEdit(activeClipsRef.current,sourceTime.current,activeClip.current||undefined);seek(found?.time||0)}
  forceFollow.current=true;
 }
 function jumpSource(time:number){
  pause();transcript.current?.clearSelection();setRange(null);
  const found=sourceToEdit(activeClipsRef.current,time,activeClip.current||undefined);
  if(modeRef.current==='edit'&&found)seek(found.time);
  else{if(modeRef.current==='edit'){modeRef.current='source';setMode('source');notify('This moment is outside your cut. Showing the source recording.')}seek(time)}
 }
 function togglePlay(){
  const v=video.current;if(!v)return;
  if(!v.paused){v.pause();return}
  if(modeRef.current==='edit'&&!activeClipsRef.current.length)return;
  if(viewTime.current>=displayDuration-.03)seek(0);
  void v.play().catch(()=>notify('Press Play again once the video has loaded.'));
 }
 const advance=useCallback(()=>{
  const v=video.current,list=activeClipsRef.current;if(!v)return;
  const current=list.findIndex(c=>c.id===activeClip.current),next=list[current+1];
  if(next){activeClip.current=next.id;v.currentTime=next.start;sourceTime.current=next.start;viewTime.current=positioned(list)[current+1].offset;void v.play().catch(()=>{})}
  else{v.pause();viewTime.current=duration(list);setClock(viewTime.current)}
 },[]);
 useEffect(()=>{
  let raf=0,last=0;
  function tick(now:number){
   const v=video.current,p=projectRef.current,list=activeClipsRef.current;
   if(v&&p&&mediaReady.current&&Number.isFinite(v.currentTime)){
    let source=Math.min(v.currentTime,dataRef.current?.duration||Infinity);
    if(modeRef.current==='edit'){
     const positionedClips=positioned(list);let current=positionedClips.find(c=>c.id===activeClip.current);
     if(!current){const found=sourceToEdit(list,source);current=found?.clip;activeClip.current=current?.id||null}
     if(current&&!v.paused&&!v.seeking&&source>=current.end-.012){
      const next=positionedClips[current.index+1];
      if(next){activeClip.current=next.id;if(Math.abs(next.start-current.end)>.035){v.currentTime=next.start;source=next.start}current=next}
      else{v.pause();source=current.end;v.currentTime=Math.max(current.start,current.end-.001)}
     }
     if(current)viewTime.current=current.offset+Math.max(0,Math.min(current.end-current.start,source-current.start));
    }else viewTime.current=source;
    sourceTime.current=source;
    if(now-last>65||forceFollow.current){last=now;setClock(viewTime.current);setSourceClock(source);transcript.current?.follow(viewTime.current,forceFollow.current);forceFollow.current=false}
   }
   raf=requestAnimationFrame(tick);
  }
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[]);
 useEffect(()=>{forceFollow.current=true},[mode,clips]);
 useEffect(()=>{if(video.current)video.current.playbackRate=Number(speed)},[speed]);
 function saveEdit(next:Snapshot,type:string,label:string,detail?:unknown){
  const p=projectRef.current;if(!p)return;pause();let result;
  if(workspaceRef.current==='reels'){
   const reelId=activeReelIdRef.current,reel=p.reels.find(item=>item.id===reelId);if(!reel)return;
   const edited=commitReel(reel,{clips:next.clips},type,label,detail);result={...p,reels:p.reels.map(item=>item.id===edited.id?edited:item)};activeClipsRef.current=edited.clips;
  }else{result=commit(p,next,type,label,detail);activeClipsRef.current=result.clips}
  projectRef.current=result;activeClip.current=sourceToEdit(activeClipsRef.current,sourceTime.current,activeClip.current||undefined)?.clip.id||null;update(result);transcript.current?.clearSelection();setRange(null);return result;
 }
 function performCut(){
  const p=projectRef.current,list=activeClipsRef.current;if(!p||!range||Math.abs(range.end-range.start)<.001)return;
  const next=cutRange(list,range,modeRef.current);
  if(JSON.stringify(next)===JSON.stringify(list)){notify('That range is already outside your cut.');return}
  const before=duration(list),after=duration(next);
  saveEdit({clips:next,chapters:p.chapters},'cut',`Cut ${timecode(Math.min(range.start,range.end),true)} → ${timecode(Math.max(range.start,range.end),true)} (${modeRef.current==='edit'?'edit':'source'} time)`,{range,mode:modeRef.current,removedSeconds:before-after});
  setSelected([]);if(modeRef.current==='edit')seek(Math.min(range.start,range.end,after));notify(`Removed ${(before-after).toFixed(2)} seconds · undo anytime`);
 }
 function isolate(){
  const p=projectRef.current,list=activeClipsRef.current;if(!p||!range||Math.abs(range.end-range.start)<.001)return;
  const result=isolateRange(list,range,modeRef.current);
  if(!result.ids.length){notify('This range is outside your cut. Append it from Source first.');return}
  saveEdit({clips:result.clips,chapters:p.chapters},'isolate',`Isolate ${timecode(Math.min(range.start,range.end),true)} → ${timecode(Math.max(range.start,range.end),true)} for rearranging`,{range,mode:modeRef.current});
  setSelected(result.ids);notify('Selection is now a separate clip. Drag it in the assembly.');
 }
 function appendSource(){
  const p=projectRef.current;if(!p||!range)return;
  const clip={id:uid(),start:Math.min(range.start,range.end),end:Math.max(range.start,range.end),label:liveChapter?.title||'Selected source range'};
  if(clip.end-clip.start<.001)return;
  saveEdit({clips:[...activeClipsRef.current,clip],chapters:p.chapters},'append',`Append source ${timecode(clip.start,true)} → ${timecode(clip.end,true)}`,clip);setSelected([clip.id]);notify(`Selection appended to your ${workspaceRef.current==='reels'?'reel':'cut'}.`);
 }
 function split(){
  const p=projectRef.current,list=activeClipsRef.current;if(!p)return;
  const current=modeRef.current==='edit'?atEditTime(list,viewTime.current)?.clip:sourceToEdit(list,sourceTime.current)?.clip;
  if(!current)return;
  const next=splitClip(list,current.id,sourceTime.current);if(next.length===list.length){notify('The playhead is already at a clip boundary.');return}
  saveEdit({clips:next,chapters:p.chapters},'split',`Split at source ${timecode(sourceTime.current,true)}`,{sourceTime:sourceTime.current});setSelected([current.id]);
 }
 function reorder(ids:string[],before:string|null){
  const p=projectRef.current,list=activeClipsRef.current;if(!p)return;const next=moveClips(list,ids,before);if(next.every((c,i)=>c.id===list[i]?.id))return;
  saveEdit({clips:next,chapters:p.chapters},'move',`Move ${ids.length} clip${ids.length===1?'':'s'} ${before?'before '+(list.find(c=>c.id===before)?.label||'clip'):'to the end'}`,{ids,before});
  setSelected(ids);const first=positioned(next).find(c=>c.id===ids[0]);if(first){modeRef.current='edit';setMode('edit');seek(first.offset)}
 }
 function nudge(direction:number){
  if(!selected.length)return;
  const indices=clips.map((c,i)=>selected.includes(c.id)?i:-1).filter(i=>i>=0);
  const target=direction<0?Math.min(...indices)-1:Math.max(...indices)+2;
  if(target<0||target>clips.length)return;reorder(selected,clips[target]?.id||null);
 }
 function removeSelected(){
  const p=projectRef.current;if(!p||!selected.length)return;
  const list=activeClipsRef.current,next=list.filter(c=>!selected.includes(c.id));saveEdit({clips:next,chapters:p.chapters},'remove',`Remove ${list.length-next.length} selected clip(s)`,{clips:list.filter(c=>selected.includes(c.id))});setSelected([]);if(modeRef.current==='edit')seek(Math.min(viewTime.current,duration(next)));
 }
 function undo(redo=false){
  const p=projectRef.current;if(!p)return;pause();let next=p,nextClips=p.clips;
  if(workspaceRef.current==='reels'){
   const reel=p.reels.find(item=>item.id===activeReelIdRef.current);if(!reel)return;const edited=undoReel(reel,redo);if(edited===reel)return;next={...p,reels:p.reels.map(item=>item.id===edited.id?edited:item)};nextClips=edited.clips;
  }else{next=undoProject(p,redo);if(next===p)return;nextClips=next.clips}
  projectRef.current=next;activeClipsRef.current=nextClips;update(next);transcript.current?.clearSelection();setRange(null);setSelected([]);
  if(modeRef.current==='edit'){const found=sourceToEdit(nextClips,sourceTime.current);seek(found?.time||Math.min(viewTime.current,duration(nextClips)))}notify(redo?'Edit redone':'Edit undone');
 }
 function mark(which:'in'|'out'){
  pause();const time=viewTime.current;
  setRange(r=>which==='in'?{start:time,end:r?.end??time}:{start:r?.start??time,end:time});
 }
 const handlers=useRef({togglePlay,performCut,split,undo,mark,nudge,removeSelected});useLayoutEffect(()=>{handlers.current={togglePlay,performCut,split,undo,mark,nudge,removeSelected}});
 useEffect(()=>{
  const keyboard=(e:KeyboardEvent)=>{
   const el=e.target as HTMLElement;if(el.closest('[role="dialog"]'))return;
   if(el.matches('input,textarea,select'))return;
   if(el.closest('button,a')&&(e.key===' '||e.key==='Enter'))return;
   const cmd=e.metaKey||e.ctrlKey;
   if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();handlers.current.undo(e.shiftKey);return}
   if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();handlers.current.undo(true);return}
   if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();handlers.current.nudge(e.key==='ArrowLeft'?-1:1);return}
   if(cmd||e.altKey)return;
   if(e.key===' '){e.preventDefault();handlers.current.togglePlay()}
   if(e.key.toLowerCase()==='i'){e.preventDefault();handlers.current.mark('in')}
   if(e.key.toLowerCase()==='o'){e.preventDefault();handlers.current.mark('out')}
   if(e.key.toLowerCase()==='s'){e.preventDefault();handlers.current.split()}
   if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();handlers.current.performCut()}
   if(e.key==='Escape'){setRange(null);transcript.current?.clearSelection()}
   if(!el.isContentEditable&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();seek(viewTime.current+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?5:1/30))}
  };
  window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);
 },[seek]);
 function chapterClick(c:Chapter){setPickedChapter(c.id);if(c.start!==null)jumpSource(c.start)}
 function adjustChapter(){
  if(!project||!chapter||!data)return;
  const markerTime=Math.min(sourceTime.current,data.duration-1/30);
  const next=project.chapters.map(c=>c.id===chapter.id?{...c,start:markerTime,kind:'manual' as const,note:'Chapter start adjusted in the editor.'}:c);
  saveEdit({clips,chapters:next},'chapter',`Set chapter ${chapter.number} to source ${timecode(sourceTime.current,true)}`,{chapterId:chapter.id,sourceTime:sourceTime.current});notify('Chapter marker updated.');
 }
 function selectClip(c:Clip,multi=false){
  if(multi){setSelected(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id]);return}
  pause();transcript.current?.clearSelection();setSelected([c.id]);modeRef.current='edit';setMode('edit');seek(positioned(clips).find(x=>x.id===c.id)?.offset||0);
 }
 function priorCuts(){
  if(!data||!project||workspace!=='main')return;let next=clips;for(const cut of data.priorCuts)next=cutRange(next,cut,'source');
  saveEdit({clips:next,chapters:project.chapters},'prior-cuts','Apply the two earlier transcript cuts',data.priorCuts);seek(0);notify('Earlier transcript cuts applied.');
 }
 function openTimeline(nextWorkspace:'main'|'reels',reelId?:string){
  const p=projectRef.current;if(!p)return;pause();transcript.current?.clearSelection();setRange(null);setSelected([]);setLeftTab('chapters');
  const id=nextWorkspace==='reels'?(reelId||activeReelIdRef.current||p.reels[0]?.id||null):null;
  const list=nextWorkspace==='reels'?(p.reels.find(reel=>reel.id===id)?.clips||EMPTY):p.clips;
  workspaceRef.current=nextWorkspace;activeReelIdRef.current=id;activeClipsRef.current=list;setWorkspace(nextWorkspace);setActiveReelId(id);modeRef.current='edit';setMode('edit');activeClip.current=list[0]?.id||null;
  if(list.length)seek(0);else{sourceTime.current=0;viewTime.current=0;setSourceClock(0);setClock(0)}
 }
 function makeReel(){
  const p=projectRef.current;if(!p||!range||Math.abs(range.end-range.start)<.001)return;
  const start=Math.min(range.start,range.end),end=Math.max(range.start,range.end);
  const reelClips=modeRef.current==='edit'?extractEditRange(activeClipsRef.current,{start,end}):[{id:uid(),start,end,label:liveChapter?.title||'Selected source range'}];
  if(!reelClips.length){notify('That selection does not contain any video.');return}
  const reel=createReel(`Reel ${String(p.reels.length+1).padStart(2,'0')} · ${timecode(reelClips[0].start)}`,reelClips);
  reel.events.push({id:uid(),at:new Date().toISOString(),type:'create',label:`Created reel from ${timecode(start,true)} → ${timecode(end,true)} (${modeRef.current} time)`,detail:{range:{start,end},mode:modeRef.current}});
  const next={...p,reels:[...p.reels,reel]};projectRef.current=next;activeClipsRef.current=reel.clips;update(next);openTimeline('reels',reel.id);notify(`Created ${reel.title}. The main cut was not changed.`);
 }
 function renameReel(title:string){
  const p=projectRef.current,reelId=activeReelIdRef.current;if(!p||!reelId||!title.trim())return;
  const next={...p,reels:p.reels.map(reel=>reel.id===reelId?{...reel,title:title.trim(),events:[...reel.events,{id:uid(),at:new Date().toISOString(),type:'rename',label:`Rename reel to “${title.trim()}”`}]}:reel)};projectRef.current=next;update(next);
 }
 function saveReport(){
  if(!project||!data)return;
  const title=activeReel?.title||data.title,filename=activeReel?'reel-cut-report.md':'skills-interview-cut-report.md';
  const cuts=removedRanges(clips,data.duration);
  download(filename,buildCutReport(title,project.source,clips,data.duration,data.words),'text/markdown;charset=utf-8');
  notify(`Saved a Markdown report with ${cuts.length} cut${cuts.length===1?'':'s'}.`);
 }
 async function startExport(){
  if(!project)return;setExportError('');
  const exportProject={...project,clips};
  try{const result=await window.cutroom.startExport({project:exportProject,burn:burnExport,height:Number(exportHeight),title:activeReel?.title||data?.title||'Cutroom export',kind:activeReel?'reel':'main'});setJob(result)}catch(e){setExportError((e as Error).message)}
 }
 if(loadError||(!project&&error))return <div className="startup"><Scissors/><h1>Choose your Cutroom workspace</h1><p>{loadError||error}</p><Button onClick={()=>void window.cutroom.chooseWorkspace()}>Choose video and import edits</Button><Button variant="outline" onClick={()=>location.reload()}>Try again</Button></div>;
 if(!data||!project)return <div className="startup"><Scissors/><h1>Opening your recording</h1><p>Loading the transcript and your saved edits…</p></div>;
 const rangeLength=range?Math.abs(range.end-range.start):0;
 const busy=job&&['queued','rendering'].includes(job.status);
 const undoCount=workspace==='reels'?(activeReel?.undo.length||0):project.undo.length,redoCount=workspace==='reels'?(activeReel?.redo.length||0):project.redo.length;
 return <main className="editor">
  <header className="app-header"><div className="brand"><span className="brand-icon"><Scissors size={19}/></span>cutroom<span className="brand-divider"/><span className="project-name">Skills <span className="muted">/</span> interview</span></div>
   <nav className="workspace-tabs" aria-label="Edit workspace"><button className={workspace==='main'?'active':''} onClick={()=>openTimeline('main')}><Film size={15}/>Main cut</button><button className={workspace==='reels'?'active':''} onClick={()=>openTimeline('reels')}><Clapperboard size={15}/>Reels <span>{project.reels.length}</span></button></nav>
   <div className="header-actions"><button className={'local-status '+(error?'status-error':'')} onClick={()=>void flush()} title={error||'Edits are saved in edits/recording.edits.json'}>{status}</button><div className="undo-controls"><Button variant="ghost" size="icon" aria-label="Undo edit" title="Undo · ⌘Z" disabled={!undoCount} onClick={()=>undo()}><Undo2/></Button><Button variant="ghost" size="icon" aria-label="Redo edit" title="Redo · ⇧⌘Z" disabled={!redoCount} onClick={()=>undo(true)}><Redo2/></Button></div><Button variant="outline" onClick={()=>setShortcutsOpen(true)} size="icon" aria-label="Keyboard shortcuts"><Keyboard/></Button><Button onClick={()=>setExportOpen(true)}><ArrowDownToLine/>{busy?'Exporting…':activeReel?'Export reel':'Export'}</Button></div>
  </header>
  {error&&<div className="error-banner">{error} {hasRecovery&&<button onClick={()=>download('cutroom-recovery.json',localStorage.getItem('cutroom-video.mp4-draft-v1')||'')}>Download recovery</button>}</div>}
  <div className="workspace">
   <aside className="chapter-panel"><div className="left-tabs"><button className={leftTab==='chapters'?'active':''} onClick={()=>setLeftTab('chapters')}>{workspace==='main'?<ListVideo size={15}/>:<Clapperboard size={15}/>} {workspace==='main'?'Chapters':'Reels'} <span>{workspace==='main'?project.chapters.length:project.reels.length}</span></button><button className={leftTab==='history'?'active':''} onClick={()=>setLeftTab('history')}><History size={14}/>Edits <span>{workspace==='main'?project.events.length:(activeReel?.events.length||0)}</span></button></div>
   {workspace==='main'?(leftTab==='chapters'?<><div className="chapter-search"><Search size={13}/><Input placeholder="Find a question…" aria-label="Find a chapter" value={chapterQuery} onChange={e=>setChapterQuery(e.target.value)}/></div><div className="chapter-list">{[...project.chapters].sort((a,b)=>(a.start??Infinity)-(b.start??Infinity)).filter(c=>`${c.title} ${c.question}`.toLocaleLowerCase().includes(chapterQuery.toLocaleLowerCase())).map(c=><button className={`chapter-item ${chapter?.id===c.id?'active':''} ${c.kind==='missing'?'missing':''}`} key={c.id} onClick={()=>chapterClick(c)} title={c.question}><span className="chapter-number">{String(c.number).padStart(2,'0')}</span><span><b>{c.title}</b><small>{c.start===null?'Not found in recording':timecode(c.start)} {c.kind==='covered'&&<i>in answer</i>}</small></span>{c.id===liveChapter?.id&&<span className="now-dot"/>}</button>)}</div><div className="chapter-footnote"><span className="tiny-dot"/>In recording order <span>·</span> Original question numbers</div></>:<><div className="history-tools"><Button variant="outline" size="sm" onClick={saveReport}><Download/>Save report</Button><Button variant="ghost" size="sm" onClick={()=>importFile.current?.click()}><Upload/>Import project</Button></div><div className="history-list">{!project.events.length&&<div className="history-empty"><History size={25}/><h3>A fresh cut.</h3><p>Every cut, move, and chapter adjustment will appear here.</p><Button variant="outline" onClick={priorCuts}>Apply 2 earlier transcript cuts</Button><small>Remove the opening chat and the Anthropic/Google aside.</small></div>}{[...project.events].reverse().map(e=><div className="history-event" key={e.id}><span className="event-type">{e.type}</span><p>{e.label}</p><time>{new Date(e.at).toLocaleTimeString()}</time></div>)}</div><div className="chapter-footnote">Saved in edits/recording.edits.json</div></>):leftTab==='chapters'?<><div className="reel-list">{!project.reels.length&&<div className="reels-empty"><Clapperboard size={28}/><h3>No reels yet</h3><p>Select part of the main cut or source, then choose Create reel.</p><Button variant="outline" size="sm" onClick={()=>openTimeline('main')}>Go to main cut</Button></div>}{project.reels.map((reel,index)=><button key={reel.id} className={`reel-item ${reel.id===activeReelId?'active':''}`} onClick={()=>openTimeline('reels',reel.id)}><span>{String(index+1).padStart(2,'0')}</span><b>{reel.title}</b><small>{timecode(duration(reel.clips))} · {reel.clips.length} clips</small></button>)}</div>{activeReel&&<div className="reel-name"><label>Reel name<input key={activeReel.id} defaultValue={activeReel.title} onBlur={e=>renameReel(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></label></div>}<div className="chapter-footnote">Reels have independent edits</div></>:<><div className="history-tools"><Button variant="outline" size="sm" onClick={saveReport} disabled={!activeReel}><Download/>Save report</Button></div><div className="history-list">{activeReel&&!activeReel.events.length&&<div className="history-empty"><History size={25}/><h3>A fresh reel.</h3><p>Its cuts and moves will appear here.</p></div>}{[...(activeReel?.events||[])].reverse().map(e=><div className="history-event" key={e.id}><span className="event-type">{e.type}</span><p>{e.label}</p><time>{new Date(e.at).toLocaleTimeString()}</time></div>)}</div><div className="chapter-footnote">Main cut remains independent</div></>}
   </aside>
   <section className="viewer-panel"><div className="panel-heading">{activeReel?<Clapperboard size={15}/>:<Film size={15}/>}<strong>{activeReel?activeReel.title:'Viewer'}</strong><div className="mode-switch"><button className={mode==='edit'?'active':''} onClick={()=>switchMode('edit')}>{activeReel?'This reel':'Your cut'}</button><button className={mode==='source'?'active':''} onClick={()=>switchMode('source')}>Source</button></div></div>
    <div ref={frame} className="video-frame"><video ref={video} src={window.cutroom.mediaUrl} preload="auto" playsInline muted={muted} onLoadedMetadata={()=>{mediaReady.current=true;seek(viewTime.current)}} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{if(modeRef.current==='edit')advance()}} onError={()=>notify('The video could not load. Choose the original video again.')} onClick={togglePlay}><track kind="captions" src={window.cutroom.captionsUrl} srcLang="ru" label="Русский"/></video>
     {!burned&&<span className="source-time">SOURCE {timecode(sourceClock,true)}</span>}
     {!clips.length&&mode==='edit'&&<div className="video-empty">{workspace==='reels'?'Choose or create a reel.':'Your cut is empty.'}<br/><small>{workspace==='reels'?'Use the Reels list or select a range in Source.':'Undo an edit or append a selection from Source.'}</small></div>}
     <span className="viewer-mode">{mode==='edit'?(activeReel?'REEL PREVIEW':'EDIT PREVIEW'):'ORIGINAL RECORDING'}</span>
    </div>
    <div className="transport"><div className="transport-buttons"><Button variant="ghost" size="icon-sm" aria-label="Back five seconds" title="Back 5 seconds" onClick={()=>seek(clock-5)}><RotateCcw/></Button><Button className="play-button" size="icon" aria-label={playing?'Pause':'Play'} onClick={togglePlay} disabled={mode==='edit'&&!clips.length}>{playing?<Pause/>:<Play fill="currentColor"/>}</Button><Button variant="ghost" size="icon-sm" aria-label="Forward five seconds" title="Forward 5 seconds" onClick={()=>seek(clock+5)}><RotateCcw className="flip-icon"/></Button></div><div className="transport-time"><b>{timecode(clock,true)}</b><span>/ {timecode(displayDuration)}</span></div><div className="transport-end"><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(e.target.value)}>{['0.5','0.75','1','1.25','1.5','1.75','2'].map(s=><option key={s} value={s}>{s}×</option>)}</select><Button variant="ghost" size="icon-sm" aria-label={muted?'Unmute':'Mute'} onClick={()=>setMuted(!muted)}>{muted?<VolumeX/>:<Volume2/>}</Button><Button variant="ghost" size="icon-sm" aria-label="Fullscreen video" onClick={()=>void frame.current?.requestFullscreen()}><Maximize/></Button></div></div>
    <Waveform peaks={peaks} clips={clips} mode={mode} sourceDuration={data.duration} time={clock} range={range} onSeek={seek} onRange={selectRange}/>
    <div className="selection-panel"><div className="selection-heading"><span><Scissors size={13}/> {range?'Selected range':'Make a selection'}</span><span>{range?`${rangeLength.toFixed(2)}s · ${mode==='edit'?'edit':'source'} time`:'Select words or mark in / out'}</span>{range&&<button aria-label="Clear selection" onClick={()=>{setRange(null);transcript.current?.clearSelection()}}><X size={13}/></button>}</div>
     <div className="selection-fields"><TimeField label="In" value={range?.start??clock} onChange={n=>setRange(r=>({start:Math.min(n,displayDuration),end:r?.end??viewTime.current}))}/><Button variant="ghost" size="icon-sm" title="Mark in · I" aria-label="Mark in point" onClick={()=>mark('in')}><LocateFixed/></Button><span className="range-dash">—</span><TimeField label="Out" value={range?.end??clock} onChange={n=>setRange(r=>({start:r?.start??viewTime.current,end:Math.min(n,displayDuration)}))}/><Button variant="ghost" size="icon-sm" title="Mark out · O" aria-label="Mark out point" onClick={()=>mark('out')}><LocateFixed/></Button></div>
     <div className="selection-actions"><Button variant="destructive" disabled={rangeLength<.001||workspace==='reels'&&!activeReel} onMouseDown={e=>e.preventDefault()} onClick={performCut}><Scissors/>Cut selection <kbd>⌫</kbd></Button><Button variant="outline" disabled={rangeLength<.001||workspace==='reels'&&!activeReel} onMouseDown={e=>e.preventDefault()} onClick={isolate}><Split/>Make clip</Button><Button className="create-reel" disabled={rangeLength<.001} onMouseDown={e=>e.preventDefault()} onClick={makeReel}><Clapperboard/>Create reel</Button>{mode==='source'&&activeReel&&<Button variant="ghost" disabled={rangeLength<.001} onClick={appendSource}>Append to reel</Button>}{mode==='source'&&workspace==='main'&&<Button variant="ghost" disabled={rangeLength<.001} onClick={appendSource}>Append to cut</Button>}<div className="frame-controls"><Button variant="ghost" size="icon-xs" aria-label="Previous frame" title="Previous frame" onClick={()=>seek(clock-1/30)}><ChevronLeft/></Button><span>1 frame</span><Button variant="ghost" size="icon-xs" aria-label="Next frame" title="Next frame" onClick={()=>seek(clock+1/30)}><ChevronRight/></Button></div></div>
    </div>
    {chapter&&<div className="chapter-detail"><div className="chapter-detail-heading"><span className="eyebrow">QUESTION {String(chapter.number).padStart(2,'0')}</span><button title="Adjust this chapter marker to the current source time" onClick={adjustChapter}>Set start here</button></div><p lang="ru">{chapter.question}</p>{chapter.note&&<small>{chapter.note}</small>}</div>}
    <div className="viewer-bottom"><span className="tiny-dot"/>{burned?'Source timestamp burned into review video':'Source timestamp overlay'}<span>1920 × 1080 · 30 fps source</span></div>
   </section>
   <section className="transcript-panel"><div className="panel-heading"><Captions size={17}/><strong>Transcript</strong><span className="language-tag">RU</span><button className={'follow-button '+(follow?'active':'')} onClick={()=>{setFollow(!follow);if(!follow)transcript.current?.follow(clock,true)}}><LocateFixed size={12}/>Follow</button></div><div className="transcript-search"><Search size={14}/><Input aria-label="Search transcript" placeholder="Find in the conversation…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')transcript.current?.nextMatch()}}/>{query&&<><span>{searchCount}</span><Button variant="ghost" size="icon-xs" aria-label="Next search result" onClick={()=>transcript.current?.nextMatch()}><ChevronDown/></Button><button aria-label="Clear transcript search" onClick={()=>setQuery('')}><X size={12}/></button></>}</div><div className="transcript-hint">Click to seek <span>·</span> Select to cut <span>·</span> Manual scroll pauses Follow</div>
    <Transcript ref={transcript} data={data} clips={clips} mode={mode} query={query} follow={follow} onFollowChange={setFollow} onSeek={seekText} onRange={selectRange} onBegin={pause} onSearchCount={setSearchCount}/>
   </section>
  </div>
  <footer className="timeline"><div className="assembly-toolbar"><div className="assembly-title">{activeReel?<Clapperboard size={15}/>:<AlignLeft size={15}/>}<strong>{activeReel?'Reel assembly':'Assembly'}</strong><span>{clips.length} clips</span><span className="duration-chip">{timecode(total)} <small>{Math.max(0,data.duration-total).toFixed(1)}s outside</small></span></div><div className="assembly-actions">{selected.length>0&&<><span>{selected.length} selected</span><Button variant="ghost" size="icon-sm" aria-label="Move selected clips earlier" title="Move earlier · ⌥←" onClick={()=>nudge(-1)}><ArrowLeft/></Button><Button variant="ghost" size="icon-sm" aria-label="Move selected clips later" title="Move later · ⌥→" onClick={()=>nudge(1)}><ArrowRight/></Button><Button variant="ghost" size="sm" onClick={removeSelected}>Remove</Button></>}<Button variant="outline" size="sm" onClick={split} disabled={!clips.length}><Split/>Split at playhead <kbd>S</kbd></Button></div></div>
   <div className="clip-rail" ref={clipRail}>{clipPositions.map((c,i)=><div key={c.id} className={`clip-card ${selected.includes(c.id)?'selected':''} ${activeId===c.id?'playing-clip':''} ${dropBefore===c.id?'drop-before':''}`} draggable onDragStart={e=>{const ids=selected.includes(c.id)?selected:[c.id];setDragIds(ids);setSelected(ids);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',JSON.stringify(ids))}} onDragEnd={()=>{setDragIds([]);setDropBefore(null)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';setDropBefore(c.id)}} onDrop={e=>{e.preventDefault();reorder(dragIds,c.id);setDragIds([]);setDropBefore(null)}} style={{width:Math.max(145,Math.min(250,(c.end-c.start)*.36))}}>
    <button className="clip-hit" onClick={e=>selectClip(c,e.metaKey||e.ctrlKey||e.shiftKey)} aria-label={`Select clip ${i+1}: ${c.label}`}><div className="clip-top"><GripVertical size={12}/><span>{String(i+1).padStart(2,'0')}</span><time>{timecode(c.end-c.start)}</time></div><strong>{c.label}</strong><div className="clip-mini-wave" aria-hidden="true">{Array.from({length:32},(_,j)=>{const source=c.start+(c.end-c.start)*j/32;return <span key={j} style={{height:Math.max(2,(peaks[Math.floor(source/2)]||.08)*13)}}/>})}</div><div className="clip-range">{timecode(c.start)} <span>→</span> {timecode(c.end)}</div></button>
    {activeId===c.id&&<div className="clip-playhead" style={{left:Math.max(0,Math.min(100,(sourceClock-c.start)/(c.end-c.start)*100))+'%'}}/>}
   </div>)}<div className={'rail-drop-end '+(dropBefore==='end'?'drop-active':'')} onDragOver={e=>{e.preventDefault();setDropBefore('end')}} onDrop={e=>{e.preventDefault();reorder(dragIds,null);setDragIds([]);setDropBefore(null)}}>{dragIds.length?'Drop at end':<><GripVertical size={18}/><span>Drag clips<br/>to reorder</span></>}</div></div>
   <div className="assembly-bottom">{selectedClip?<label className="clip-rename"><span>Clip name</span><input aria-label="Selected clip name" key={selectedClip.id} defaultValue={selectedClip.label} onBlur={e=>{const label=e.target.value.trim();if(label&&label!==selectedClip.label)saveEdit({clips:clips.map(c=>c.id===selectedClip.id?{...c,label}:c),chapters:project.chapters},'rename',`Rename clip to “${label}”`)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></label>:<span>Split or select text → Make clip → drag into place</span>}<div className="assembly-tail">{selected.length>0&&<select aria-label="Move selected clips before" value="" onChange={e=>{if(e.target.value)reorder(selected,e.target.value==="__end"?null:e.target.value)}}><option value="">Move before…</option>{clips.filter(c=>!selected.includes(c.id)).map(c=><option value={c.id} key={c.id}>{c.label}</option>)}<option value="__end">End of the edit</option></select>}<span>⌘ / Shift click for multiple <span>·</span> Changes are reversible</span></div></div>
  </footer>
  {toast&&<output className="toast" aria-live="polite"><Check size={14}/>{toast}</output>}
  <input type="file" accept="application/json,.json" ref={importFile} hidden onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text());const imported=validateProject(raw.project||raw,data);projectRef.current=imported;activeClipsRef.current=imported.clips;update(imported);openTimeline('main');seek(0);notify(`Imported ${file.name}, including all reels and edit history.`)}catch(err){notify((err as Error).message)}e.target.value=''}}/>
  <Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent className="export-dialog"><DialogHeader><DialogTitle>{activeReel?'Export reel':'Export your cut'}</DialogTitle><DialogDescription>{activeReel&&<>{activeReel.title} · </>}{clips.length} clips · {timecode(total)} · rendered from the original video</DialogDescription></DialogHeader><div className="export-summary">{activeReel?<Clapperboard size={25}/>:<Film size={25}/>}<div><strong>{activeReel?'Edited reel':'Edited video'} · MP4</strong><p>Includes the edited transcript and source-based edit plan.</p></div></div><label className="export-option"><span>Resolution</span><select value={exportHeight} onChange={e=>setExportHeight(e.target.value)} disabled={!!busy}><option value="1080">1080p · original resolution</option><option value="720">720p · smaller file</option></select></label><label className="export-check"><input type="checkbox" checked={burnExport} onChange={e=>setBurnExport(e.target.checked)} disabled={!!busy}/><span>Burn original source timestamps into the video<small>Uncheck for a clean final video.</small></span></label><p className="export-note">Each export includes the Markdown cut report, exact edit list, transcript, captions, and metadata.</p>{exportError&&<p role="alert" className="inline-error">{exportError}</p>}{job&&<div className="export-progress"><div><strong>{job.message}</strong><span>{Math.round(job.progress*100)}%</span></div><progress value={job.progress} max="1"/>{busy&&<Button variant="ghost" size="sm" onClick={()=>void window.cutroom.cancelExport(job.id)}>Cancel export</Button>}{job.status==='done'&&<div className="export-downloads"><button onClick={()=>void window.cutroom.saveExportFile(job.id,'edited-video.mp4')}><Download size={14}/>{activeReel?'Reel':'Video'}</button><button onClick={()=>void window.cutroom.saveExportFile(job.id,'cut-report.md')}>Cut report</button><button onClick={()=>void window.cutroom.saveExportFile(job.id,'transcript.txt')}>Transcript</button><button onClick={()=>void window.cutroom.saveExportFile(job.id,'subtitles.srt')}>Captions</button><button onClick={()=>void window.cutroom.saveExportFile(job.id,'edit-list.json')}>Edit list</button><button onClick={()=>void window.cutroom.revealExport(job.id)}>Show folder</button></div>}</div>}<div className="dialog-actions"><Button variant="outline" onClick={saveReport}><Download/>Save report</Button><Button disabled={!!busy||!clips.length} onClick={startExport}><ArrowDownToLine/>{busy?'Rendering…':activeReel?'Render reel':'Render video'}</Button></div></DialogContent></Dialog>
  <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}><DialogContent className="shortcuts-dialog"><DialogHeader><DialogTitle>A few useful shortcuts</DialogTitle><DialogDescription>Select transcript text, or use the waveform and in/out marks.</DialogDescription></DialogHeader><div className="shortcut-list">{[['Space','Play / pause'],['I / O','Mark in / out'],['Delete','Cut selected time range'],['S','Split at playhead'],['← / →','Step one frame (outside text)'],['Shift ← / →','Skip five seconds'],['⌘ Z / ⇧ ⌘ Z','Undo / redo'],['⌥ ← / →','Move selected clips'],['Esc','Clear time selection']].map(([key,text])=><div key={key}><span>{text}</span><kbd>{key}</kbd></div>)}</div><p className="export-note">Make clip separates a text or waveform selection so you can move it. Source mode lets you revisit removed material and append it to your cut.</p></DialogContent></Dialog>
 </main>;
}
