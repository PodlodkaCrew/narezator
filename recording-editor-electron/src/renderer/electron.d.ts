import type {Project,Recording} from './lib/editor-model';

interface ElectronExportJob {id:string;status:string;progress:number;message:string;kind?:'main'|'reel';title?:string;duration?:number}
interface CutroomElectronApi {
 mediaUrl:string;
 captionsUrl:string;
 chooseWorkspace:()=>Promise<{cancelled:boolean}>;
 loadRecording:()=>Promise<Recording>;
 loadWaveform:()=>Promise<{peaks:number[]}>;
 mediaInfo:()=>Promise<{burnedIn:boolean;source:string;duration:number;url:string}>;
 loadProject:()=>Promise<{project:Project;revision:number}>;
 saveProject:(payload:{project:Project;baseRevision:number})=>Promise<{revision:number}>;
 saveText:(payload:{suggestedName:string;text:string})=>Promise<{cancelled:boolean;filePath?:string}>;
 listExports:()=>Promise<{jobs:ElectronExportJob[]}>;
 getExport:(id:string)=>Promise<ElectronExportJob>;
 startExport:(payload:{project:Project;burn:boolean;height:number;title:string;kind:'main'|'reel'})=>Promise<ElectronExportJob>;
 cancelExport:(id:string)=>Promise<{ok:boolean}>;
 saveExportFile:(id:string,name:string)=>Promise<{cancelled:boolean;filePath?:string}>;
 revealExport:(id:string)=>Promise<{ok:boolean}>;
}

declare global {interface Window {cutroom:CutroomElectronApi}}
export {};
