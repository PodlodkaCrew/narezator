import {useState} from 'react';
import {Download,MessageSquare,Play,Pencil,Trash2} from 'lucide-react';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {rangeReportEntry,timecode,type Annotation,type Recording,type TimeRange} from '@/lib/editor-model';

type Props={annotations:Annotation[];data:Recording;onOpen:(range:TimeRange)=>void;onEdit:(note:Annotation)=>void;onDelete:(note:Annotation)=>void;onExport:()=>void;onRestore:()=>void;canRestore:boolean};
export function AnnotationsPanel({annotations,data,onOpen,onEdit,onDelete,onExport,onRestore,canRestore}:Props){
 return <>
  <div className="panel-heading"><MessageSquare size={15}/><strong>Annotations</strong><span className="count">{annotations.length}</span></div>
  <div className="annotation-tools"><Button variant="outline" size="sm" disabled={!annotations.length} onClick={onExport}><Download/>Export annotations</Button>{canRestore&&<Button variant="ghost" size="sm" onClick={onRestore}>Undo delete</Button>}</div>
  <div className="annotation-list">
   {!annotations.length&&<div className="reels-empty"><MessageSquare size={28}/><h3>No annotations yet</h3><p>Select transcript text or mark a video range, then choose Annotate.</p></div>}
   {annotations.map((note,index)=><article className="annotation-card" key={note.id}>
    <div className="annotation-card-heading"><span>NOTE {String(index+1).padStart(2,'0')}</span><div><Button variant="ghost" size="icon-xs" aria-label={`Edit annotation ${index+1}`} onClick={()=>onEdit(note)}><Pencil/></Button><Button variant="ghost" size="icon-xs" aria-label={`Delete annotation ${index+1}`} onClick={()=>onDelete(note)}><Trash2/></Button></div></div>
    <small className="annotation-context">{note.context}</small>
    {note.ranges.map((range,part)=>{const entry=rangeReportEntry(range,data.words);return <button className="annotation-range" key={part} onClick={()=>onOpen(range)} title="Open this range in the source recording"><span><Play size={11}/>{timecode(range.start)} → {timecode(range.end)}</span><small>{entry.first}</small><small>… {entry.last}</small></button>})}
    <p className="annotation-text">{note.text}</p>
   </article>)}
  </div>
  <div className="chapter-footnote">Source timestamps · notes stay attached after cuts and moves</div>
 </>;
}
export function AnnotationDialog({note,data,onClose,onSave}:{note:Annotation;data:Recording;onClose:()=>void;onSave:(text:string)=>void}){
 const [text,setText]=useState(note.text);
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className="export-dialog annotation-dialog"><DialogHeader><DialogTitle>Annotate selection</DialogTitle><DialogDescription>{note.context} · {note.ranges.length===1?'Source range':`${note.ranges.length} source ranges in selection order`}</DialogDescription></DialogHeader>
  <div className="annotation-boundaries">{note.ranges.map((range,index)=>{const entry=rangeReportEntry(range,data.words);return <div key={index}><p>{timecode(range.start)} – {entry.first}</p><p>{timecode(range.end)} – {entry.last}</p></div>})}</div>
  <label className="project-field">Annotation<textarea autoFocus aria-label="Annotation text" placeholder="Write a note for the editor…" value={text} onChange={event=>setText(event.target.value)} rows={6}/></label>
  <p className="export-note">Your note is saved with this project. It does not change the video or reels.</p>
  <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!text.trim()} onClick={()=>onSave(text)}>Save annotation</Button></div>
 </DialogContent></Dialog>;
}
