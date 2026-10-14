import assert from 'node:assert/strict';
import {randomBytes,createCipheriv} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from '@playwright/test';
assert.equal(process.env.JETREE_DISPOSABLE_CI,'true');assert.equal(process.env.CI,'true');
const origin=process.env.JETREE_APP_URL;assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'127.0.0.1');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const db=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
const users=[];let browser;
async function api(user,path,body){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
try{
 for(let n=0;n<2;n++){
  const email=`custom-mcp-${randomBytes(8).toString('hex')}@example.invalid`,password=randomBytes(24).toString('base64url')+'!Aa1';
  const user=db(await service.auth.admin.createUser({email,password,email_confirm:true})).user;
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
  users.push({...user,email,password,token:db(await client.auth.signInWithPassword({email,password})).session.access_token});
 }
 const user=users[0],iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY,'base64'),iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify({token:'synthetic-private-mcp-token'}),'utf8'),cipher.final()]).toString('base64');
 const tool={name:'lookup',description:'Public docs',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true}};
 const connection=db(await service.from('custom_mcp_connections').insert({user_id:user.id,name:'Synthetic docs',url:'https://fixture.example.invalid/mcp',auth_mode:'token',status:'connected',ciphertext,iv:iv.toString('base64'),auth_tag:cipher.getAuthTag().toString('base64'),tools:[tool]}).select('id').single());
 const department=db(await service.from('departments').insert({name:'MCP CI',created_by:user.id}).select('id').single());
 const agents=db(await service.from('agents').insert(['manager','independent'].map((role_type,i)=>({name:i?'MCP specialist':'MCP manager',role_type,department_id:department.id,created_by:user.id,provider:'custom',model:'synthetic-custom:free',enabled_tool_ids:[]}))).select('id'));
 const listing=await api(user,'/api/custom-mcp');assert.equal(listing.status,200);assert.equal(listing.body.connections.length,1);
 assert.ok(!JSON.stringify(listing.body).includes(ciphertext));assert.ok(!JSON.stringify(listing.body).includes('synthetic-private-mcp-token'));
 assert.equal((await api(users[1],'/api/custom-mcp')).body.connections.length,0);
 for(const action of ['assign','readOnly','revoke'])assert.equal((await api(users[1],'/api/custom-mcp',{action,id:connection.id,agentId:agents[0].id,enabled:true,names:['lookup']})).status,403);
 const call=(agent,operation,input)=>api(user,'/api/agent-tools',{agentId:agent.id,toolId:'plugin-custom-mcp',operation,input});
 const pending=[];
 for(const agent of agents){
  assert.equal((await api(user,'/api/custom-mcp',{action:'assign',id:connection.id,agentId:agent.id,enabled:true})).status,200);
  assert.ok(db(await service.from('agents').select('enabled_tool_ids').eq('id',agent.id).single()).enabled_tool_ids.includes('plugin-custom-mcp'));
  const servers=await call(agent,'list_mcp_servers',{});assert.equal(servers.status,200);assert.equal(servers.body.result.servers.length,1);
  const tools=await call(agent,'list_mcp_tools',{serverId:connection.id});assert.equal(tools.status,200);assert.equal(tools.body.result.items[0].approvalRequired,true);
  const draft=await call(agent,'call_mcp_tool',{serverId:connection.id,name:'lookup',arguments:{query:'public'}});assert.equal(draft.status,202);pending.push(draft.body.approvalId);
 }
 assert.equal((await api(user,'/api/custom-mcp',{action:'readOnly',id:connection.id,names:['missing']})).status,400);
 assert.equal((await api(user,'/api/custom-mcp',{action:'readOnly',id:connection.id,names:['lookup']})).status,200);
 assert.equal((await api(user,'/api/custom-mcp')).body.connections[0].tools[0].readOnly,true);
 // UI verifies the real API state without allowing an external fixture request.
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(origin);
 await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill(user.password);await page.getByRole('button',{name:'Acceder al Workspace'}).click();await page.getByRole('button',{name:'Cerrar Sesión'}).waitFor({timeout:60000});await page.getByRole('button',{name:'Herramientas',exact:true}).click();
 const panel=page.getByRole('region',{name:'MCP personalizados'});await expect(panel.getByText('Synthetic docs',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Conectar Obsidian',exact:true}).click();await expect(panel.getByLabel('Servicio MCP')).toHaveValue('obsidian');await expect(panel.getByLabel('URL del servidor MCP',{exact:true})).toHaveValue('');await panel.getByLabel('Token MCP',{exact:true}).fill('synthetic-vault-secret');
 await panel.getByRole('button',{name:'Conectar Notion',exact:true}).click();await expect(panel.getByLabel('URL del servidor MCP',{exact:true})).toHaveValue('https://mcp.notion.com/mcp');await expect(panel.getByLabel('Autenticación MCP')).toHaveValue('oauth');
 await panel.getByRole('button',{name:'Conectar Obsidian',exact:true}).click();await expect(panel.getByLabel('Token MCP',{exact:true})).toHaveValue('');await panel.getByText('Cómo conectar Obsidian (guía breve)',{exact:true}).click();await expect(panel.getByText(/Vault con Sync:/)).toBeVisible();
 await mkdir('artifacts',{recursive:true});for(const width of [390,1440]){await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/notes-mcp-${width}.png`,fullPage:true});assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'Notes panel horizontal overflow');}
 await panel.getByRole('button',{name:'Cancelar',exact:true}).click();
 await panel.getByRole('button',{name:'Agregar servidor MCP'}).click();await panel.getByLabel('Autenticación MCP').selectOption('token');await expect(panel.getByLabel('Token MCP',{exact:true})).toHaveAttribute('type','password');await panel.getByLabel('Autenticación MCP').selectOption('oauth');await expect(panel.getByText('Cliente OAuth propio (opcional)',{exact:true})).toBeVisible();
 await mkdir('artifacts',{recursive:true});for(const width of [390,1440]){await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/custom-mcp-${width}.png`,fullPage:true});assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'MCP panel horizontal overflow');}
 assert.equal((await api(user,'/api/custom-mcp',{action:'revoke',id:connection.id})).status,200);
 for(const approvalId of pending){assert.notEqual((await api(user,'/api/agent-tools/approvals',{approvalId,decision:'approve'})).status,200);assert.equal((await api(user,'/api/agent-tools/approvals',{approvalId,decision:'approve'})).status,409);}
 assert.equal(db(await service.from('custom_mcp_agent_access').select('agent_id').eq('connection_id',connection.id)).length,0);
 const callback=await fetch(origin+'/api/custom-mcp/oauth/callback?state=invalid&code=private',{redirect:'manual'});assert.equal(callback.status,307);assert.ok(!callback.headers.get('location').includes('private'));
 console.log('PASS private MCP credentials, real owner isolation, manager/agent assignments, default approval despite readOnlyHint, explicit read policy, revocation, replay and desktop/mobile UI');
}finally{
 await browser?.close();for(const user of users){db(await service.from('departments').delete().eq('created_by',user.id));db(await service.from('activity_logs').delete().eq('user_id',user.id));db(await service.auth.admin.deleteUser(user.id));}
}
