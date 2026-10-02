const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {ffmpegPath}=require('./exporter.cjs');
const {atomicJson}=require('./project-store.cjs');
const {normalizeRecording}=require('./recording-import.cjs');
const {providerName}=require('./transcription-credentials.cjs');
const ACTIVE=['preparing','transcribing','saving'];
const CHUNK_SECONDS=600;
function chunks(duration,provider){
 if(provider==='elevenlabs')return [{start:0,end:duration,from:0,to:duration}];
 return Array.from({length:Math.ceil(duration/CHUNK_SECONDS)},(_,i)=>({start:Math.max(0,i*CHUNK_SECONDS-1),end:Math.min(duration,(i+1)*CHUNK_SECONDS+1),from:i*CHUNK_SECONDS,to:Math.min(duration,(i+1)*CHUNK_SECONDS)}));
}
function extractAudio({source,file,start,end,signal,onProgress}){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(Error('Transcription cancelled.'));
  const child=spawn(ffmpegPath,['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(start),'-i',source,'-t',String(end-start),'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','libmp3lame','-b:a','64k','-progress','pipe:1',file],{stdio:['ignore','pipe','pipe']});
  let stderr='',buffer='';const cancel=()=>child.kill('SIGTERM');signal.addEventListener('abort',cancel,{once:true});
  child.stderr.on('data',v=>{stderr=(stderr+v).slice(-3000)});
  child.stdout.on('data',v=>{buffer+=v;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)if(line.startsWith('out_time_us=')){const n=Number(line.slice(12))/1e6/(end-start);if(Number.isFinite(n))onProgress(Math.max(0,Math.min(1,n)))}});
  child.on('error',()=>{signal.removeEventListener('abort',cancel);reject(Error('Could not start audio preparation.'))});
  child.on('close',code=>{signal.removeEventListener('abort',cancel);if(signal.aborted)return reject(Error('Transcription cancelled.'));if(code)return reject(Error(/matches no streams|does not contain any stream/.test(stderr)?'This video has no audio track. Choose a video with speech.':'Could not prepare the audio. Check that the video is playable.'));resolve()});
 });
}
async function requestTranscript({provider,apiKey,file,signal,fetchImpl=fetch}){
 const body=new FormData();body.append('file',await fs.openAsBlob(file,{type:'audio/mpeg'}),'audio.mp3');
 let url,headers;
 if(provider==='openai'){
  url='https://api.openai.com/v1/audio/transcriptions';headers={Authorization:`Bearer ${apiKey}`};body.append('model','whisper-1');body.append('response_format','verbose_json');body.append('timestamp_granularities[]','word');
 }else{
  providerName(provider);url='https://api.elevenlabs.io/v1/speech-to-text';headers={'xi-api-key':apiKey};body.append('model_id','scribe_v2');body.append('timestamps_granularity','word');body.append('diarize','true');body.append('tag_audio_events','false');
 }
 let response;
 try{response=await fetchImpl(url,{method:'POST',headers,body,signal:AbortSignal.any([signal,AbortSignal.timeout(30*60*1000)])})}catch{if(signal.aborted)throw Error('Transcription cancelled.');throw Error('The transcription connection failed or timed out. Check your connection and retry.');}
 if(!response.ok){
  // Provider bodies may contain submitted tokens. Never expose or persist them.
  await response.body?.cancel();
  const status=response.status,name=providerName(provider);
  if(status===401||status===403)throw Error(`${name} rejected the API key. Update the key and check transcription permissions.`);
  if(status===429)throw Error(`${name} quota or rate limit reached. Check your credits and retry later.`);
  if(status===413)throw Error(`${name} rejected the audio size. Try a shorter recording.`);
  throw Error(`${name} could not transcribe this audio (HTTP ${status}). Please retry.`);
 }
 let result;try{result=await response.json()}catch{throw Error('The transcription service returned an unreadable response.')}
 if(!Array.isArray(result.words))throw Error('The transcription service did not return word timestamps. Please retry.');
 return result;
}
function timedWords(result,chunk,provider){
 const speakers=new Map(),words=[];
 for(const word of result.words){
  if(provider==='elevenlabs'&&word.type!=='word')continue;
  const text=provider==='openai'?word.word:word.text;
  if(typeof text!=='string'||!text.trim())continue;
  if(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<0||word.end<word.start||word.end>chunk.end-chunk.start+1)throw Error('The transcription service returned invalid word timestamps.');
  const start=chunk.start+word.start,end=Math.min(chunk.end,chunk.start+word.end),mid=(start+end)/2;
  if(mid<chunk.from||mid>=chunk.to||end<=start)continue;
  const speaker=word.speaker_id||'speaker';if(!speakers.has(speaker))speakers.set(speaker,speakers.size+1);
  words.push({text:text.trim(),start:Math.max(0,start),end,speaker:provider==='openai'?1:speakers.get(speaker),section:0});
 }
 return words;
}
class TranscriptionManager{
 constructor({credentials,extract=extractAudio,request=requestTranscript}){this.credentials=credentials;this.extract=extract;this.request=request;this.jobs=new Map()}
 statusFile(config){return path.join(path.dirname(config.recordingPath),'transcription.json')}
 status(config){
  if(!config||config.closed)return null;
  const key=config.recordingPath,job=this.jobs.get(key);if(job)return {...job.state};
  let state;try{state=JSON.parse(fs.readFileSync(this.statusFile(config),'utf8'))}catch{return null}
  if(ACTIVE.includes(state.status)){state={...state,status:'error',message:'Transcription was interrupted. Retry to continue.'};atomicJson(this.statusFile(config),state)}
  return state;
 }
 start(config,provider){
  if(this.jobs.has(config.recordingPath))throw Error('This project is already being transcribed.');
  const apiKey=this.credentials.require(provider),recording=JSON.parse(fs.readFileSync(config.recordingPath,'utf8'));
  if(recording.words.length)throw Error('This project already has a transcript.');
  const job={controller:new AbortController(),state:{projectId:config.id,provider,status:'preparing',progress:0,message:'Preparing audio…',completed:0,total:chunks(recording.duration,provider).length}};
  atomicJson(this.statusFile(config),job.state);this.jobs.set(config.recordingPath,job);
  job.promise=this.run(structuredClone(config),recording,apiKey,job).catch(()=>{job.state.status='error';job.state.message='Could not save transcription progress. Check disk space and retry.'}).finally(()=>this.jobs.delete(config.recordingPath));
  return {...job.state};
 }
 async run(config,recording,apiKey,job){
  const signal=job.controller.signal,provider=job.state.provider,folder=path.join(path.dirname(config.recordingPath),'.transcription-work');
  const update=fields=>{Object.assign(job.state,fields);atomicJson(this.statusFile(config),job.state)};
  try{
   fs.mkdirSync(folder,{recursive:true});const plan=chunks(recording.duration,provider),words=[];let language='und';
   for(const [index,chunk] of plan.entries()){
    signal.throwIfAborted();const file=path.join(folder,`audio-${index}.mp3`);
    update({status:'preparing',message:`Preparing audio ${index+1} of ${plan.length}…`,progress:index/plan.length});
    await this.extract({source:config.videoPath,file,...chunk,signal,onProgress:value=>{job.state.progress=(index+value*.15)/plan.length}});
    signal.throwIfAborted();
    update({status:'transcribing',message:`Transcribing ${index+1} of ${plan.length} with ${providerName(provider)}…`,progress:(index+.15)/plan.length});
    const result=await this.request({provider,apiKey,file,signal});signal.throwIfAborted();
    words.push(...timedWords(result,chunk,provider));language=result.language_code||result.language||language;
    fs.rmSync(file,{force:true});update({completed:index+1,progress:(index+1)/plan.length*.98});
   }
   if(!words.length)throw Error('No speech was recognized. Check the audio or try the other provider.');
   update({status:'saving',message:'Saving the synchronized transcript…',progress:.99});signal.throwIfAborted();
   // Only update the recording. Edits, reels, notes, revisions and undo history remain independent.
   const latest=JSON.parse(fs.readFileSync(config.recordingPath,'utf8'));
   if(latest.words.length)throw Error('A transcript was added while this job was running. It has been preserved.');
   const completed=normalizeRecording({...latest,language,transcriptTiming:'words',transcriptionProvider:provider,words:words.sort((a,b)=>a.start-b.start||a.end-b.end).map((word,id)=>({...word,id}))});
   atomicJson(config.recordingPath,completed);update({status:'done',message:'Transcript ready',progress:1});
  }catch(error){update({status:signal.aborted?'cancelled':'error',message:signal.aborted?'Transcription cancelled. You can retry anytime.':error.message})}
  finally{fs.rmSync(folder,{recursive:true,force:true})}
 }
 cancel(config){const job=this.jobs.get(config.recordingPath);if(job)job.controller.abort();return {ok:!!job}}
 cancelAll(){for(const job of this.jobs.values())job.controller.abort()}
}
module.exports={TranscriptionManager,extractAudio,requestTranscript,timedWords,chunks,ACTIVE};
