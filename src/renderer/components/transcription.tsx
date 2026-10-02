import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import type {TranscriptionProvider,TranscriptionState,TranscriptionKeys} from '../electron';
const emptyKeys:TranscriptionKeys={elevenlabs:{configured:false,storage:null},openai:{configured:false,storage:null}};
export function TranscriptionSetup({provider,onProvider,onReady,disabled=false,purpose='transcription'}:{provider:TranscriptionProvider;onProvider:(provider:TranscriptionProvider)=>void;onReady:(ready:boolean)=>void;disabled?:boolean;purpose?:'transcription'|'summary'|'chapters'}){
 const [keys,setKeys]=useState(emptyKeys),[key,setKey]=useState(''),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;window.narezator.transcriptionCredentials().then(value=>{if(live)setKeys(value)}).catch(()=>{if(live)setError('Could not read saved transcription keys.')});return()=>{live=false}},[]);
 useEffect(()=>onReady(keys[provider].configured&&!key.trim()&&!busy),[keys,provider,key,busy,onReady]);
 async function save(){setBusy(true);setError('');try{setKeys(await window.narezator.saveTranscriptionKey({provider,apiKey:key,remember}));setKey('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="transcription-setup">
  {purpose==='transcription'&&<label className="project-field">Transcription provider<select aria-label="Transcription provider" value={provider} disabled={disabled||busy} onChange={e=>{onReady(false);onProvider(e.target.value as TranscriptionProvider);setKey('');setError('')}}><option value="elevenlabs">ElevenLabs</option><option value="openai">OpenAI</option></select></label>}
  <label className="project-field">{provider==='openai'?'OpenAI':'ElevenLabs'} API key<Input type="password" aria-label={purpose==='summary'?'Summary API key':purpose==='chapters'?'Chapter generation API key':'Transcription API key'} autoComplete="off" spellCheck={false} value={key} disabled={disabled||busy} placeholder={keys[provider].configured?'Key saved — enter a new key to replace it':'Paste your API key'} onChange={e=>{onReady(false);setKey(e.target.value)}}/></label>
  <label className="transcription-remember"><input type="checkbox" checked={remember} disabled={disabled||busy} onChange={e=>setRemember(e.target.checked)}/>Remember key securely on this computer</label>
  <div className="transcription-key-status"><Button variant="outline" size="sm" disabled={disabled||busy||!key.trim()} onClick={()=>void save()}>{busy?'Saving key…':'Save key'}</Button>{keys[provider].configured&&<small role="status">{keys[provider].storage==='encrypted'?'Key saved securely':'Key saved for this session'}</small>}</div>
  <p className="export-note">{purpose==='summary'?'This chapter’s transcript is sent to OpenAI to generate a summary.':purpose==='chapters'?'The transcript is sent to OpenAI to find topics and create chapter summaries.':`${provider==='elevenlabs'?'Word timestamps and speaker labels.':'Word timestamps; speakers are not separated.'} Audio is sent to ${provider==='openai'?'OpenAI':'ElevenLabs'} using your account.`} Provider charges apply.</p>
  {error&&<p className="inline-error" role="alert">{error}</p>}
 </div>;
}
export default function TranscriptionProgress({onComplete}:{onComplete:()=>Promise<void>}){
 const [state,setState]=useState<TranscriptionState|null>(null),[provider,setProvider]=useState<TranscriptionProvider>('elevenlabs'),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let live=true,loaded=false,polling=false,initialized=false;
  async function poll(){if(polling)return;polling=true;try{const next=await window.narezator.transcriptionStatus();if(!live)return;setState(next);if(next?.provider&&!initialized){setProvider(next.provider);initialized=true}if(next?.status==='done'&&!loaded){await onComplete();loaded=true}}catch{if(live)setError('Could not read transcription progress.')}finally{polling=false}}
  void poll();const timer=setInterval(()=>void poll(),1000);return()=>{live=false;clearInterval(timer)};
 },[onComplete]);
 async function retry(){setBusy(true);setError('');try{setState(await window.narezator.retryTranscription({provider}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(!state)return error?<div className="transcription-progress" role="alert">{error}</div>:null;
 const active=['preparing','transcribing','saving'].includes(state.status);
 if(state.status==='done')return null;
 return <div className="transcription-progress" aria-live="polite">
  <h3>{active?'Preparing your transcript':state.status==='cancelled'?'Transcription paused':'Transcription needs attention'}</h3>
  <p>{state.message}</p>
  {active?<><progress aria-label="Transcription progress" max={1} value={state.status==='transcribing'?undefined:state.progress}/><small>{state.completed} of {state.total} audio parts transcribed</small><Button variant="outline" size="sm" onClick={()=>void window.narezator.cancelTranscription().catch(e=>setError(e.message))}>Cancel transcription</Button></>:<><TranscriptionSetup provider={provider} onProvider={setProvider} onReady={setReady} disabled={busy}/><Button disabled={!ready||busy} onClick={()=>void retry()}>{busy?'Starting…':'Retry transcription'}</Button></>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
 </div>;
}
