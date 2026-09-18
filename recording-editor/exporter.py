"""Render the edit decision list without ever modifying video.mp4."""
from pathlib import Path
import json
import math
import platform
import re
import shutil
import subprocess
import threading

FPS = 30
FONT = '/System/Library/Fonts/Menlo.ttc'

def stamp(seconds, millis=False):
    ms=round(max(0,seconds)*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}'+(f'.{ms%1000:03}' if millis else '')

def render_plan(clips):
    offset=0.0
    plan=[]
    for clip in clips:
        frames=max(1,math.floor((clip['end']-clip['start'])*FPS+.5))
        length=frames/FPS
        plan.append({**clip,'outputStart':offset,'outputEnd':offset+length,'renderDuration':length})
        offset+=length
    return plan

def timestamp_filter(start=0):
    font=f'fontfile={FONT}:' if Path(FONT).is_file() else ''
    return (f"drawtext={font}text='SOURCE %{{pts\\:hms\\:{start:.6f}}}':"
            'x=24:y=h-th-24:fontsize=h/30:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=10')

def video_encoder():
    return ['-c:v','h264_videotoolbox','-b:v','6000k'] if platform.system()=='Darwin' else ['-c:v','libx264','-preset','fast','-crf','20']

def run_process(command, cancel, progress=None, expected=0):
    with subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) as process:
        errors=[]
        def read_errors():
            for line in process.stderr:
                errors.append(line)
                if len(errors)>80: del errors[0]
        error_reader=threading.Thread(target=read_errors,daemon=True);error_reader.start()
        def watch_cancel():
            while process.poll() is None:
                if cancel.wait(.25):
                    if process.poll() is None: process.terminate()
                    return
        threading.Thread(target=watch_cancel,daemon=True).start()
        for line in process.stdout:
            if line.startswith('out_time_us=') and progress and expected:
                try: progress(min(1,float(line.strip().split('=')[1])/1000000/expected))
                except ValueError: pass
        code=process.wait();error_reader.join()
        if cancel.is_set(): raise RuntimeError('Export cancelled.')
        if code: raise RuntimeError('Video rendering failed: '+''.join(errors[-8:])[-1500:])

def escape_metadata(text):
    return str(text).replace('\\','\\\\').replace('=','\\=').replace(';','\\;').replace('#','\\#').replace('\n',' ')

def removed_ranges(clips, source_duration):
    retained=sorted((max(0,min(source_duration,c['start'])),max(0,min(source_duration,c['end']))) for c in clips if c['end']-c['start']>.00001)
    merged=[]
    for start,end in retained:
        if merged and start<=merged[-1][1]+.00001: merged[-1][1]=max(merged[-1][1],end)
        else: merged.append([start,end])
    cuts=[];cursor=0
    for start,end in merged:
        if start-cursor>.00001: cuts.append((cursor,start))
        cursor=max(cursor,end)
    if source_duration-cursor>.00001: cuts.append((cursor,source_duration))
    return cuts

def phrase_end(text):
    return re.search(r'[.!?…](?:["\'»”\])}]+)?$',text.strip()) is not None

def first_phrase(words):
    selected=[]
    for word in words[:12]:
        selected.append(word)
        if len(selected)>=2 and phrase_end(word['text']): break
    return ' '.join(w['text'].strip() for w in selected)

def last_phrase(words):
    start=max(0,len(words)-12)
    for index in range(len(words)-2,start-1,-1):
        if phrase_end(words[index]['text']):
            start=index+1;break
    return ' '.join(w['text'].strip() for w in words[start:])

def cut_report_markdown(clips,recording):
    cuts=removed_ranges(clips,recording['duration'])
    removed=sum(end-start for start,end in cuts)
    lines=[
        f"# Монтажный лист: {recording['title']}",'',
        f"Источник: `{recording['source']}`  ",
        f'Вырезано фрагментов: {len(cuts)}  ',
        f'Общая длительность вырезанных фрагментов: {stamp(removed)}  ',
        'Все таймкоды относятся к исходной записи.','',
    ]
    if not cuts: lines.extend(['_В текущей версии нет вырезанных фрагментов._',''])
    for number,(start,end) in enumerate(cuts,1):
        words=[w for w in recording['words'] if w['text'].strip() and w['start']<end-.00001 and w['end']>start+.00001]
        if not words: first=last='(нет распознанной речи)'
        elif end-start<=3: first=words[0]['text'].strip();last=words[-1]['text'].strip()
        else: first=first_phrase(words);last=last_phrase(words)
        lines.extend([f'## Вырезанный фрагмент {number:02}','',f'{stamp(start)} – {first}',f'{stamp(end)} – {last}',''])
    return '\n'.join(lines)

def write_sidecars(folder,project,recording,plan):
    (folder/'project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'edit-list.json').write_text(json.dumps({'title':recording['title'],'source':'video.mp4','timestampBasis':'original source seconds','fps':FPS,'clips':plan},ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'cut-report.md').write_text(cut_report_markdown(project['clips'],recording),encoding='utf-8')
    lines=[';FFMETADATA1',f"title={escape_metadata(recording['title'])}"]
    transcript=['Edited transcript · source and edit timestamps','']
    srt=[]; cue=1
    for clip in plan:
        lines.extend(['[CHAPTER]','TIMEBASE=1/1000',f"START={round(clip['outputStart']*1000)}",f"END={round(clip['outputEnd']*1000)}",f"title={escape_metadata(clip['label'])}"])
        words=[w for w in recording['words'] if w['end']>clip['start'] and w['start']<clip['end']]
        group=[]
        def write_group(group):
            nonlocal cue
            if not group:return
            start=clip['outputStart']+max(0,group[0]['start']-clip['start'])
            end=min(clip['outputEnd'],clip['outputStart']+group[-1]['end']-clip['start'])
            if end<=start:return
            text=' '.join(w['text'] for w in group)
            transcript.append(f"[{stamp(start,True)}] [source {stamp(group[0]['start'],True)}] Speaker {group[0]['speaker']}\n{text}\n")
            srt.extend([str(cue),f"{stamp(start,True).replace('.',',')} --> {stamp(end,True).replace('.',',')}",text,'']);cue+=1
        for word in words:
            if group and (word['speaker']!=group[0]['speaker'] or word['start']-group[0]['start']>5 or len(group)>=18):
                write_group(group);group=[]
            group.append(word)
        write_group(group)
    (folder/'chapters.ffmetadata').write_text('\n'.join(lines)+'\n')
    (folder/'transcript.txt').write_text('\n'.join(transcript))
    (folder/'subtitles.srt').write_text('\n'.join(srt))

def render_edit(source,folder,project,recording,burn=True,height=1080,update=lambda **kw:None,cancel=None):
    cancel=cancel or threading.Event()
    if not shutil.which('ffmpeg'): raise RuntimeError('ffmpeg is required to export the video.')
    plan=render_plan(project['clips'])
    if not plan: raise ValueError('The edit has no clips to export.')
    folder.mkdir(parents=True,exist_ok=True)
    parts=folder/'parts';parts.mkdir(exist_ok=True)
    total=sum(c['renderDuration'] for c in plan)
    write_sidecars(folder,project,recording,plan)
    concat=[];done=0
    for index,clip in enumerate(plan):
        if cancel.is_set(): raise RuntimeError('Export cancelled.')
        length=clip['renderDuration'];part=parts/f'{index:05}.mkv'
        update(status='rendering',message=f'Rendering clip {index+1} of {len(plan)}',progress=done/total*.95)
        vf=f"scale=-2:{height},fps={FPS},tpad=stop_mode=clone:stop_duration=0.1,trim=duration={length:.9f},setpts=PTS-STARTPTS"
        if burn:vf+=','+timestamp_filter(clip['start'])
        af=f'asetpts=PTS-STARTPTS,apad,atrim=duration={length:.9f}'
        cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-ss',str(clip['start']),'-i',str(source),'-t',f'{length:.9f}',
             '-map','0:v:0','-map','0:a:0','-vf',vf,'-af',af,*video_encoder(),'-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000','-ac','2',
             '-progress','pipe:1',str(part)]
        run_process(cmd,cancel,lambda value:update(progress=(done+length*value)/total*.95),length)
        concat.extend([f"file 'parts/{part.name}'",f'duration {length:.9f}']);done+=length
    (folder/'concat.txt').write_text('\n'.join(concat)+'\n')
    update(status='rendering',message='Joining clips and writing the MP4',progress=.95)
    output=folder/'edited-video.partial.mp4'
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-f','concat','-safe','1','-i',str(folder/'concat.txt'),'-i',str(folder/'chapters.ffmetadata'),
         '-map','0:v:0','-map','0:a:0','-map_metadata','1','-map_chapters','1','-c:v','copy','-c:a','aac','-b:a','192k','-t',str(total),'-movflags','+faststart','-progress','pipe:1',str(output)]
    run_process(cmd,cancel,lambda value:update(progress=.95+.049*value),total)
    output.rename(folder/'edited-video.mp4')
    shutil.rmtree(parts)
    update(status='done',message='Export ready',progress=1,duration=total)
