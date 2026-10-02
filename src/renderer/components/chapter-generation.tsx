import {useEffect,useRef,useState} from 'react';
import {ListVideo,LoaderCircle} from 'lucide-react';
import {Button} from './ui/button';
import {TranscriptionSetup} from './transcription';

export function useChapterGeneration(enabled:boolean,wordCount:number,onGenerate:(cachedOnly:boolean)=>Promise<boolean>){
 const [phase,setPhase]=useState<'waiting'|'checking'|'generating'|'ready'|'error'>('waiting'),[error,setError]=useState(''),[setup,setSetup]=useState(false),[ready,setReady]=useState(false);
 const generate=useRef(onGenerate);generate.current=onGenerate;
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 async function run(){setPhase('generating');setError('');try{await generate.current(false);if(mounted.current)setPhase('ready')}catch(e){if(mounted.current){setPhase('error');setError((e as Error).message)}}}
 useEffect(()=>{
  if(!enabled||!wordCount)return;
  let live=true;setPhase('checking');setError('');
  void (async()=>{
   if(await generate.current(true))return;
   if(!live)return;
   const keys=await window.narezator.transcriptionCredentials();if(!live)return;
   if(keys.openai.configured)await run();else{setSetup(true);setPhase('ready')}
  })().catch(e=>{if(live){setPhase('error');setError((e as Error).message)}});
  return()=>{live=false};
 },[enabled,wordCount]);
 return {phase,error,setup,ready,setReady,setSetup,run};
}
export default function ChapterGenerationEmpty({wordCount,state}:{wordCount:number;state:ReturnType<typeof useChapterGeneration>}){
 const busy=state.phase==='checking'||state.phase==='generating';
 return <div className="chapter-generation-empty">
  <ListVideo size={25}/><h3>{busy?'Creating chapters':'No chapters yet'}</h3>
  {!wordCount?<p>Chapters can be generated after transcription finishes.</p>:busy?<p role="status" className="chapter-summary-loading"><LoaderCircle size={13}/>Finding topics and summarizing the discussion…</p>:<p>Generate chapters from this transcript, with a short summary and 2–3 insights for each topic.</p>}
  {state.error&&<p className="inline-error" role="alert">{state.error}</p>}
  {!!wordCount&&!busy&&<>
   {state.setup&&<TranscriptionSetup provider="openai" onProvider={()=>{}} onReady={state.setReady} purpose="chapters"/>}
   <Button size="sm" disabled={state.setup&&!state.ready} onClick={()=>void state.run()}>{state.error?'Retry chapter generation':'Generate chapters'}</Button>
   {!state.setup&&state.error&&<button className="chapter-generation-key" onClick={()=>state.setSetup(true)}>Update API key</button>}
  </>}
 </div>;
}
