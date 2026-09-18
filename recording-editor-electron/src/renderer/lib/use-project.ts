'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {validateProject,type Project,type Recording} from './editor-model';
const DRAFT_KEY='cutroom-electron-draft-v1';

export function useProject(data:Recording|null) {
 const [project,setProject]=useState<Project|null>(null),[status,setStatus]=useState('Loading project…'),[error,setError]=useState('');
 const revision=useRef(0),pending=useRef<Project|null>(null),saving=useRef(false),loaded=useRef(false),mounted=useRef(true);
 const flush=useCallback(async()=>{
  if(saving.current||!pending.current)return;saving.current=true;
  while(pending.current){
   const next=pending.current;pending.current=null;setStatus('Saving…');
   try{const body=await window.cutroom.saveProject({project:next,baseRevision:revision.current});revision.current=body.revision;if(!pending.current){try{localStorage.removeItem(DRAFT_KEY)}catch{};if(mounted.current){setStatus('All edits saved');setError('')}}else try{localStorage.setItem(DRAFT_KEY,JSON.stringify({project:pending.current,baseRevision:revision.current}))}catch{}
   }catch(reason){if(!pending.current)pending.current=next;if(mounted.current){setStatus('Save failed · retry');setError((reason as Error).message)}break}
  }
  saving.current=false;
 },[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{
  if(!data||loaded.current)return;loaded.current=true;
  window.cutroom.loadProject().then(body=>{
   let value=validateProject(body.project,data);revision.current=body.revision||0;
   try{const draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(draft&&draft.baseRevision===revision.current){value=validateProject(draft.project,data);pending.current=value;setStatus('Recovered unsaved edits');setTimeout(flush,0)}else if(draft){setError('A recovery copy exists from another revision.');setStatus('Recovery available')}else setStatus('All edits saved')}catch{setStatus('All edits saved')}setProject(value);
  }).catch(reason=>{setError((reason as Error).message);setStatus('Project unavailable')});
 },[data,flush]);
 const update=useCallback((next:Project)=>{setProject(next);pending.current=next;setStatus('Saving…');try{localStorage.setItem(DRAFT_KEY,JSON.stringify({project:next,baseRevision:revision.current}))}catch{setError('Browser recovery storage is full. Keep this window open until edits are saved.')}void flush()},[flush]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(pending.current||saving.current)event.preventDefault()};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 return {project,update,status,error,flush,hasRecovery:status==='Recovery available'};
}
