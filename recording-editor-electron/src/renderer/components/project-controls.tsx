import {useState} from 'react';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {Input} from './ui/input';
export type WorkspaceInfo=Awaited<ReturnType<Window['cutroom']['workspaceInfo']>>;
type Files={videoPath:string;transcriptPath:string;chaptersPath:string;editsPath:string};
export default function ProjectControls({info,welcome=false,prepare}:{info:WorkspaceInfo|null;welcome?:boolean;prepare:()=>Promise<boolean>}){
 const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[title,setTitle]=useState('');
 const [files,setFiles]=useState<Files>({videoPath:'',transcriptPath:'',chaptersPath:'',editsPath:''});
 async function action(run:()=>Promise<{cancelled:boolean}>){
  if(busy)return;setBusy(true);setError('');
  try{if(!await prepare())throw Error('Your edits could not be saved. Retry saving before switching projects.');const result=await run();if(!result.cancelled)location.reload()}
  catch(reason){setError((reason as Error).message)}finally{setBusy(false)}
 }
 async function pick(kind:'video'|'transcript'|'chapters'|'edits',key:keyof Files){
  try{const file=await window.cutroom.pickProjectFile(kind);if(file){setFiles(current=>({...current,[key]:file}));if(kind==='video'&&!title)setTitle(file.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/,'')||'New project')}}catch(reason){setError((reason as Error).message)}
 }
 const recent=info?.recent||[];
 const buttons=<><Button disabled={busy} onClick={()=>{setCreating(true);setError('')}}>New Project</Button><Button variant="outline" disabled={busy} onClick={()=>void action(()=>window.cutroom.openWorkspace())}>Open Project…</Button><Button variant="outline" disabled={busy} onClick={()=>void action(()=>window.cutroom.importWebProject())}>Import Web Project…</Button>{info?.active&&<Button variant="ghost" disabled={busy} onClick={()=>void action(()=>window.cutroom.closeWorkspace())}>Close Project</Button>}</>;
 return <>
  {welcome?<div className="project-welcome"><div className="project-actions">{buttons}</div>{recent.length>0&&<div className="recent-projects"><h2>Recent projects</h2>{recent.map(item=><button key={item.path} disabled={busy} title={item.path} onClick={()=>void action(()=>window.cutroom.openWorkspace(item.path))}><strong>{item.title}</strong><small>{item.path}</small></button>)}</div>}</div>:<details className="project-menu"><summary>Project ▾</summary><div>{buttons}{recent.length>0&&<><strong>Recent projects</strong>{recent.map(item=><button disabled={busy} key={item.path} title={item.path} onClick={()=>void action(()=>window.cutroom.openWorkspace(item.path))}>{item.title}</button>)}</>}</div></details>}
  {error&&!creating&&<div className="project-message" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  {busy&&!creating&&<div className="project-loading" role="status">Opening project…</div>}
  <Dialog open={creating} onOpenChange={open=>{if(!busy)setCreating(open)}}><DialogContent className="export-dialog new-project-dialog"><DialogHeader><DialogTitle>New project</DialogTitle><DialogDescription>Choose a video, add its transcript and chapters, then choose where to save the project.</DialogDescription></DialogHeader>
   <label className="project-field">Project name<Input value={title} onChange={event=>setTitle(event.target.value)} disabled={busy}/></label>
   {([['Video','video','videoPath'],['Transcript (optional)','transcript','transcriptPath'],['Chapters (optional)','chapters','chaptersPath'],['Existing edits (optional)','edits','editsPath']] as const).map(([label,kind,key])=><div className="project-field" key={key}><span>{label}</span><div className="project-file"><span title={files[key]}>{files[key]?.split(/[\\/]/).at(-1)||'No file selected'}</span><Button variant="outline" size="sm" disabled={busy} onClick={()=>void pick(kind,key)}>Choose…</Button>{files[key]&&<button disabled={busy} aria-label={`Clear ${label}`} onClick={()=>setFiles(current=>({...current,[key]:''}))}>×</button>}</div></div>)}
   <p className="export-note">Transcripts: word-timed JSON, SRT or VTT. Subtitle word timings are estimated within each cue. Chapters: JSON or text/Markdown with timestamps; questions without timestamps can be marked in the editor. Without a transcript, you can edit using video and in/out marks.</p>
   {error&&<p className="inline-error" role="alert">{error}</p>}
   <div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setCreating(false)}>Cancel</Button><Button disabled={busy||!files.videoPath||!title.trim()} onClick={()=>void action(()=>window.cutroom.newWorkspace({...files,title}))}>{busy?'Creating…':'Create project…'}</Button></div>
  </DialogContent></Dialog>
 </>;
}
