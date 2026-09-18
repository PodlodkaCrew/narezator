#!/usr/bin/env python3
"""Loopback-only editor with byte-range media, atomic persistence, and FFmpeg export."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote
from datetime import datetime, timezone
import argparse
import copy
import json
import math
import mimetypes
import os
import re
import threading
import uuid
from exporter import render_edit

APP=Path(__file__).resolve().parent
ROOT=APP.parent
RECORDING=json.loads((APP/'public/recording.json').read_text())
DATA_DIR=ROOT/'edits'
EXPORT_DIR=ROOT/'exports'
PROJECT_FILE=DATA_DIR/'recording.edits.json'
PROJECT_LOCK=threading.Lock()
JOBS={}
JOB_LOCK=threading.Lock()
STATIC=APP/'local-dist'

def initial_project():
    return dict(version=1,source='video.mp4',duration=RECORDING['duration'],revision=0,clips=RECORDING['initialClips'],chapters=RECORDING['chapters'],events=[],undo=[],redo=[],reels=[])

def finite_number(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def validate_project(p):
    if not isinstance(p,dict) or p.get('version')!=1 or p.get('source')!='video.mp4' or not finite_number(p.get('duration')) or abs(p['duration']-RECORDING['duration'])>.1:
        raise ValueError('Project does not match this recording.')
    def clips(value):
        if not isinstance(value,list) or len(value)>2000: raise ValueError('Invalid project contents.')
        ids=set()
        for c in value:
            if not isinstance(c,dict) or not isinstance(c.get('id'),str) or len(c['id'])>200 or c['id'] in ids or not isinstance(c.get('label'),str) or len(c['label'])>2000: raise ValueError('Invalid clip.')
            if not finite_number(c.get('start')) or not finite_number(c.get('end')) or c['start']<0 or c['end']>RECORDING['duration']+.001 or c['end']-c['start']<.00001: raise ValueError('Invalid clip boundaries.')
            ids.add(c['id'])
    def events(value):
        if not isinstance(value,list) or len(value)>100000: raise ValueError('Invalid edit history.')
        for e in value:
            if not isinstance(e,dict) or not all(isinstance(e.get(k),str) for k in ['id','at','type','label']): raise ValueError('Invalid history entry.')
    def snapshot(s):
        if not isinstance(s,dict) or not isinstance(s.get('chapters'),list): raise ValueError('Invalid project contents.')
        clips(s.get('clips'))
        expected={c['id'] for c in RECORDING['chapters']}
        if len(s['chapters'])!=len(expected): raise ValueError('Invalid chapters.')
        seen=set()
        for c in s['chapters']:
            if not isinstance(c,dict) or c.get('id') not in expected or c['id'] in seen: raise ValueError('Invalid chapter.')
            if c.get('start') is not None and (not finite_number(c['start']) or not 0<=c['start']<RECORDING['duration']): raise ValueError('Invalid chapter position.')
            if not isinstance(c.get('title'),str) or not isinstance(c.get('question'),str): raise ValueError('Invalid chapter text.')
            seen.add(c['id'])
    snapshot(p)
    for name in ['undo','redo']:
        if not isinstance(p.get(name),list) or len(p[name])>75: raise ValueError('Invalid undo history.')
        for state in p[name]: snapshot(state)
    events(p.get('events'))
    if 'reels' not in p:p['reels']=[]
    if not isinstance(p['reels'],list) or len(p['reels'])>500: raise ValueError('Invalid reels.')
    reel_ids=set()
    for reel in p['reels']:
        if not isinstance(reel,dict) or not isinstance(reel.get('id'),str) or reel['id'] in reel_ids or not isinstance(reel.get('title'),str) or not reel['title'].strip() or not isinstance(reel.get('createdAt'),str): raise ValueError('Invalid reel.')
        reel_ids.add(reel['id']);clips(reel.get('clips'));events(reel.get('events'))
        for name in ['undo','redo']:
            if not isinstance(reel.get(name),list) or len(reel[name])>75: raise ValueError('Invalid reel history.')
            for state in reel[name]:
                if not isinstance(state,dict): raise ValueError('Invalid reel history.')
                clips(state.get('clips'))
    return p

def project_events(project):
    return project['events']+[event for reel in project.get('reels',[]) for event in reel['events']]

def atomic_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+'.tmp')
    with tmp.open('w') as out:
        json.dump(value,out,ensure_ascii=False,indent=2,allow_nan=False);out.write('\n');out.flush();os.fsync(out.fileno())
    os.replace(tmp,path)

def load_project():
    if not PROJECT_FILE.exists():
        p=initial_project();atomic_json(PROJECT_FILE,p);return p
    return validate_project(json.loads(PROJECT_FILE.read_text()))

def update_job(job_id,**fields):
    with JOB_LOCK:
        JOBS[job_id].update(fields)
        public={k:v for k,v in JOBS[job_id].items() if k!='cancel'}
    atomic_json(EXPORT_DIR/job_id/'status.json',public)

def perform_export(job_id,project,burn,height,title):
    try:
        recording={**RECORDING,'title':title}
        render_edit(ROOT/'video.mp4',EXPORT_DIR/job_id,project,recording,burn,height,lambda **kw:update_job(job_id,**kw),JOBS[job_id]['cancel'])
    except Exception as exc:
        update_job(job_id,status='cancelled' if JOBS[job_id]['cancel'].is_set() else 'error',message=str(exc))

class Handler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,fmt,*args):
        if '/api/media' not in (args[0] if args else ''):super().log_message(fmt,*args)
    def json_response(self,value,status=200):
        payload=json.dumps(value,ensure_ascii=False,allow_nan=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.send_header('Cache-Control','no-store');self.end_headers()
        if self.command!='HEAD':self.wfile.write(payload)
    def safe_origin(self):
        host=self.headers.get('Host','').split(':')[0]
        origin=self.headers.get('Origin')
        return host in ('127.0.0.1','localhost') and (not origin or urlparse(origin).hostname in ('127.0.0.1','localhost'))
    def file_response(self,path,attachment=False):
        if not path.is_file():self.json_response({'error':'File not found'},404);return
        size=path.stat().st_size;start,end=0,size-1;header=self.headers.get('Range')
        if header:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',header)
            invalid=not match or not (match[1] or match[2])
            if not invalid:
                if match[1]:start=int(match[1]);end=min(int(match[2]),end) if match[2] else end
                else:start=max(0,size-int(match[2]))
                invalid=start>end or start>=size
            if invalid:
                self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return
        self.send_response(206 if header else 200)
        self.send_header('Content-Type',mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes')
        self.send_header('X-Content-Type-Options','nosniff')
        if path.suffix in ('.html','.json'):self.send_header('Cache-Control','no-cache')
        if header:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        if attachment:self.send_header('Content-Disposition',f'attachment; filename="{path.name}"')
        self.end_headers()
        if self.command=='HEAD':return
        try:
            with path.open('rb') as stream:
                stream.seek(start);remaining=end-start+1
                while remaining:
                    block=stream.read(min(1024*1024,remaining))
                    if not block:break
                    self.wfile.write(block);remaining-=len(block)
        except (BrokenPipeError,ConnectionResetError):pass
    def do_HEAD(self):self.do_GET()
    def do_GET(self):
        try:
            if not self.safe_origin():self.json_response({'error':'Local access only.'},403);return
            route=urlparse(self.path).path
            if route=='/api/project':
                with PROJECT_LOCK:p=load_project()
                self.json_response({'project':p,'revision':p['revision']});return
            if route=='/api/media-info':
                self.json_response({'burnedIn':(ROOT/'.editor-cache/review.mp4').is_file(),'source':'video.mp4','duration':RECORDING['duration']});return
            if route=='/api/media':
                self.file_response(ROOT/'video.mp4' if 'original=1' in self.path or not (ROOT/'.editor-cache/review.mp4').is_file() else ROOT/'.editor-cache/review.mp4');return
            if route=='/api/waveform':
                path=APP/'public/waveform.json'
                if path.exists():self.file_response(path)
                else:self.json_response({'peaks':[]})
                return
            if route=='/api/export':
                with JOB_LOCK:jobs=[{k:v for k,v in j.items() if k!='cancel'} for j in JOBS.values()]
                self.json_response({'jobs':jobs});return
            match=re.fullmatch(r'/api/export/([a-f0-9-]{36})(?:/(.+))?',route)
            if match:
                job_id,filename=match.groups();folder=EXPORT_DIR/job_id
                if filename:
                    if filename not in ('edited-video.mp4','project.json','edit-list.json','cut-report.md','transcript.txt','subtitles.srt'):self.json_response({'error':'File not found'},404);return
                    self.file_response(folder/filename,True)
                elif (folder/'status.json').exists():self.file_response(folder/'status.json')
                else:self.json_response({'error':'Export not found'},404)
                return
            relative=unquote(route).lstrip('/') or 'index.html'
            path=(STATIC/relative).resolve()
            if not path.is_relative_to(STATIC.resolve()):self.json_response({'error':'Not found'},404);return
            if route=='/recording.json':path=APP/'public/recording.json'
            self.file_response(path)
        except (ValueError,json.JSONDecodeError) as exc:self.json_response({'error':str(exc)},400)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as exc:self.json_response({'error':str(exc)},500)
    def do_POST(self):
        try:
            if not self.safe_origin():self.json_response({'error':'Local access only.'},403);return
            if 'application/json' not in self.headers.get('Content-Type',''):self.json_response({'error':'Expected JSON.'},415);return
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>32*1024*1024:self.json_response({'error':'Invalid request size.'},413);return
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict):raise ValueError('Invalid request.')
            route=urlparse(self.path).path
            if route=='/api/project':
                p=copy.deepcopy(validate_project(body.get('project')))
                with PROJECT_LOCK:
                    previous=load_project()
                    if body.get('baseRevision')!=previous['revision']:
                        self.json_response({'error':'Edits changed in another window. Download your project backup, then reload before continuing.'},409);return
                    p['revision']=previous['revision']+1;p['savedAt']=datetime.now(timezone.utc).isoformat()
                    atomic_json(DATA_DIR/'recording.edits.previous.json',previous)
                    atomic_json(PROJECT_FILE,p)
                    seen={e['id'] for e in project_events(previous)}
                    with (DATA_DIR/'history.jsonl').open('a') as log:
                        for event in project_events(p):
                            if event['id'] not in seen:log.write(json.dumps({**event,'revision':p['revision']},ensure_ascii=False)+'\n')
                        log.flush();os.fsync(log.fileno())
                self.json_response({'revision':p['revision']});return
            if route=='/api/export':
                p=copy.deepcopy(validate_project(body.get('project')))
                if not p['clips']:raise ValueError('Add a clip before exporting.')
                height=body.get('height',1080)
                if height not in (720,1080):raise ValueError('Unsupported export size.')
                title=body.get('title') or RECORDING['title']
                if not isinstance(title,str) or not title.strip() or len(title)>500:raise ValueError('Invalid export title.')
                kind=body.get('kind','main')
                if kind not in ('main','reel'):raise ValueError('Invalid export kind.')
                with JOB_LOCK:
                    if any(j['status'] in ('queued','rendering') for j in JOBS.values()):self.json_response({'error':'An export is already running.'},409);return
                    job_id=str(uuid.uuid4());JOBS[job_id]={'id':job_id,'status':'queued','progress':0,'message':'Preparing reel' if kind=='reel' else 'Preparing export','kind':kind,'title':title.strip(),'cancel':threading.Event()}
                update_job(job_id)
                threading.Thread(target=perform_export,args=(job_id,p,body.get('burn',True) is not False,height,title.strip()),daemon=True).start()
                self.json_response({'id':job_id},202);return
            match=re.fullmatch(r'/api/export/([a-f0-9-]{36})/cancel',route)
            if match:
                with JOB_LOCK:
                    job=JOBS.get(match[1])
                    if job:job['cancel'].set()
                self.json_response({'ok':bool(job)});return
            self.json_response({'error':'Not found'},404)
        except (ValueError,TypeError,KeyError) as exc:self.json_response({'error':str(exc)},400)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as exc:self.json_response({'error':str(exc)},500)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8766);args=parser.parse_args()
    with PROJECT_LOCK:load_project()
    if EXPORT_DIR.exists():
        for status_file in EXPORT_DIR.glob('*/status.json'):
            try:
                job=json.loads(status_file.read_text())
                if job['status'] in ('queued','rendering'):job.update(status='error',message='Export interrupted when the editor stopped. Start a new export.')
                job['cancel']=threading.Event();JOBS[job['id']]=job
            except (ValueError,KeyError):pass
    print(f'Cutroom: http://127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
