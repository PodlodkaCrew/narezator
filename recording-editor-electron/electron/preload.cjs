const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('cutroom',{
 mediaUrl:'cutroom-media://video/source',
 captionsUrl:'cutroom-media://captions/source',
 workspaceInfo:()=>ipcRenderer.invoke('workspace:info'),
 pickProjectFile:kind=>ipcRenderer.invoke('workspace:pick',kind),
 newWorkspace:options=>ipcRenderer.invoke('workspace:new',options),
 importWebProject:()=>ipcRenderer.invoke('workspace:importWeb'),
 openWorkspace:file=>ipcRenderer.invoke('workspace:open',file),
 closeWorkspace:()=>ipcRenderer.invoke('workspace:close'),
 loadRecording:()=>ipcRenderer.invoke('recording:load'),
 loadWaveform:()=>ipcRenderer.invoke('waveform:load'),
 mediaInfo:()=>ipcRenderer.invoke('media:info'),
 loadProject:()=>ipcRenderer.invoke('project:load'),
 saveProject:payload=>ipcRenderer.invoke('project:save',payload),
 saveText:payload=>ipcRenderer.invoke('text:save',payload),
 listExports:()=>ipcRenderer.invoke('exports:list'),
 getExport:id=>ipcRenderer.invoke('exports:get',id),
 startExport:payload=>ipcRenderer.invoke('exports:start',payload),
 cancelExport:id=>ipcRenderer.invoke('exports:cancel',id),
 saveExportFile:(id,name)=>ipcRenderer.invoke('exports:saveFile',{id,name}),
 revealExport:id=>ipcRenderer.invoke('exports:reveal',id),
});
