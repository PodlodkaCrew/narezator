const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {TranscriptionCredentials}=require('../electron/transcription-credentials.cjs');
const {TranscriptionManager,requestTranscript,extractAudio,chunks,timedWords}=require('../electron/transcription.cjs');
const {ProjectStore}=require('../electron/project-store.cjs');
const {newWorkspace}=require('../electron/new-workspace.cjs');
const {ffmpegPath}=require('../electron/exporter.cjs');
const key='test-only-transcription-key';
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-transcription-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir}
const secure={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from([...value].reverse().join('')),decryptString:value=>[...value.toString()].reverse().join('')};
function setup(t,duration=4){const dir=root(t),video=path.join(dir,'video.mp4');fs.writeFileSync(video,'fixture');const credentials=new TranscriptionCredentials({userData:path.join(dir,'profile'),safeStorage:secure});credentials.save({provider:'openai',apiKey:key});credentials.save({provider:'elevenlabs',apiKey:key});const store=new ProjectStore({userData:path.join(dir,'profile'),resourcesPath:dir});const config=store.create({manifestPath:path.join(dir,'project.narezator'),videoPath:video,recording:{title:'Recording',source:'video.mp4',duration,words:[],chapters:[]}});return {dir,video,credentials,store,config}}
const answer={language:'english',words:[{word:'Hello',start:.2,end:.7}]};
async function finish(manager,config){await manager.jobs.get(config.recordingPath).promise;return manager.status(config)}

test('API keys stay out of status and plaintext storage, with encrypted and session persistence',t=>{
 const dir=root(t),credentials=new TranscriptionCredentials({userData:dir,safeStorage:secure});
 assert.throws(()=>credentials.require('openai'),/API key/);assert.throws(()=>credentials.save({provider:'openai',apiKey:' '}),/valid/);
 credentials.save({provider:'openai',apiKey:key,remember:true});assert.equal(credentials.get('openai'),key);assert.ok(!fs.readFileSync(credentials.file,'utf8').includes(key));assert.ok(!JSON.stringify(credentials.status()).includes(key));
 const restarted=new TranscriptionCredentials({userData:dir,safeStorage:secure});assert.equal(restarted.get('openai'),key);
 restarted.save({provider:'openai',apiKey:key,remember:false});assert.equal(restarted.status().openai.storage,'session');assert.equal(new TranscriptionCredentials({userData:dir,safeStorage:secure}).get('openai'),null);
 const fallback=new TranscriptionCredentials({userData:dir,safeStorage:{...secure,getSelectedStorageBackend:()=> 'basic_text'}});fallback.save({provider:'elevenlabs',apiKey:key,remember:true});assert.equal(fallback.status().elevenlabs.storage,'session');assert.ok(!fs.readFileSync(fallback.file,'utf8').includes(key));
});

test('both provider requests send the documented model, auth and word timestamp fields',async t=>{
 const dir=root(t),file=path.join(dir,'audio.mp3');fs.writeFileSync(file,'audio');
 for(const provider of ['openai','elevenlabs'])await requestTranscript({provider,apiKey:key,file,signal:new AbortController().signal,fetchImpl:async(url,options)=>{
  const body=options.body;assert.equal(await body.get('file').text(),'audio');assert.equal(options.method,'POST');
  if(provider==='openai'){assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer '+key);assert.equal(body.get('model'),'whisper-1');assert.equal(body.get('response_format'),'verbose_json');assert.equal(body.get('timestamp_granularities[]'),'word')}
  else{assert.equal(url,'https://api.elevenlabs.io/v1/speech-to-text');assert.equal(options.headers['xi-api-key'],key);assert.equal(body.get('model_id'),'scribe_v2');assert.equal(body.get('diarize'),'true');assert.equal(body.get('timestamps_granularity'),'word')}
  return Response.json({words:[]});
 }});
 for(const status of [401,403,429,500])await assert.rejects(requestTranscript({provider:'openai',apiKey:key,file,signal:new AbortController().signal,fetchImpl:async()=>new Response(key,{status})}),error=>!error.message.includes(key)&&/key|quota|HTTP/.test(error.message));
 await assert.rejects(requestTranscript({provider:'openai',apiKey:key,file,signal:new AbortController().signal,fetchImpl:async()=>Response.json({text:'No timestamps'})}),/word timestamps/);
});

test('chunk overlap keeps source offsets and filters boundary duplicates',()=>{
 const plan=chunks(1201,'openai');assert.deepEqual(plan.map(x=>[x.start,x.end]),[[0,601],[599,1201],[1199,1201]]);
 const result=timedWords({words:[{word:'previous',start:.2,end:.6},{word:'kept',start:1.2,end:2}]},plan[1],'openai');assert.equal(result.length,1);assert.equal(result[0].start,600.2);
 const eleven=timedWords({words:[{type:'word',text:'One',start:0,end:1,speaker_id:'speaker_0'},{type:'spacing',text:' ',start:1,end:1},{type:'word',text:'Two',start:1,end:2,speaker_id:'speaker_1'}]},chunks(4,'elevenlabs')[0],'elevenlabs');assert.deepEqual(eleven.map(w=>w.speaker),[1,2]);
 assert.throws(()=>timedWords({words:[{word:'bad',start:NaN,end:1}]},plan[0],'openai'),/invalid/);
});

test('background transcription preserves ongoing edits and stays with its original project',async t=>{
 const f=setup(t);let release;const manager=new TranscriptionManager({credentials:f.credentials,extract:async()=>{},request:()=>new Promise(resolve=>{release=resolve})});
 manager.start(f.config,'openai');await new Promise(resolve=>setImmediate(resolve));
 const p=f.store.load().project;p.clips[0].start=1;p.annotations=[{id:'note',text:'Keep',context:'Source',ranges:[{start:1,end:2}],createdAt:'now',updatedAt:'now'}];f.store.save(p,p.revision,f.config.id);const bytes=fs.readFileSync(f.config.projectPath);
 const other=f.store.create({manifestPath:path.join(f.dir,'other.narezator'),videoPath:f.video,recording:{title:'Other',source:'video.mp4',duration:4,words:[],chapters:[]}});
 release(answer);const state=await finish(manager,f.config);assert.equal(state.status,'done');assert.deepEqual(fs.readFileSync(f.config.projectPath),bytes);assert.equal(f.store.identity(),other.id);assert.equal(f.store.load().recording.words.length,0);
 const recorded=JSON.parse(fs.readFileSync(f.config.recordingPath));assert.equal(recorded.words[0].text,'Hello');assert.equal(recorded.words[0].start,.2);assert.ok(!fs.readFileSync(manager.statusFile(f.config),'utf8').includes(key));
});

test('cancellation, provider failure, and restart leave a retryable project',async t=>{
 const f=setup(t);let release;const manager=new TranscriptionManager({credentials:f.credentials,extract:async()=>{},request:()=>new Promise(resolve=>{release=resolve})});
 manager.start(f.config,'openai');await new Promise(resolve=>setImmediate(resolve));manager.cancel(f.config);release(answer);assert.equal((await finish(manager,f.config)).status,'cancelled');assert.equal(f.store.load().recording.words.length,0);
 manager.request=async()=>{throw Error('Provider unavailable')};manager.start(f.config,'openai');assert.equal((await finish(manager,f.config)).status,'error');
 fs.writeFileSync(manager.statusFile(f.config),JSON.stringify({status:'transcribing',provider:'openai'}));assert.match(new TranscriptionManager({credentials:f.credentials}).status(f.config).message,/interrupted/);
 manager.request=async()=>answer;manager.start(f.config,'openai');assert.equal((await finish(manager,f.config)).status,'done');assert.throws(()=>manager.start(f.config,'openai'),/already has a transcript/);
});

test('real audio extraction and the new project flow require a key before importing',async t=>{
 const dir=root(t),video=path.join(dir,'video.mp4');const generated=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=s=160x90:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-shortest','-c:v','libx264','-c:a','aac',video]);assert.equal(generated.status,0,String(generated.stderr));
 const credentials=new TranscriptionCredentials({userData:path.join(dir,'profile'),safeStorage:secure});const store=new ProjectStore({userData:path.join(dir,'profile'),resourcesPath:dir});const manager=new TranscriptionManager({credentials,request:async options=>{assert.ok(fs.statSync(options.file).size>1000);return answer}});
 let dialogs=0;const args={options:{videoPath:video,title:'Audio test',provider:'openai'},store,credentials,transcriptions:manager,dialog:{showSaveDialog:async()=>{dialogs++;return {canceled:false,filePath:path.join(dir,'audio.narezator')}}}};
 await assert.rejects(newWorkspace(args),/API key/);assert.equal(dialogs,0);assert.equal(store.info().active,false);
 credentials.save({provider:'openai',apiKey:key});assert.deepEqual(await newWorkspace({...args,dialog:{showSaveDialog:async()=>({canceled:true})}}),{cancelled:true});assert.equal(store.info().active,false);
 assert.deepEqual(await newWorkspace(args),{cancelled:false});const config=store.readConfig();assert.equal((await finish(manager,config)).status,'done');assert.equal(store.load().recording.words[0].text,'Hello');
 const silent=path.join(dir,'silent.mp4');assert.equal(spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=s=160x90:d=1',silent]).status,0);
 await assert.rejects(extractAudio({source:silent,file:path.join(dir,'silent.mp3'),start:0,end:1,signal:new AbortController().signal,onProgress:()=>{}}),/no audio track/);
});
