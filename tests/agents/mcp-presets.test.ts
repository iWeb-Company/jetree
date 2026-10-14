import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpPresetDefaults} from '../../src/lib/mcp-presets';
import {conversationToolGuidance,respondWithTools} from '../../src/lib/agents/tool-loop';
test('notes presets use official Notion OAuth and require each Obsidian vault URL and token',()=>{
 const notion=mcpPresetDefaults('notion');assert.equal(notion.url,'https://mcp.notion.com/mcp');assert.equal(notion.authMode,'oauth');assert.equal(notion.token,'');
 const obsidian=mcpPresetDefaults('obsidian');assert.equal(obsidian.url,'');assert.equal(obsidian.authMode,'token');assert.equal(obsidian.headerName,'Authorization');
 for(const preset of ['custom','notion','obsidian'] as const){const defaults=mcpPresetDefaults(preset);assert.equal(defaults.clientSecret,'');assert.equal(defaults.token,'');assert.equal(defaults.clientId,'');}
});
test('notes requests use assigned MCP tools and preserve write approval for both agent roles',async()=>{
 for(const role of ['manager','independent']){
  const agent={id:'notes-agent',role,enabledPluginIds:['plugin-custom-mcp']} as any;
  const guidance=conversationToolGuidance(agent);assert.match(guidance,/Notion/);assert.match(guidance,/Obsidian/);assert.match(guidance,/Leé la nota o página actual/);assert.match(guidance,/no confirma sincronización/);
  for(const service of ['Notion','Obsidian']){
   let step=0;const actions=[{operation:'list_mcp_servers',input:{}},{operation:'list_mcp_tools',input:{serverId:'11111111-1111-4111-8111-111111111111',search:'update'}},{operation:'call_mcp_tool',input:{serverId:'11111111-1111-4111-8111-111111111111',name:'update_note',arguments:{path:'Test.md',content:'Approved draft'}}}];
   const answer=await respondWithTools(agent,`Actualizá una nota de ${service}`,{},async()=>JSON.stringify({toolId:'plugin-custom-mcp',...actions[step++]}),async(_a,_t,op)=>op==='call_mcp_tool'?{pendingApproval:true,approvalId:'draft'}:{result:{tools:['update_note']}});
   assert.equal(step,3);assert.match(answer,/pendiente de tu aprobación/);
  }
 }
});
