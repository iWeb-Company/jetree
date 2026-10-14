import assert from 'node:assert/strict';
import { randomBytes,createCipheriv,createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium,expect } from '@playwright/test';
assert.equal(process.env.JETREE_DISPOSABLE_CI,'true');assert.equal(process.env.CI,'true');
const origin=process.env.JETREE_APP_URL;assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'127.0.0.1');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const db=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
function encrypt(value){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY,'base64'),iv);return{ciphertext:Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64'),iv:iv.toString('base64'),auth_tag:cipher.getAuthTag().toString('base64')};}
const users=[];let browser;
async function api(user,path,body){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
async function bridge(token,body){const response=await fetch(origin+'/api/figma/plugin',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};}
try{
  for(let n=0;n<2;n++){
    const email=`figma-${randomBytes(8).toString('hex')}@example.invalid`;const password=randomBytes(24).toString('base64url')+'!Aa1';
    const user=db(await service.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
    users.push({...user,email,password,token:db(await client.auth.signInWithPassword({email,password})).session.access_token});
  }
  const user=users[0];
  assert.equal((await api(user,'/api/figma',{action:'connect',token:'synthetic-figma-'+user.id})).status,200);
  const secret=db(await service.from('tool_connections').select('ciphertext').eq('user_id',user.id).eq('provider','figma').single());assert.notEqual(secret.ciphertext,'synthetic-figma-'+user.id);
  assert.equal((await api(user,'/api/figma',{action:'register',url:'https://www.figma.com/design/Synthetic123/Test'})).status,200);
  assert.equal((await api(users[1],'/api/figma')).body.files.length,0);
  const department=db(await service.from('departments').insert({name:'Figma CI',created_by:user.id}).select('id').single());
  const agents=db(await service.from('agents').insert(['manager','independent'].map((role_type,i)=>({name:i?'Figma specialist':'Figma manager',role_type,department_id:department.id,created_by:user.id,provider:'custom',model:'images-ci-figma',enabled_tool_ids:['plugin-figma-core']}))).select('id'));
  const visionSecret=encrypt('sk-or-v1-synthetic-figma');db(await service.rpc('save_provider_api_connection',{owner_id:user.id,detected_provider:'custom',encrypted_value:visionSecret.ciphertext,encrypted_iv:visionSecret.iv,encrypted_tag:visionSecret.auth_tag}));
  const conversation=db(await service.from('conversations').insert({department_id:department.id,agent_id:agents[0].id,created_by:user.id}).select('id').single());
  const call=(agent,operation,input,caller=user)=>api(caller,'/api/agent-tools',{agentId:agent.id,toolId:'plugin-figma-core',operation,input,...(agent.id===agents[0].id?{conversationId:conversation.id}:{})});
  for(const agent of agents){assert.equal((await call(agent,'list_figma_files',{})).body.result.files.length,1);assert.equal((await call(agent,'get_figma_file',{fileKey:'Synthetic123'})).status,200);}
  for(const agent of agents){const view=await call(agent,'inspect_figma',{fileKey:'Synthetic123',nodeIds:['1:2'],question:'Describí la pantalla'});assert.equal(view.status,200,JSON.stringify(view.body));assert.match(view.body.result.description,/Synthetic image understood/);}
  assert.equal((await call(agents[0],'get_figma_file',{fileKey:'Synthetic123'},users[1])).status,403);
  for(const agent of agents){
    for(const operation of ['get_figma_file','get_figma_nodes','list_figma_comments','inspect_figma']){
      const result=await call(agent,operation,{fileKey:'https://www.figma.com/design/Unregistered123/Test',nodeIds:['1:2'],question:'Describí la pantalla'});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.notEqual((await call(agent,operation,{fileKey:'DeniedFile123',nodeIds:['1:2']})).status,200,'Figma permissions remain authoritative');
    }
  }
  assert.equal((await api(user,'/api/figma')).body.files.length,1,'Reading never registers a file for writing');
  assert.notEqual((await api(user,'/api/figma',{action:'pair',fileKey:'Unregistered123'})).status,200);
  assert.notEqual((await call(agents[0],'get_figma_jobs',{fileKey:'Unregistered123'})).status,200);
  for(const [operation,input] of [['post_figma_comment',{message:'Blocked comment'}],['apply_figma_changes',{summary:'Blocked edit',commands:[{op:'create_frame'}]}]]){
    const pending=await call(agents[0],operation,{fileKey:'Unregistered123',...input});assert.equal(pending.status,202);
    const result=await api(user,'/api/agent-tools/approvals',{approvalId:pending.body.approvalId,decision:'approve'});
    assert.equal(result.status,502);assert.equal(result.body.code,'FIGMA_FILE_NOT_REGISTERED');
  }
  const pair=await api(user,'/api/figma',{action:'pair',fileKey:'Synthetic123'});assert.equal(pair.status,200);
  const paired=await bridge(null,{action:'pair_start',code:pair.body.code});assert.equal(paired.status,200);
  assert.equal((await bridge(null,{action:'pair_start',code:pair.body.code})).status,400);
  const token=paired.body.token;
  assert.equal((await bridge(token,{action:'claim'})).status,409,'Unverified plugin cannot claim');
  assert.equal((await bridge(token,{action:'verify'})).status,200);
  const draft=await call(agents[0],'apply_figma_changes',{fileKey:'Synthetic123',summary:'Create screen',commands:[{op:'create_frame',ref:'$frame',props:{name:'Test screen',width:300,height:200}},{op:'create_text',parentId:'$frame',props:{characters:'Hola'}}]});assert.equal(draft.status,202);
  assert.equal((await bridge(token,{action:'claim'})).body.job,null,'Approval is necessary');
  assert.equal((await api(users[1],'/api/agent-tools/approvals',{approvalId:draft.body.approvalId,decision:'approve'})).status,409);
  const approved=await api(user,'/api/agent-tools/approvals',{approvalId:draft.body.approvalId,decision:'approve'});assert.equal(approved.body.result.queued,true);
  assert.equal((await api(user,'/api/agent-tools/approvals',{approvalId:draft.body.approvalId,decision:'approve'})).status,409);
  const claims=await Promise.all([bridge(token,{action:'claim'}),bridge(token,{action:'claim'})]);const jobs=claims.map(r=>r.body.job).filter(Boolean);assert.equal(jobs.length,1,'Concurrent plugin polls lease one job');
  const job=jobs[0];const preview='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const completion={action:'complete',jobId:job.id,status:'applied',result:{nodes:[{id:'1:2',name:'Screen',type:'FRAME'}],appliedCount:2,detail:'Applied'},preview};
  assert.equal((await bridge(token,completion)).status,200);assert.equal((await bridge(token,completion)).status,200);
  assert.equal(db(await service.from('messages').select('id').eq('conversation_id',conversation.id).like('content','Figma ·%')).length,1,'Completion message is idempotent');
  const shot=await fetch(origin+'/api/figma?preview='+job.id,{headers:{Authorization:'Bearer '+user.token}});assert.equal(shot.status,200);assert.equal(shot.headers.get('content-type'),'image/png');
  assert.equal((await api(users[1],'/api/figma?preview='+job.id)).status,403);
  const scope={...paired.body,token};
  await api(user,'/api/figma',{action:'register',url:'https://www.figma.com/design/WrongFile123/Test'});
  const wrongCode=(await api(user,'/api/figma',{action:'pair',fileKey:'WrongFile123'})).body.code;
  const wrong=(await bridge(null,{action:'pair_start',code:wrongCode})).body;
  assert.equal((await bridge(wrong.token,{action:'verify'})).status,409,'REST marker binds the actual registered file');
  // Telegram uses the exact same persisted approval, but must report queued.
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY,'base64'),iv);
  const encrypted=Buffer.concat([cipher.update('synthetic-audio-token','utf8'),cipher.final()]).toString('base64');const webhook='synthetic-figma-webhook';
  const bot=db(await service.from('telegram_bots').insert({agent_id:agents[0].id,owner_user_id:user.id,bot_username:'FigmaCI_bot',token_ciphertext:encrypted,token_iv:iv.toString('base64'),token_auth_tag:cipher.getAuthTag().toString('base64'),secret_hash:createHash('sha256').update(webhook).digest('hex'),tool_chat_id:42,tool_user_id:42}).select('id').single());
  const telegramDraft=await call(agents[0],'apply_figma_changes',{fileKey:'Synthetic123',summary:'Telegram edit',commands:[{op:'create_rectangle',props:{fill:'#ff0000'}}]});assert.equal(telegramDraft.status,202);
  db(await service.from('telegram_tool_approvals').insert({approval_id:telegramDraft.body.approvalId,bot_id:bot.id,chat_id:42,telegram_user_id:42}));
  const callback=await fetch(origin+'/api/webhook/telegram/'+agents[0].id,{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':webhook},body:JSON.stringify({update_id:12001,callback_query:{id:'figma-callback',data:'jt:a:'+telegramDraft.body.approvalId,from:{id:42},message:{message_id:10,chat:{id:42,type:'private'}}}})});assert.equal(callback.status,200);
  let update;
  for(let n=0;n<150;n++){update=db(await service.from('telegram_updates').select('status,response_text,last_error').eq('bot_id',bot.id).eq('update_id',12001).maybeSingle());if(update?.status==='completed')break;if(update?.status==='failed')throw new Error(update.last_error);await new Promise(resolve=>setTimeout(resolve,200));}
  assert.equal(update?.status,'completed');assert.match(update.response_text,/en cola/);assert.doesNotMatch(update.response_text,/ejecutada/);
  const telegramJob=(await bridge(scope.token,{action:'claim'})).body.job;assert.ok(telegramJob);
  db(await service.from('figma_jobs').update({lease_until:new Date(0).toISOString()}).eq('id',telegramJob.id));
  assert.equal((await bridge(scope.token,{action:'claim'})).body.job,null);assert.equal(db(await service.from('figma_jobs').select('status').eq('id',telegramJob.id).single()).status,'uncertain');
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(origin);await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill(user.password);await page.getByRole('button',{name:'Acceder al Workspace'}).click();await page.getByRole('button',{name:'Cerrar Sesión'}).waitFor({timeout:60000});await page.getByRole('button',{name:'Herramientas',exact:true}).click();
  const panel=page.getByRole('region',{name:'Conexión Figma'});await expect(panel.getByText('Incierto · revisar en Figma',{exact:true})).toBeVisible();await mkdir('artifacts',{recursive:true});
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/figma-${width}.png`,fullPage:true});}
  await api(user,'/api/figma',{action:'resolve_uncertain',jobId:telegramJob.id,confirmed:true});assert.equal((await bridge(scope.token,{action:'claim'})).status,401);
  const queued=await call(agents[1],'apply_figma_changes',{fileKey:'Synthetic123',summary:'Pending offline',commands:[{op:'create_frame'}]});assert.equal(queued.status,202);await api(user,'/api/agent-tools/approvals',{approvalId:queued.body.approvalId,decision:'approve'});
  await api(user,'/api/figma',{action:'disconnect'});assert.equal(db(await service.from('figma_jobs').select('status').eq('approval_id',queued.body.approvalId).single()).status,'cancelled');
  console.log('PASS Figma encrypted PAT, file allowlist, manager/agent permissions, REST document binding, one-time pairing, concurrent claim, queued web/Telegram approvals, private preview, idempotent completion, uncertain lease and revocation');
}finally{
  await browser?.close();
  for(const user of users){const previews=db(await service.from('figma_jobs').select('preview_path').eq('user_id',user.id)).map(job=>job.preview_path).filter(Boolean);if(previews.length)await service.storage.from('figma-previews').remove(previews);db(await service.from('tasks').delete().eq('created_by',user.id));db(await service.from('departments').delete().eq('created_by',user.id));db(await service.from('activity_logs').delete().eq('user_id',user.id));db(await service.auth.admin.deleteUser(user.id));}
}
