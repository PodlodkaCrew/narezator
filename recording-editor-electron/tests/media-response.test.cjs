const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {mediaResponse}=require('../electron/media-response.cjs');

void test('media serves exact bounded, open-ended, and suffix byte ranges',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cutroom-ranges-')),file=path.join(dir,'video.mp4');
 fs.writeFileSync(file,Buffer.from('0123456789'));
 try{
  for(const [range,expected,contentRange] of [['bytes=3-5','345','bytes 3-5/10'],['bytes=7-','789','bytes 7-9/10'],['bytes=-2','89','bytes 8-9/10'],['bytes=8-99','89','bytes 8-9/10']]){
   const response=await mediaResponse(new Request('https://media/video',{headers:{Range:range}}),file);
   assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),contentRange);assert.equal(response.headers.get('content-length'),String(expected.length));assert.equal(await response.text(),expected);
  }
  for(const range of ['bytes=10-','bytes=4-2','bytes=-0','bytes=abc']){
   const response=await mediaResponse(new Request('https://media/video',{headers:{Range:range}}),file);
   assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),'bytes */10');
  }
  const head=await mediaResponse(new Request('https://media/video',{method:'HEAD'}),file);
  assert.equal(head.headers.get('content-length'),'10');assert.equal(head.headers.get('accept-ranges'),'bytes');assert.equal(await head.text(),'');
  const full=await mediaResponse(new Request('https://media/video'),file);assert.equal(full.status,200);assert.equal(await full.text(),'0123456789');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
