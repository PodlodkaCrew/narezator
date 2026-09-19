const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const ffmpegPackage=require('ffmpeg-static');

const FPS=30,EPSILON=.00001;
const ffmpegPath=String(ffmpegPackage).replace('app.asar','app.asar.unpacked');

function stamp(seconds,millis=false){
 const ms=Math.round(Math.max(0,seconds)*1000),base=`${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
 return millis?`${base}.${String(ms%1000).padStart(3,'0')}`:base;
}
function renderPlan(clips){let offset=0;return clips.map(clip=>{const frames=Math.max(1,Math.floor((clip.end-clip.start)*FPS+.5)),renderDuration=frames/FPS,result={...clip,outputStart:offset,outputEnd:offset+renderDuration,renderDuration};offset+=renderDuration;return result})}
function removedRanges(clips,sourceDuration){
 const retained=clips.map(clip=>[Math.max(0,Math.min(sourceDuration,clip.start)),Math.max(0,Math.min(sourceDuration,clip.end))]).filter(([start,end])=>end-start>EPSILON).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),merged=[];
 for(const [start,end] of retained){const previous=merged.at(-1);if(previous&&start<=previous[1]+EPSILON)previous[1]=Math.max(previous[1],end);else merged.push([start,end])}
 const cuts=[];let cursor=0;for(const [start,end] of merged){if(start-cursor>EPSILON)cuts.push([cursor,start]);cursor=Math.max(cursor,end)}if(sourceDuration-cursor>EPSILON)cuts.push([cursor,sourceDuration]);return cuts;
}
const phraseEnd=text=>/[.!?…](?:["'»”\])}]+)?$/.test(text.trim());
function firstPhrase(words){const selected=[];for(const word of words.slice(0,12)){selected.push(word);if(selected.length>=2&&phraseEnd(word.text))break}return selected.map(word=>word.text.trim()).join(' ')}
function lastPhrase(words){let start=Math.max(0,words.length-12);for(let index=words.length-2;index>=start;index--)if(phraseEnd(words[index].text)){start=index+1;break}return words.slice(start).map(word=>word.text.trim()).join(' ')}
function cutReport(clips,recording,kind='main'){
 if(kind==='reel'&&!clips.length)return '_Рилс пуст._\n';
 const reelStart=Math.min(...clips.map(clip=>clip.start)),reelEnd=Math.max(...clips.map(clip=>clip.end));
 const cuts=removedRanges(clips,recording.duration).filter(([start,end])=>kind!=='reel'||(start>=reelStart&&end<=reelEnd)),removed=cuts.reduce((sum,[start,end])=>sum+end-start,0),lines=kind==='reel'?[`${stamp(reelStart)} – ${stamp(reelEnd)}`,'']:[`# Монтажный лист: ${recording.title}`,'',`Источник: \`${recording.source}\`  `,`Вырезано фрагментов: ${cuts.length}  `,`Общая длительность вырезанных фрагментов: ${stamp(removed)}  `,'Все таймкоды относятся к исходной записи.',''];
 if(!cuts.length)lines.push('_В текущей версии нет вырезанных фрагментов._','');
 cuts.forEach(([start,end],index)=>{
  const words=recording.words.filter(word=>word.text.trim()&&word.start<end-EPSILON&&word.end>start+EPSILON);let first,last;
  if(!words.length)first=last='(нет распознанной речи)';else if(end-start<=3){first=words[0].text.trim();last=words.at(-1).text.trim()}else{first=firstPhrase(words);last=lastPhrase(words)}
  lines.push(`## Вырезанный фрагмент ${String(index+1).padStart(2,'0')}`,'',`${stamp(start)} – ${first}`,`${stamp(end)} – ${last}`,'');
 });return lines.join('\n');
}
const escapeMetadata=text=>String(text).replaceAll('\\','\\\\').replaceAll('=','\\=').replaceAll(';','\\;').replaceAll('#','\\#').replaceAll('\n',' ');
function writeSidecars(folder,project,recording,plan,kind='main'){
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,'project.json'),JSON.stringify(project,null,2),'utf8');
 fs.writeFileSync(path.join(folder,'edit-list.json'),JSON.stringify({title:recording.title,source:recording.source,timestampBasis:'original source seconds',fps:FPS,clips:plan},null,2),'utf8');
 fs.writeFileSync(path.join(folder,'cut-report.md'),cutReport(project.clips,recording,kind),'utf8');
 const metadata=[';FFMETADATA1',`title=${escapeMetadata(recording.title)}`],transcript=['Edited transcript · source and edit timestamps',''],srt=[];let cue=1;
 for(const clip of plan){
  metadata.push('[CHAPTER]','TIMEBASE=1/1000',`START=${Math.round(clip.outputStart*1000)}`,`END=${Math.round(clip.outputEnd*1000)}`,`title=${escapeMetadata(clip.label)}`);
  const words=recording.words.filter(word=>word.end>clip.start&&word.start<clip.end);let group=[];
  const writeGroup=()=>{if(!group.length)return;const start=clip.outputStart+Math.max(0,group[0].start-clip.start),end=Math.min(clip.outputEnd,clip.outputStart+group.at(-1).end-clip.start);if(end<=start){group=[];return}const text=group.map(word=>word.text).join(' ');transcript.push(`[${stamp(start,true)}] [source ${stamp(group[0].start,true)}] Speaker ${group[0].speaker}\n${text}\n`);srt.push(String(cue++),`${stamp(start,true).replace('.',',')} --> ${stamp(end,true).replace('.',',')}`,text,'');group=[]};
  for(const word of words){if(group.length&&(word.speaker!==group[0].speaker||word.start-group[0].start>5||group.length>=18))writeGroup();group.push(word)}writeGroup();
 }
 fs.writeFileSync(path.join(folder,'chapters.ffmetadata'),metadata.join('\n')+'\n','utf8');fs.writeFileSync(path.join(folder,'transcript.txt'),transcript.join('\n'),'utf8');fs.writeFileSync(path.join(folder,'subtitles.srt'),srt.join('\n'),'utf8');
}
function timestampFilter(start){
 const font=process.platform==='darwin'&&fs.existsSync('/System/Library/Fonts/Menlo.ttc')?"fontfile=/System/Library/Fonts/Menlo.ttc:":'';
 return `drawtext=${font}text='SOURCE %{pts\\:hms\\:${start.toFixed(6)}}':x=24:y=h-th-24:fontsize=h/30:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=10`;
}
function runProcess(args,job,onProgress,expected){
 return new Promise((resolve,reject)=>{
  if(job.cancelled)return reject(Error('Export cancelled.'));
  const child=spawn(ffmpegPath,args,{stdio:['ignore','pipe','pipe']});job.process=child;let stderr='',buffer='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000)});
  child.stdout.on('data',chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)if(line.startsWith('out_time_us=')&&expected){const value=Number(line.slice(12))/1e6;if(Number.isFinite(value))onProgress(Math.min(1,value/expected))}});
  child.on('error',reject);child.on('close',code=>{job.process=null;if(job.cancelled)return reject(Error('Export cancelled.'));if(code)return reject(Error(`Video rendering failed: ${stderr.slice(-1800)}`));resolve()});
 });
}
async function renderEdit({source,folder,project,recording,burn=true,height=1080,job,update,kind='main'}){
 const plan=renderPlan(project.clips);if(!plan.length)throw Error('The edit has no clips to export.');fs.mkdirSync(folder,{recursive:true});const parts=path.join(folder,'parts');fs.mkdirSync(parts,{recursive:true});const total=plan.reduce((sum,clip)=>sum+clip.renderDuration,0);writeSidecars(folder,project,recording,plan,kind);const concat=[];let done=0;
 for(let index=0;index<plan.length;index++){
  const clip=plan[index],length=clip.renderDuration,part=path.join(parts,`${String(index).padStart(5,'0')}.mkv`);update({status:'rendering',message:`Rendering clip ${index+1} of ${plan.length}`,progress:done/total*.95});
  let videoFilter=`scale=-2:${height},fps=${FPS},tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${length.toFixed(9)},setpts=PTS-STARTPTS`;if(burn)videoFilter+=','+timestampFilter(clip.start);
  const audioFilter=`asetpts=PTS-STARTPTS,apad,atrim=duration=${length.toFixed(9)}`;
  const args=['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(clip.start),'-i',source,'-t',length.toFixed(9),'-map','0:v:0','-map','0:a:0?','-vf',videoFilter,'-af',audioFilter,'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000','-ac','2','-progress','pipe:1',part];
  await runProcess(args,job,value=>update({progress:(done+length*value)/total*.95}),length);concat.push(`file 'parts/${path.basename(part)}'`,`duration ${length.toFixed(9)}`);done+=length;
 }
 fs.writeFileSync(path.join(folder,'concat.txt'),concat.join('\n')+'\n','utf8');update({status:'rendering',message:'Joining clips and writing the MP4',progress:.95});const partial=path.join(folder,'edited-video.partial.mp4');
 await runProcess(['-hide_banner','-loglevel','error','-nostdin','-y','-f','concat','-safe','1','-i',path.join(folder,'concat.txt'),'-i',path.join(folder,'chapters.ffmetadata'),'-map','0:v:0','-map','0:a:0?','-map_metadata','1','-map_chapters','1','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(total),'-movflags','+faststart','-progress','pipe:1',partial],job,value=>update({progress:.95+.049*value}),total);
 fs.renameSync(partial,path.join(folder,'edited-video.mp4'));fs.rmSync(parts,{recursive:true,force:true});update({status:'done',message:'Export ready',progress:1,duration:total});
}

module.exports={cutReport,ffmpegPath,removedRanges,renderEdit,renderPlan,stamp,writeSidecars};
