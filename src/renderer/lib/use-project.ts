'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {validateProject,type Project,type Recording} from './editor-model';

export function useProject(data:Recording|null) {
 const [project,setProject]=useState<Project|null>(null),[status,setStatus]=useState('Loading project…'),[error,setError]=useState('');
 const revision=useRef(0),pending=useRef<Project|null>(null),saving=useRef<Promise<boolean>|null>(null),loaded=useRef(false),mounted=useRef(true),identity=useRef(''),draftKey=useRef('');
 const flush=useCallback(():Promise<boolean>=>{
  if(saving.current)return saving.current;
  const run=async()=>{
   while(pending.current){
    const next=pending.current;pending.current=null;setStatus('Saving…');
    try{
     const body=await window.narezator.saveProject({project:next,baseRevision:revision.current,projectId:identity.current});revision.current=body.revision;
     if(!pending.current){try{localStorage.removeItem(draftKey.current)}catch{};if(mounted.current){setStatus('All edits saved');setError('')}}
     else try{localStorage.setItem(draftKey.current,JSON.stringify({project:pending.current,baseRevision:revision.current}))}catch{}
    }catch(reason){if(!pending.current)pending.current=next;if(mounted.current){setStatus('Save failed · retry');setError((reason as Error).message)}return false}
   }
   return true;
  };
  saving.current=run().finally(()=>{saving.current=null});return saving.current;
 },[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{
  if(!data||loaded.current)return;loaded.current=true;
  window.narezator.loadProject().then(body=>{
   let value=validateProject(body.project,data);revision.current=body.revision||0;identity.current=body.projectId;
   draftKey.current=body.projectId==='legacy'?'cutroom-electron-draft-v1':`cutroom-electron-draft-${body.projectId}`;
   try{const draft=JSON.parse(localStorage.getItem(draftKey.current)||'null');if(draft&&draft.baseRevision===revision.current){value=validateProject(draft.project,data);pending.current=value;setStatus('Recovered unsaved edits');setTimeout(flush,0)}else if(draft){setError('A recovery copy exists from another revision.');setStatus('Recovery available')}else setStatus('All edits saved')}catch{setStatus('All edits saved')}setProject(value);
  }).catch(reason=>{setError((reason as Error).message);setStatus('Project unavailable')});
 },[data,flush]);
 const update=useCallback((next:Project)=>{setProject(next);pending.current=next;setStatus('Saving…');try{localStorage.setItem(draftKey.current,JSON.stringify({project:next,baseRevision:revision.current}))}catch{setError('Recovery storage is full. Keep this window open until edits are saved.')}void flush()},[flush]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(pending.current||saving.current)event.preventDefault()};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 const recoveryText=()=>localStorage.getItem(draftKey.current)||'';
 return {project,update,status,error,flush,recoveryText,hasRecovery:status==='Recovery available'};
}
