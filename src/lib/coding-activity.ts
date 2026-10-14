export type CodingActivity={sequence:number;kind:'message'|'tool'|'verification';label:string;status:string;output?:string};
function activityBytes(value:string,limit:number) {
  let size=0;let result='';for(const character of value){size+=Buffer.byteLength(character);if(size>limit)break;result+=character;}return result;
}
export function activityText(value:string,secrets:string[]=[]) {
  for(const secret of secrets)if(secret)value=value.split(secret).join('[redacted]');
  return value.replace(/\b(?:jcr_|jci_|gsk_|sk-(?:proj-|ant-api\d+-|or-v1-)?|AIza|gh[pousr]_)[A-Za-z0-9_.-]{15,}/g,'[redacted]').replace(/(Bearer\s+)[^\s"']+/gi,'$1[redacted]').replace(/((?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s"']+/gi,'$1[redacted]');
}
export function codingActivity(value:unknown):CodingActivity[] {
  if(!Array.isArray(value)||value.length>20)throw new Error('CODING_INPUT_INVALID');
  return value.map(e=>{
    if(!e||!Number.isInteger(e.sequence)||e.sequence<1||e.sequence>500||!['message','tool','verification'].includes(e.kind)||!['running','completed','error'].includes(e.status)||typeof e.label!=='string'||e.label.length>600||e.output!==undefined&&(typeof e.output!=='string'||e.output.length>4096))throw new Error('CODING_INPUT_INVALID');
    return {sequence:e.sequence,kind:e.kind,label:activityBytes(activityText(e.label),600),status:e.status,...(e.output?{output:activityBytes(activityText(e.output),4096)}:{})};
  });
}
