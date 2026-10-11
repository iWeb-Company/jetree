import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const bundle=await build({entryPoints:['figma-plugin/engine.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {applyFigmaJob}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function fixture(){
  let serial=2;const nodes=new Map();const privateData=new Map();const shared=new Map([['jetree.bridge','marker']]);
  const root={getSharedPluginData:(namespace,key)=>shared.get(namespace+'.'+key),getPluginData:key=>privateData.get(key)||'',setPluginData:(key,value)=>privateData.set(key,value)};
  const page={id:'0:1',type:'PAGE',appendChild(node){node.parent=this;}};
  function create(type){const node={id:'1:'+serial++,type,name:type,removed:false,locked:false,parent:page,x:0,y:0,width:100,height:100,fills:[],characters:'',fontName:{family:'Inter',style:'Regular'},fontSize:14,layoutMode:'NONE',paddingLeft:0,paddingRight:0,paddingTop:0,paddingBottom:0,itemSpacing:0,cornerRadius:0,resize(width,height){this.width=width;this.height=height;},appendChild(child){child.parent=this;},remove(){this.removed=true;},clone(){const copy=create(this.type);copy.name=this.name;return copy;},exportAsync:async()=>new Uint8Array([1,2,3])};nodes.set(node.id,node);return node;}
  const api={root,currentPage:page,mixed:Symbol('mixed'),getNodeByIdAsync:async id=>id===page.id?page:nodes.get(id)||null,loadFontAsync:async()=>{},commitUndo(){},viewport:{scrollAndZoomIntoView(){}},createFrame:()=>create('FRAME'),createText:()=>{const node=create('TEXT');delete node.layoutMode;return node;},createRectangle:()=>create('RECTANGLE'),createComponent:()=>create('COMPONENT')};
  return{api,nodes,create,privateData,shared};
}
test('Plugin builds frames and text with references; replay never duplicates layers',async()=>{
  const f=fixture();const job={id:'create',summary:'Frame',commands:[{op:'create_frame',ref:'$f',props:{name:'Pantalla',width:300,height:200,fill:'#123456',layoutMode:'VERTICAL',padding:12}},{op:'create_text',parentId:'$f',props:{characters:'Hola',fontSize:24}}]};
  const first=await applyFigmaJob(f.api,job,'marker');assert.equal(first.status,'applied');assert.equal(first.result.appliedCount,2);assert.equal(f.nodes.size,2);assert.equal([...f.nodes.values()][1].parent.id,first.result.nodes[0].id);
  assert.equal((await applyFigmaJob(f.api,job,'marker')).status,'applied');assert.equal(f.nodes.size,2);
});
test('Plugin rejects a wrong document binding and document/page deletion before any scene mutation',async()=>{
  const f=fixture();const create={id:'wrong',commands:[{op:'create_frame'}]};assert.equal((await applyFigmaJob(f.api,create,'wrong-marker')).status,'failed');assert.equal(f.nodes.size,0);
  assert.equal((await applyFigmaJob(f.api,{id:'delete',commands:[{op:'delete_node',nodeId:'0:1'}]},'marker')).status,'failed');assert.equal(f.nodes.size,0);
});
test('Plugin validates stale text and font availability before editing',async()=>{
  const f=fixture();const text=f.create('TEXT');text.characters='Original';
  const stale=await applyFigmaJob(f.api,{id:'stale',commands:[{op:'update_node',nodeId:text.id,expected:{characters:'Old'},props:{characters:'Nuevo'}}]},'marker');assert.equal(stale.status,'failed');assert.equal(text.characters,'Original');
  f.api.loadFontAsync=async()=>{throw new Error('Font unavailable');};assert.equal((await applyFigmaJob(f.api,{id:'font',commands:[{op:'update_node',nodeId:text.id,props:{characters:'Nuevo'}}]},'marker')).status,'failed');assert.equal(text.characters,'Original');
});
test('Plugin marks partially applied batches uncertain and never retries them',async()=>{
  const f=fixture();const job={id:'partial',commands:[{op:'create_text',ref:'$t',props:{characters:'Primero'}},{op:'update_node',nodeId:'$t',props:{layoutMode:'VERTICAL'}}]};
  const result=await applyFigmaJob(f.api,job,'marker');assert.equal(result.status,'uncertain');assert.equal(f.nodes.size,1);
  assert.equal((await applyFigmaJob(f.api,job,'marker')).status,'uncertain');assert.equal(f.nodes.size,1);
});
test('Plugin running ledger prevents a restart from replaying a mutation',async()=>{
  const f=fixture();f.privateData.set('job_running',JSON.stringify({status:'running'}));assert.equal((await applyFigmaJob(f.api,{id:'running',commands:[{op:'create_frame'}]},'marker')).status,'uncertain');assert.equal(f.nodes.size,0);
});
test('Plugin updates, duplicates, moves and deletes existing nodes',async()=>{
  const f=fixture();const frame=f.create('FRAME');const text=f.create('TEXT');text.name='Antes';
  const result=await applyFigmaJob(f.api,{id:'edit',commands:[{op:'update_node',nodeId:text.id,expected:{name:'Antes'},props:{name:'Después',characters:'Texto'}},{op:'duplicate_node',nodeId:text.id,ref:'$copy',parentId:frame.id},{op:'move_node',nodeId:text.id,parentId:frame.id},{op:'delete_node',nodeId:'$copy'}]},'marker');assert.equal(result.status,'applied');assert.equal(text.name,'Después');assert.equal(text.parent.id,frame.id);assert.equal([...f.nodes.values()].filter(n=>!n.removed).length,2);
});
test('Plugin iframe waits for completion, retries only delivery, and honors pause',async()=>{
  const html=await readFile('figma-plugin/ui.html','utf8');const script=html.split('<script>')[1].split('</script>')[0];
  const elements=new Map();const messages=[];const calls=[];const timers=[];
  const context={document:{getElementById(id){if(!elements.has(id))elements.set(id,{value:id==='server'?'https://jetree-dev.iwebtecnology.com':'synthetic-code'});return elements.get(id);}},parent:{postMessage:message=>messages.push(message)},setTimeout:fn=>timers.push(fn),clearTimeout(){},AbortSignal,Error,String,Array,JSON,btoa:value=>Buffer.from(value,'binary').toString('base64'),fetch:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body.action);if(body.action==='pair_start')return Response.json({token:'token',marker:'marker',name:'File',fileKey:'Abc123XYZ'});if(body.action==='verify')return Response.json({verified:true});if(body.action==='claim')return Response.json({job:{id:'job',summary:'Edit',commands:[]}});return Response.json({ok:true});}};
  vm.createContext(context);vm.runInContext(script,context);await elements.get('pair').onclick();await elements.get('verify').onclick();await timers.shift()();assert.equal(messages.at(-1).pluginMessage.type,'apply');assert.equal(timers.length,0,'No poll while applying');
  let fails=1;context.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body).action);if(fails--===1)throw new Error('Network lost');return Response.json({ok:true});};
  await elements.get('stop').onclick();await context.onmessage({data:{pluginMessage:{type:'outcome',status:'applied',jobId:'job',result:{}}}});assert.ok(timers.length);await timers.pop()();assert.deepEqual(calls.slice(-2),['complete','complete']);assert.equal(messages.filter(m=>m.pluginMessage.type==='apply').length,1);
});
