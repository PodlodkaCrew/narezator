'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createProject,validateProject,type Project,type Recording} from './editor-model';
const DRAFT_KEY='cutroom-video.mp4-draft-v1';
export function useProject(data:Recording|null) {
 const [project,setProject]=useState<Project|null>(null);
 const [status,setStatus]=useState('Loading project…');
 const [error,setError]=useState('');
 const revision=useRef(0),pending=useRef<Project|null>(null),saving=useRef(false),loaded=useRef(false);
 const mounted=useRef(true);
 const flush=useCallback(async()=>{
  if(saving.current||!pending.current)return;
  saving.current=true;
  while(pending.current){
   const next=pending.current;pending.current=null;setStatus('Saving…');
   try {
    const r=await fetch('/api/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:next,baseRevision:revision.current})});
    const body=await r.json() as {revision:number;project?:Project;error?:string};if(!r.ok)throw Error(body.error||'Cannot save the project.');
    revision.current=body.revision;
    if(!pending.current){try{localStorage.removeItem(DRAFT_KEY)}catch{};if(mounted.current){setStatus('All edits saved');setError('')}}
    else {try{localStorage.setItem(DRAFT_KEY,JSON.stringify({project:pending.current,baseRevision:revision.current}))}catch{}}
   }catch(e){
    if(!pending.current)pending.current=next;
    if(mounted.current){setStatus('Save failed · retry');setError((e as Error).message)}
    break;
   }
  }
  saving.current=false;
 },[]);
 useEffect(()=>{
  mounted.current=true;return()=>{mounted.current=false};
 },[]);
 useEffect(()=>{
  if(!data||loaded.current)return;loaded.current=true;
  fetch('/api/project').then(async r=>{const body=await r.json() as {revision:number;project?:Project;error?:string};if(!r.ok)throw Error(body.error||'Cannot load saved edits');return body}).then(body=>{
   let p=body.project?validateProject(body.project,data):createProject(data);
   revision.current=body.revision||0;
   try{
    const draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
    if(draft&&draft.baseRevision===revision.current){p=validateProject(draft.project,data);pending.current=p;setStatus('Recovered unsaved edits');setTimeout(flush,0)}
    else if(draft){setError('A browser recovery copy exists from another revision. Download recovery before reloading.');setStatus('Recovery available')}
    else setStatus('All edits saved');
   }catch{setStatus('All edits saved')}
   setProject(p);
  }).catch(e=>{setError(e.message);setStatus('Project unavailable')});
 },[data,flush]);
 const update=useCallback((next:Project)=>{
  setProject(next);pending.current=next;setStatus('Saving…');
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify({project:next,baseRevision:revision.current}))}catch{setError('Browser recovery storage is full. Keep this page open until edits are saved.')}
  void flush();
 },[flush]);
 useEffect(()=>{
  const warn=(e:BeforeUnloadEvent)=>{if(pending.current||saving.current){e.preventDefault()}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[]);
 return {project,update,status,error,flush,hasRecovery:status==='Recovery available'};
}
