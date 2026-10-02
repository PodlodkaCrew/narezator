import type {Project,Recording,Chapter,ChapterSummary} from './lib/editor-model';

export interface ElectronExportJob {id:string;status:string;progress:number;message:string;kind?:'main'|'reel'|'reels';title?:string;duration?:number;outputFolder?:string;completed?:number;total?:number;skipped?:number}
export type TranscriptionProvider='elevenlabs'|'openai';
export type TranscriptionKeys=Record<TranscriptionProvider,{configured:boolean;storage:'encrypted'|'session'|null}>;
export interface TranscriptionState {projectId:string;provider:TranscriptionProvider;status:'preparing'|'transcribing'|'saving'|'done'|'error'|'cancelled';progress:number;message:string;completed:number;total:number}
interface NarezatorElectronApi {
 transcriptionCredentials:()=>Promise<TranscriptionKeys>;
 saveTranscriptionKey:(payload:{provider:TranscriptionProvider;apiKey:string;remember:boolean})=>Promise<TranscriptionKeys>;
 transcriptionStatus:()=>Promise<TranscriptionState|null>;
 retryTranscription:(payload:{provider:TranscriptionProvider})=>Promise<TranscriptionState>;
 cancelTranscription:()=>Promise<{ok:boolean}>;
 generateChapterSummary:(payload:{projectId:string;chapterId:string})=>Promise<ChapterSummary>;
 getGeneratedChapters:(payload:{projectId:string})=>Promise<Chapter[]|null>;
 generateChapters:(payload:{projectId:string})=>Promise<Chapter[]>;
 mediaUrl:string;
 captionsUrl:string;
 workspaceInfo:()=>Promise<{active:boolean;projectId:string|null;title:string|null;manifestPath:string|null;recent:{path:string;title:string;id:string}[]}>;
 pickProjectFile:(kind:'video'|'transcript'|'chapters'|'edits')=>Promise<string|null>;
 newWorkspace:(options:{videoPath:string;title:string;provider:TranscriptionProvider;chaptersPath?:string;editsPath?:string})=>Promise<{cancelled:boolean}>;
 openWorkspace:(file?:string)=>Promise<{cancelled:boolean}>;
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
