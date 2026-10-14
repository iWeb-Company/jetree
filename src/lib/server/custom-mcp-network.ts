import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import ipaddr from 'ipaddr.js';
import {Agent,fetch as networkFetch} from 'undici';

export function publicMcpAddress(address: string): boolean {
  try { const parsed=ipaddr.process(address);return parsed.range()==='unicast'; } catch { return false; }
}
export function mcpUrl(value: string): URL {
  let url: URL;try{url=new URL(value);}catch{throw new Error('MCP_URL_INVALID');}
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(value.length>2048||url.protocol!=='https:'||url.username||url.password||url.hash||!host.includes('.')&&!isIP(host)||/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)||isIP(host)&&!publicMcpAddress(host))throw new Error('MCP_URL_INVALID');
  for(const key of url.searchParams.keys())if(/token|secret|api.?key|password|credential/i.test(key))throw new Error('MCP_URL_CREDENTIAL');
  return url;
}
export async function resolveMcpAddress(url: URL, resolver=lookup) {
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolver(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>!publicMcpAddress(item.address)))throw new Error('MCP_ADDRESS_DENIED');
  return addresses.find(item=>item.family===4)||addresses[0];
}
// Each request resolves and pins its connection address. Redirects never bypass
// the check, and streaming bytes are bounded after decompression.
export function mcpNetwork(signal: AbortSignal, options: {resolver?:typeof lookup; fetcher?:typeof networkFetch}={}) {
  const agents=new Set<Agent>();let requests=0;
  const fetcher=async(input: RequestInfo|URL, init?:RequestInit):Promise<Response>=>{
    if(++requests>40)throw new Error('MCP_NETWORK_LIMIT');
    const url=mcpUrl(input instanceof Request?input.url:String(input));
    const pinned=await Promise.race([resolveMcpAddress(url,options.resolver),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('MCP_DNS_TIMEOUT')),5000);timer.unref();})]);
    if(signal.aborted)throw new Error('MCP_TIMEOUT');
    const dispatcher=new Agent({connect:{timeout:5000,lookup:((_hostname:unknown,lookupOptions:any,callback:any)=>{
      if(lookupOptions?.all)callback(null,[pinned]);else callback(null,pinned.address,pinned.family);
    }) as any}});agents.add(dispatcher);
    try{
      const headers=new Headers(init?.headers);
      const response=await (options.fetcher||networkFetch)(url,{...init,headers,dispatcher,redirect:'manual',signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[]),AbortSignal.timeout(20000)])} as any);
      if(response.status>=300&&response.status<400){await response.body?.cancel();throw new Error('MCP_REDIRECT_DENIED');}
      const reader=response.body?.getReader();let bytes=0;const finish=()=>{agents.delete(dispatcher);void dispatcher.destroy();};
      const body=reader?new ReadableStream<Uint8Array>({async pull(controller){try{const part=await reader.read();if(part.done){finish();controller.close();return;}bytes+=part.value.byteLength;if(bytes>2*1024*1024)throw new Error('MCP_RESPONSE_TOO_LARGE');controller.enqueue(part.value);}catch(error){await reader.cancel().catch(()=>{});finish();controller.error(error);}},async cancel(){await reader.cancel().catch(()=>{});finish();}}):null;
      if(!reader)finish();
      const result=new Response(body,{status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers)});
      Object.defineProperty(result,'url',{value:url.href});return result;
    }catch(error){agents.delete(dispatcher);void dispatcher.destroy();throw error;}
  };
  return {fetch:fetcher,close:()=>{for(const agent of agents)void agent.destroy();agents.clear();}};
}
