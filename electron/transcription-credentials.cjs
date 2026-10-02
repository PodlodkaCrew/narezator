const fs=require('node:fs'),path=require('node:path');
const PROVIDERS=['elevenlabs','openai'];
function providerName(provider){if(!PROVIDERS.includes(provider))throw Error('Choose ElevenLabs or OpenAI.');return provider==='openai'?'OpenAI':'ElevenLabs'}
class TranscriptionCredentials{
 constructor({userData,safeStorage}){this.file=path.join(userData,'transcription-keys.json');this.safeStorage=safeStorage;this.session=new Map()}
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'))}catch{return {}}}
 canEncrypt(){return this.safeStorage.isEncryptionAvailable()&&this.safeStorage.getSelectedStorageBackend?.()!=='basic_text'}
 get(provider){providerName(provider);if(this.session.has(provider))return this.session.get(provider);const saved=this.read()[provider];if(saved&&this.canEncrypt()){try{return this.safeStorage.decryptString(Buffer.from(saved,'base64'))}catch{}}return null}
 status(){return Object.fromEntries(PROVIDERS.map(provider=>[provider,{configured:!!this.get(provider),storage:this.session.has(provider)?'session':this.get(provider)?'encrypted':null}]))}
 save({provider,apiKey,remember=false}){
  providerName(provider);const key=typeof apiKey==='string'?apiKey.trim():'';
  if(key.length<8||key.length>512||/\s/.test(key))throw Error('Enter a valid API key.');
  const saved=this.read();delete saved[provider];
  const encrypted=remember&&this.canEncrypt();if(encrypted)saved[provider]=this.safeStorage.encryptString(key).toString('base64');
  fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(saved),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
  if(encrypted)this.session.delete(provider);else this.session.set(provider,key);
  return this.status();
 }
 require(provider){const key=this.get(provider);if(!key)throw Error(`Add your ${providerName(provider)} API key before importing a video.`);return key}
}
module.exports={TranscriptionCredentials,providerName};
