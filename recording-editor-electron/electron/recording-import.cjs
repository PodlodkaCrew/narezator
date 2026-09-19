const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {ffmpegPath}=require('./exporter.cjs');
const run=promisify(execFile);
const time=value=>String(value).replace(',','.').split(':').reduce((n,part)=>n*60+Number(part),0);

async function probeVideo(file){
 let output='';
 try{const result=await run(ffmpegPath,['-hide_banner','-i',file],{maxBuffer:1024*1024});output=result.stderr}catch(error){output=error.stderr||''}
 const duration=time(output.match(/Duration: (\d+:\d+:\d+\.\d+)/)?.[1]||'0');
 const line=output.split('\n').find(line=>/Stream .*Video:/.test(line))||'';
 if(!duration||!line)throw Error('Cannot read this video. Choose a playable local video file.');
 const dimensions=line.match(/\b(\d{2,5})x(\d{2,5})\b/),fps=Number(line.match(/([\d.]+) fps/)?.[1]||30);
 return {duration,width:Number(dimensions?.[1]||0),height:Number(dimensions?.[2]||0),fps};
}
function normalizeRecording(value){
 if(!value||typeof value.title!=='string'||typeof value.source!=='string'||!Number.isFinite(value.duration)||value.duration<=0||!Array.isArray(value.words)||!Array.isArray(value.chapters))throw Error('Invalid recording metadata.');
 const ids=new Set();
 for(const word of value.words){if(!word||!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<0||word.end<word.start||word.end>value.duration+.1||typeof word.text!=='string'||!Number.isInteger(word.id)||ids.has(word.id))throw Error('Invalid transcript word timing.');ids.add(word.id)}
 value.words.sort((a,b)=>a.start-b.start||a.id-b.id);
 const chapterIds=new Set();
 for(const c of value.chapters){if(!c||typeof c.id!=='string'||chapterIds.has(c.id)||typeof c.title!=='string'||typeof c.question!=='string'||typeof c.note!=='string'||typeof c.evidence!=='string'||!Number.isInteger(c.number)||!['direct','covered','missing','manual'].includes(c.kind)||!(c.start===null||(Number.isFinite(c.start)&&c.start>=0&&c.start<value.duration)))throw Error('Invalid chapter metadata.');chapterIds.add(c.id)}
 return {...value,language:value.language||'und',fps:value.fps||30,width:value.width||0,height:value.height||0,priorCuts:value.priorCuts||[],initialClips:value.initialClips||[{id:'source',start:0,end:value.duration,label:value.title}]};
}
function readTranscript(file){
 if(!file)return {words:[],chapters:[],timing:'none'};
 const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
 if(path.extname(file).toLowerCase()==='.json'){
  const raw=JSON.parse(text),words=Array.isArray(raw)?raw:raw.words;
  if(!Array.isArray(words))throw Error('Transcript JSON must contain a words array with text, start and end times.');
  return {words:words.filter(w=>w.type!=='spacing').map((w,id)=>({...w,id,text:w.text,start:w.start,end:w.end,speaker:Number(w.speaker)||Number(String(w.speaker_id||'').replace(/\D/g,''))+1||1,section:Number(w.section)||0})),chapters:raw.chapters||[],language:raw.language,timing:'words'};
 }
 const words=[];
 const blocks=text.replace(/\r/g,'').split(/\n\s*\n/);
 for(const [section,block] of blocks.entries()){
  const lines=block.split('\n'),index=lines.findIndex(line=>line.includes('-->'));if(index<0)continue;
  const match=lines[index].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);if(!match)continue;
  const start=time(match[1]),end=time(match[2]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Invalid subtitle timestamp.');
  const tokens=lines.slice(index+1).join(' ').replace(/<[^>]*>/g,'').trim().split(/\s+/).filter(Boolean);
  tokens.forEach((text,i)=>words.push({id:words.length,text,start:start+(end-start)*i/tokens.length,end:start+(end-start)*(i+1)/tokens.length,speaker:1,section}));
 }
 if(!words.length)throw Error('No timed subtitles found. Choose word-timed JSON, SRT or VTT.');
 return {words,chapters:[],timing:'estimated'};
}
function readChapters(file,duration){
 if(!file)return [];
 const text=fs.readFileSync(file,'utf8');
 if(path.extname(file).toLowerCase()==='.json'){const raw=JSON.parse(text);return Array.isArray(raw)?raw:raw.chapters}
 return text.split(/\r?\n/).filter(line=>line.trim()&&!/^#\s/.test(line)).map((line,index)=>{
  const match=line.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?\b/),start=match?time(match[0]):null;
  if(start!==null&&start>=duration)throw Error('A chapter starts beyond the video duration.');
  const title=line.replace(/^\s*(?:#+\s*|[-*]\s*|\d+[.)]\s*)/,'').replace(match?.[0]||/^$/,'').replace(/^[\s–—:-]+/,'').trim();
  return {id:`chapter-${index+1}`,number:index+1,title,question:title,start,end:null,kind:start===null?'missing':'manual',note:'',evidence:''};
 });
}
async function importRecording({videoPath,transcriptPath,chaptersPath,title}){
 const media=await probeVideo(videoPath);
 // Existing recording metadata owns the precise timeline. FFmpeg's diagnostic
 // duration is rounded to hundredths of a second and must not replace it.
 if(transcriptPath&&path.extname(transcriptPath).toLowerCase()==='.json'){
  const raw=JSON.parse(fs.readFileSync(transcriptPath,'utf8').replace(/^\uFEFF/,''));
  if(raw.duration!==undefined&&raw.source!==undefined&&Array.isArray(raw.chapters)){
   const recording=normalizeRecording(raw);
   if(Math.abs(recording.duration-media.duration)>.1)throw Error('This recording metadata belongs to a video with a different duration. Choose the original video.');
   return {...recording,title:title?.trim()||recording.title,chapters:chaptersPath?readChapters(chaptersPath,recording.duration):recording.chapters};
  }
 }
 const transcript=readTranscript(transcriptPath);
 const recording=normalizeRecording({...media,title:title?.trim()||path.parse(videoPath).name,source:path.basename(videoPath),language:transcript.language||'und',words:transcript.words,chapters:chaptersPath?readChapters(chaptersPath,media.duration):transcript.chapters,transcriptTiming:transcript.timing});
 return recording;
}
module.exports={importRecording,normalizeRecording,readTranscript,readChapters,probeVideo};
