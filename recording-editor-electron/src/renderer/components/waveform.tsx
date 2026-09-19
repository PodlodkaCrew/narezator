'use client';
/* eslint-disable jsx-a11y/prefer-tag-over-role -- This keyboard-accessible waveform supports both scrubbing and two-boundary range selection. */
import {memo,useMemo,useRef,useState} from 'react';
import {atEditTime,duration,type Clip,type TimeRange,type ViewMode,timecode} from '@/lib/editor-model';
interface Props {peaks:number[];clips:Clip[];mode:ViewMode;sourceDuration:number;time:number;range:TimeRange|null;onSeek:(t:number)=>void;onRange:(r:TimeRange|null)=>void}
export default memo(function Waveform({peaks,clips,mode,sourceDuration,time,range,onSeek,onRange}:Props){
 const box=useRef<HTMLDivElement>(null),start=useRef<{time:number;x:number}|null>(null);const [drag,setDrag]=useState<TimeRange|null>(null);
 const total=mode==='source'?sourceDuration:duration(clips);
 const bars=useMemo(()=>Array.from({length:360},(_,i)=>{
  const t=i/360*total;const source=mode==='source'?t:atEditTime(clips,t)?.source||0;
  return Math.max(.035,peaks[Math.min(peaks.length-1,Math.floor(source/2))]||0);
 }),[peaks,clips,mode,total]);
 const percent=(t:number)=>total?Math.max(0,Math.min(100,t/total*100)):0;
 function position(x:number){const bounds=box.current!.getBoundingClientRect();return Math.max(0,Math.min(total,(x-bounds.left)/bounds.width*total))}
 const selected=drag||range;
 return <div className="waveform-block"><div ref={box} className="waveform" role="slider" tabIndex={0} aria-label="Recording waveform. Drag to select a range." aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(time,total)} aria-valuetext={timecode(time)}
 onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();onSeek(Math.max(0,Math.min(total,time+(e.key==='ArrowLeft'?-1:1))))}}}
 onPointerDown={e=>{if(!total)return;e.currentTarget.setPointerCapture(e.pointerId);start.current={time:position(e.clientX),x:e.clientX}}}
 onPointerMove={e=>{if(start.current&&Math.abs(e.clientX-start.current.x)>4)setDrag({start:start.current.time,end:position(e.clientX)})}}
 onPointerUp={e=>{if(!start.current)return;if(Math.abs(e.clientX-start.current.x)>4)onRange({start:Math.min(start.current.time,position(e.clientX)),end:Math.max(start.current.time,position(e.clientX))});else{onRange(null);onSeek(position(e.clientX))}start.current=null;setDrag(null)}}
 onPointerCancel={()=>{start.current=null;setDrag(null)}}>
 <svg viewBox="0 0 1080 60" preserveAspectRatio="none" aria-hidden="true">{bars.map((v,i)=><rect key={i} x={i*3} y={30-v*26} width="1.5" height={Math.max(2,v*52)} rx=".6" fill={i/360<=time/(total||1)?'var(--ink)':'var(--slate)'}/>)}</svg>
 {selected&&<div className="wave-selection" style={{left:percent(Math.min(selected.start,selected.end))+'%',width:percent(Math.max(selected.start,selected.end))-percent(Math.min(selected.start,selected.end))+'%'}}/>}
 <div className="wave-playhead" style={{left:percent(time)+'%'}}/>
 </div><div className="wave-labels"><span>00:00:00</span><span>Drag waveform to select</span><span>{timecode(total)}</span></div></div>;
});
