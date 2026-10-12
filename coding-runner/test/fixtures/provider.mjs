// Deterministic CI transport, never used with a real account or installed in the image.
import http from 'node:http';
import assert from 'node:assert/strict';
assert.equal(process.env.JETREE_CODE_API_KEY,'synthetic-ci-no-provider-key');
http.createServer(async(request,response)=>{
  assert.equal(request.headers.authorization,'Bearer '+process.env.JETREE_CODE_GATEWAY_TOKEN);assert.equal(request.url,'/v1/chat/completions');
  const parts=[];for await(const part of request)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());assert.equal(body.model,'jetree-ci');
  const invoked=body.messages.some(message=>message.role==='tool');
  const tool=body.tools?.find(item=>item.function.name==='bash');if(!invoked)assert.ok(tool,'OpenCode must expose actual bash tool');
  const delta=invoked?{content:'Fixed the arithmetic. Ready for independent verification.'}:{tool_calls:[{index:0,id:'call_jetree_ci',type:'function',function:{name:'bash',arguments:JSON.stringify({command:`node -e "require('fs').writeFileSync('sum.cjs','exports.sum=(a,b)=>a+b;\\n')"`,description:'Fix the arithmetic in the isolated workspace'})}}]};
  const chunk=(delta,finish_reason=null)=>({id:'chatcmpl-ci',object:'chat.completion.chunk',created:1,model:'jetree-ci',choices:[{index:0,delta,finish_reason}]});
  response.writeHead(200,{'Content-Type':'text/event-stream'});response.write('data: '+JSON.stringify(chunk({role:'assistant'}))+'\n\n');response.write('data: '+JSON.stringify(chunk(delta))+'\n\n');response.write('data: '+JSON.stringify(chunk({},invoked?'stop':'tool_calls'))+'\n\n');response.end('data: [DONE]\n\n');
}).listen(8080,'0.0.0.0');
