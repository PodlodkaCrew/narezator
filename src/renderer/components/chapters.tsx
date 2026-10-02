import {useEffect,useRef,useState} from 'react';
import {ChevronDown,FileText,LoaderCircle} from 'lucide-react';
import {Button} from './ui/button';
import {TranscriptionSetup} from './transcription';
import {chapterRange,currentSummary} from '../lib/chapter-summary';
import {timecode,type Chapter,type ChapterSummary,type Recording,type TimeRange} from '../lib/editor-model';

function Summary({chapter,range,data,onGenerate}:{chapter:Chapter;range:TimeRange|null;data:Recording;onGenerate:(chapter:Chapter)=>Promise<ChapterSummary>}){
 const summary=currentSummary(chapter,range),hasTranscript=!!range&&data.words.some(w=>w.start>=range.start&&w.start<range.end);
 const [busy,setBusy]=useState(!summary&&hasTranscript),[error,setError]=useState(''),[setup,setSetup]=useState(false),[ready,setReady]=useState(false);
 const generate=useRef(onGenerate);generate.current=onGenerate;
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 async function load(){
  setBusy(true);setError('');
  try{await generate.current(chapter)}catch(e){if(mounted.current)setError((e as Error).message)}finally{if(mounted.current)setBusy(false)}
 }
 useEffect(()=>{
  if(summary||!hasTranscript)return;
  let live=true;
  setBusy(true);setError('');
  window.narezator.transcriptionCredentials().then(async keys=>{
   if(!live)return;
   if(keys.openai.configured)await load();else{setSetup(true);setBusy(false)}
  }).catch(()=>{if(live){setError('Could not read the saved API key. Please retry.');setBusy(false)}});
  return()=>{live=false};
 },[chapter.id,range?.start,range?.end,!!summary,hasTranscript]);
 if(summary)return <><p className="chapter-summary-flow" lang={data.language}>{summary.flow}</p><ul lang={data.language}>{summary.insights.map((insight,index)=><li key={index}>{insight}</li>)}</ul></>;
 if(!range)return <p className="chapter-summary-empty">This question has no chapter in the recording. Use “Set start here” to locate its discussion.</p>;
 if(!hasTranscript)return <p className="chapter-summary-empty">A summary will be available after this chapter has a transcript.</p>;
 return <div aria-live="polite">
  {busy&&<p className="chapter-summary-loading" role="status"><LoaderCircle size={13}/>Summarizing discussion…</p>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {setup&&!busy&&<><p className="chapter-summary-empty">Add an OpenAI key to summarize this discussion.</p><TranscriptionSetup provider="openai" onProvider={()=>{}} onReady={setReady} purpose="summary"/><Button size="sm" disabled={!ready} onClick={()=>void load()}>Generate summary</Button></>}
  {!setup&&!busy&&error&&<div className="chapter-summary-actions"><Button variant="outline" size="sm" onClick={()=>void load()}>Retry summary</Button><button onClick={()=>setSetup(true)}>Update API key</button></div>}
 </div>;
}

export default function Chapters({chapters,data,query,activeId,liveId,onSelect,onGenerate}:{chapters:Chapter[];data:Recording;query:string;activeId?:string;liveId?:string;onSelect:(chapter:Chapter)=>void;onGenerate:(chapter:Chapter)=>Promise<ChapterSummary>}){
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 function toggle(id:string){setExpanded(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})}
 return <div className="chapter-list">{[...chapters].sort((a,b)=>(a.start??Infinity)-(b.start??Infinity)).filter(c=>`${c.title} ${c.question}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(c=>{
  const open=expanded.has(c.id),panelId=`chapter-summary-${c.id}`,range=chapterRange(c,chapters,data.duration);
  return <article className={`chapter-card ${activeId===c.id?'active':''}`} key={c.id}>
   <button className={`chapter-item ${activeId===c.id?'active':''} ${c.kind==='missing'?'missing':''}`} onClick={()=>onSelect(c)} title={c.question}><span className="chapter-number">{String(c.number).padStart(2,'0')}</span><span><b>{c.title}</b><small>{c.start===null?'Not found in recording':timecode(c.start)} {c.kind==='covered'&&<i>in answer</i>}</small></span>{c.id===liveId&&<span className="now-dot"/>}</button>
   <button className="chapter-summary-toggle" aria-label={`${open?'Hide':'Show'} summary for chapter ${c.number}`} aria-expanded={open} aria-controls={panelId} onClick={()=>toggle(c.id)}><FileText size={12}/>{open?'Hide summary':'Summary'}<ChevronDown size={12} className={open?'expanded':''}/></button>
   {open&&<div className="chapter-summary" id={panelId} role="region" aria-label={`Chapter ${c.number} summary`}><Summary key={`${c.id}:${range?.start}:${range?.end}`} chapter={c} range={range} data={data} onGenerate={onGenerate}/></div>}
  </article>;
 })}</div>;
}
