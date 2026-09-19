import type {Project,Recording} from './lib/editor-model';

export interface ElectronExportJob {id:string;status:string;progress:number;message:string;kind?:'main'|'reel'|'reels';title?:string;duration?:number;outputFolder?:string;completed?:number;total?:number;skipped?:number}
interface NarezatorElectronApi {
 mediaUrl:string;
 captionsUrl:string;
 workspaceInfo:()=>Promise<{active:boolean;projectId:string|null;title:string|null;manifestPath:string|null;recent:{path:string;title:string;id:string}[]}>;
 pickProjectFile:(kind:'video'|'transcript'|'chapters'|'edits')=>Promise<string|null>;
 newWorkspace:(options:{videoPath:string;title:string;transcriptPath?:string;chaptersPath?:string;editsPath?:string})=>Promise<{cancelled:boolean}>;
 openWorkspace:(file?:string)=>Promise<{cancelled:boolean}>;
 importWebProject:()=>Promise<{cancelled:boolean}>;
 closeWorkspace:()=>Promise<{cancelled:boolean}>;
 loadRecording:()=>Promise<Recording>;
 loadWaveform:()=>Promise<{peaks:number[]}>;
 mediaInfo:()=>Promise<{burnedIn:boolean;source:string;duration:number;url:string}>;
 loadProject:()=>Promise<{project:Project;revision:number;projectId:string}>;
 saveProject:(payload:{project:Project;baseRevision:number;projectId:string})=>Promise<{revision:number}>;
 saveText:(payload:{suggestedName:string;text:string})=>Promise<{cancelled:boolean;filePath?:string}>;
 listExports:()=>Promise<{jobs:ElectronExportJob[]}>;
 getExport:(id:string)=>Promise<ElectronExportJob>;
 startExport:(payload:{project:Project;burn:boolean;height:number;title:string;kind:'main'|'reel'})=>Promise<ElectronExportJob>;
 startReelsExport:(payload:{project:Project;burn:boolean;height:number})=>Promise<ElectronExportJob|null>;
 cancelExport:(id:string)=>Promise<{ok:boolean}>;
 saveExportFile:(id:string,name:string)=>Promise<{cancelled:boolean;filePath?:string}>;
 revealExport:(id:string)=>Promise<{ok:boolean}>;
}

declare global {interface Window {narezator:NarezatorElectronApi}}
export {};
