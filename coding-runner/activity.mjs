export function redactActivity(text,secrets=[]) {
  for(const secret of secrets)if(secret)text=text.split(secret).join('[redacted]');
  return text.replace(/\b(?:jcr_|jci_|gsk_|sk-(?:proj-|ant-api\d+-|or-v1-)?|AIza|gh[pousr]_)[A-Za-z0-9_.-]{15,}/g,'[redacted]').replace(/(Bearer\s+)[^\s"']+/gi,'$1[redacted]').replace(/((?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s"']+/gi,'$1[redacted]');
}
export function activityCollector(onActivity,secrets=[]) {
  const seen=new Set();let count=0;
  return part=>{
    if(!part||typeof part.id!=='string'||!['tool','text'].includes(part.type)||count>=500)return;
    const status=part.type==='text'?'completed':part.state?.status;
    if(!['running','completed','error'].includes(status)||part.type==='text'&&!part.time?.end)return;
    const identity=part.id+':'+status;if(seen.has(identity))return;seen.add(identity);
    const tool=String(part.tool||'herramienta');const input=part.state?.input||{};
    const file=String(input.filePath||input.path||'').replace(/^\/workspace\//,'');
    const label=part.type==='text'?'Mensaje del agente':tool==='bash'?'Comando: '+String(input.command||''):tool+' '+file;
    const output=part.type==='text'?String(part.text||''):tool==='bash'?String(part.state?.output||part.state?.error||''):part.state?.error?String(part.state.error):'';
    count++;onActivity({kind:part.type==='text'?'message':'tool',status,label:redactActivity(label,secrets).slice(0,600),...(output?{output:redactActivity(output,secrets).slice(0,4096)}:{})});
  };
}
// Runs inside the isolated engine. Filter before stdout: reasoning parts and
// unrelated sessions never leave the engine through the activity channel.
export const eventReaderScript=String.raw`
const session=process.argv[1];let pending='';const decoder=new TextDecoder();
fetch('http://127.0.0.1:4096/event',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},signal:AbortSignal.timeout(300000)}).then(async r=>{
 if(!r.ok)process.exit(1);console.log(JSON.stringify({ready:true}));for await(const bytes of r.body){pending+=decoder.decode(bytes,{stream:true});if(pending.length>2*1024*1024)process.exit(1);let end;
 while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);for(const line of frame.split('\n')){if(!line.startsWith('data:'))continue;try{const event=JSON.parse(line.slice(5));const p=event.properties?.part;
 if(event.type==='message.part.updated'&&p?.sessionID===session&&['tool','text'].includes(p.type)){
 const input=p.state?.input||{};const output={id:p.id,type:p.type,tool:p.tool,time:p.time,text:typeof p.text==='string'?p.text.slice(0,8192):undefined,state:p.state?{status:p.state.status,input:{filePath:String(input.filePath||'').slice(0,500),path:String(input.path||'').slice(0,500),command:String(input.command||'').slice(0,600)},output:p.tool==='bash'?String(p.state.output||'').slice(0,8192):undefined,error:String(p.state.error||'').slice(0,4096)}:undefined};console.log(JSON.stringify(output));}
 }catch{}}}}
}).catch(()=>process.exit(0));`;
