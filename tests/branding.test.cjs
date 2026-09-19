const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {profileDirectory}=require('../electron/app-profile.cjs');
const {ProjectStore}=require('../electron/project-store.cjs');

test('Narezator reuses the original profile and chooses its new name on fresh installs',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-profile-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(profileDirectory(root),path.join(root,'Narezator'));
 const legacy=path.join(root,'Cutroom');fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'workspace.json'),'saved workspace');
 assert.equal(profileDirectory(root),legacy);assert.equal(fs.readFileSync(path.join(legacy,'workspace.json'),'utf8'),'saved workspace');
});

test('new projects use the Narezator format and legacy Cutroom manifests still open unchanged',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'narezator-format-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const videoPath=path.join(root,'video.mp4');fs.writeFileSync(videoPath,'fixture');
 const recording={title:'Interview',source:'video.mp4',duration:10,words:[],chapters:[],initialClips:[{id:'a',start:0,end:10,label:'Main'}]};
 const store=new ProjectStore({userData:path.join(root,'profile'),resourcesPath:root});
 const config=store.create({manifestPath:path.join(root,'new.narezator'),videoPath,recording});
 const manifest=JSON.parse(fs.readFileSync(config.manifestPath));assert.equal(manifest.format,'narezator');
 assert.ok(config.projectPath.includes('new.narezator.data'));
 const legacy=path.join(root,'old.cutroom');manifest.format='cutroom';fs.writeFileSync(legacy,JSON.stringify(manifest));
 const before=fs.readFileSync(config.projectPath),oldManifest=fs.readFileSync(legacy);store.close();store.open(legacy);
 assert.equal(store.load().project.clips.length,1);assert.deepEqual(fs.readFileSync(config.projectPath),before);assert.deepEqual(fs.readFileSync(legacy),oldManifest);
 store.close();store.open(config.manifestPath);assert.equal(store.load().project.clips.length,1);
});
