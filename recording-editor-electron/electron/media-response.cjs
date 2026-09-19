const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');

// Chromium seeks by requesting byte ranges. net.fetch(file://...) drops those
// ranges in our Electron version, so serve the requested slice explicitly.
async function mediaResponse(request,file){
 if(!file)return new Response('Not found',{status:404});
 let stat;
 try{stat=await fs.promises.stat(file)}catch(error){if(error.code==='ENOENT')return new Response('Not found',{status:404});throw error}
 if(!stat.isFile())return new Response('Not found',{status:404});
 const size=stat.size,types={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.mkv':'video/x-matroska','.webm':'video/webm','.vtt':'text/vtt; charset=utf-8'};
 const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes'};
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 let start=0,end=size-1,status=200;
 const range=request.headers.get('range');
 if(range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid=()=>new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`,'Content-Length':'0'}});
  if(!match||(!match[1]&&!match[2])||!size)return invalid();
  if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end)}
  else{const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,size-suffix)}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return invalid();
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(Math.max(0,end-start+1));
 if(request.method==='HEAD'||!size)return new Response(null,{status,headers});
 const stream=fs.createReadStream(file,{start,end});
 return new Response(Readable.toWeb(stream),{status,headers});
}

module.exports={mediaResponse};
