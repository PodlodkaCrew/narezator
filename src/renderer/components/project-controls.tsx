import {useState} from 'react';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {Input} from './ui/input';
import {TranscriptionSetup} from './transcription';
import type {TranscriptionProvider} from '../electron';
export type WorkspaceInfo=Awaited<ReturnType<Window['narezator']['workspaceInfo']>>;
type Files={videoPath:string;chaptersPath:string;editsPath:string};
export default function ProjectControls({info,welcome=false,prepare}:{info:WorkspaceInfo|null;welcome?:boolean;prepare:()=>Promise<boolean>}){
 const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[title,setTitle]=useState('');
 const [provider,setProvider]=useState<TranscriptionProvider>('elevenlabs'),[keyReady,setKeyReady]=useState(false);
 const [files,setFiles]=useState<Files>({videoPath:'',chaptersPath:'',editsPath:''});
 async function action(run:()=>Promise<{cancelled:boolean}>){
  if(busy)return;setBusy(true);setError('');
  try{if(!await prepare())throw Error('Your edits could not be saved. Retry saving before switching projects.');const result=await run();if(!result.cancelled)location.reload()}
  catch(reason){setError((reason as Error).message)}finally{setBusy(false)}
 }
 async function pick(kind:'video'|'transcript'|'chapters'|'edits',key:keyof Files){
  try{const file=await window.narezator.pickProjectFile(kind);if(file){setFiles(current=>({...current,[key]:file}));if(kind==='video'&&!title)setTitle(file.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/,'')||'New project')}}catch(reason){setError((reason as Error).message)}
 }
 const recent=info?.recent||[];
 const buttons=<><Button disabled={busy} onClick={()=>{setCreating(true);setError('')}}>New Project</Button><Button variant="outline" disabled={busy} onClick={()=>void action(()=>window.narezator.openWorkspace())}>Open Project…</Button>{info?.active&&<Button variant="ghost" disabled={busy} onClick={()=>void action(()=>window.narezator.closeWorkspace())}>Close Project</Button>}</>;
 return <>
  {welcome?<div className="project-welcome"><div className="project-actions">{buttons}</div>{recent.length>0&&<div className="recent-projects"><h2>Recent projects</h2>{recent.map(item=><button key={item.path} disabled={busy} title={item.path} onClick={()=>void action(()=>window.narezator.openWorkspace(item.path))}><strong>{item.title}</strong><small>{item.path}</small></button>)}</div>}</div>:<details className="project-menu"><summary>Project ▾</summary><div>{buttons}{recent.length>0&&<><strong>Recent projects</strong>{recent.map(item=><button disabled={busy} key={item.path} title={item.path} onClick={()=>void action(()=>window.narezator.openWorkspace(item.path))}>{item.title}</button>)}</>}</div></details>}
  {error&&!creating&&<div className="project-message" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  {busy&&!creating&&<div className="project-loading" role="status">Opening project…</div>}
  <Dialog open={creating} onOpenChange={open=>{if(!busy)setCreating(open)}}><DialogContent className="export-dialog new-project-dialog"><DialogHeader><DialogTitle>New project</DialogTitle><DialogDescription>Connect a transcription provider, choose a video, and save your project. The transcript will appear automatically.</DialogDescription></DialogHeader>
   <TranscriptionSetup provider={provider} onProvider={setProvider} onReady={setKeyReady} disabled={busy}/>
   <label className="project-field">Project name<Input value={title} onChange={event=>setTitle(event.target.value)} disabled={busy}/></label>
   {([['Video','video','videoPath'],['Chapters (optional)','chapters','chaptersPath'],['Existing edits (optional)','edits','editsPath']] as const).map(([label,kind,key])=><div className="project-field" key={key}><span>{label}</span><div className="project-file"><span title={files[key]}>{files[key]?.split(/[\\/]/).at(-1)||'No file selected'}</span><Button variant="outline" size="sm" disabled={busy||!keyReady} onClick={()=>void pick(kind,key)}>Choose…</Button>{files[key]&&<button disabled={busy} aria-label={`Clear ${label}`} onClick={()=>setFiles(current=>({...current,[key]:''}))}>×</button>}</div></div>)}
   <p className="export-note">Add a provider API key before choosing your video. Transcription starts after you save the project; progress appears beside the video. Without a chapter file, chapters and summaries can be generated from the transcript using an OpenAI key.</p>
   {error&&<p className="inline-error" role="alert">{error}</p>}
   <div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setCreating(false)}>Cancel</Button><Button disabled={busy||!keyReady||!files.videoPath||!title.trim()} onClick={()=>void action(()=>window.narezator.newWorkspace({...files,title,provider}))}>{busy?'Creating…':'Create project…'}</Button></div>
  </DialogContent></Dialog>
 </>;
}
