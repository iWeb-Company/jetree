import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createCipheriv,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const origin=process.env.JETREE_APP_URL;
assert.equal(new URL(origin).hostname,'127.0.0.1');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'lgimqhuohkjtwfxbaecb.supabase.co');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const run=randomUUID();let user,dep,token,connected=false,connectionId;const extraUsers=[];
function db(r,label){assert.equal(r.error,null,label);return r.data;}
async function api(path,method='GET',body){const r=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});return {status:r.status,body:await r.json()};}
try {
 for(const table of ['departments','agents','telegram_updates']) {const r=await service.from(table).select('id',{head:true,count:'exact'});db(r,'preflight');assert.equal(r.count,0,'Empty authorized test database required');}
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':process.env.JETREE_E2E_PROVIDER_KEY}});assert.equal(r.status,200);const ms=(await r.json()).models.filter(m=>m.supportedGenerationMethods?.includes('generateContent'));
 const configured=process.env.JETREE_E2E_MODEL?.trim();const model=(configured?ms.find(m=>m.name==='models/'+configured||m.name===configured):ms.find(m=>m.name==='models/gemini-3.5-flash-lite'))?.name.replace('models/','');assert(model,'Compatible model required');
 user=db(await service.auth.admin.createUser({email:`jetree-e2e-model-${run}@example.invalid`,password:randomBytes(32).toString('base64url')+'!Aa1',email_confirm:true}),'fixture Auth').user;
 // Set an independent random password only used inside this process.
 const password=randomBytes(32).toString('base64url')+'!Aa1';db(await service.auth.admin.updateUserById(user.id,{password}),'fixture password');token=db(await client.auth.signInWithPassword({email:user.email,password}),'login').session.access_token;
 dep=db(await service.from('departments').insert({name:'E2E Gemini '+run,created_by:user.id}).select('id').single(),'fixture department').id;
 const connection=await api('/api/provider-connections','POST',{provider:'gemini',apiKey:process.env.JETREE_E2E_PROVIDER_KEY});assert.equal(connection.status,200,'Provider connection '+connection.status);connected=true;connectionId=connection.body.connection.id;console.log('PASS encrypted provider connection and health validation');
 const created=await api('/api/agents','POST',{department_id:dep,name:'Synthetic Gemini agent',provider:'gemini',model,system_prompt:'Only synthetic test data. Keep answers under 30 words.'});assert.equal(created.status,201);const agent=created.body.agent;
 const result=await api('/api/agents/chat','POST',{agentId:agent.id,message:'Synthetic test: calculate 17 plus 25. Respond with the number.'});console.log('Chat status: '+result.status+'; code: '+(result.body.code||'none'));assert.equal(result.status,200,'Real inference failed');assert.match(result.body.reply,/42/);
 const ledger=db(await service.from('agent_executions').select('status,output_chars').eq('user_id',user.id),'execution metadata');assert.equal(ledger.length,1);assert.equal(ledger[0].status,'completed');assert(ledger[0].output_chars>0);console.log('PASS real Gemini inference, response and completed execution ledger ('+model+')');
 const persisted=await api('/api/conversations?agentId='+agent.id);assert.equal(persisted.status,200);assert(persisted.body.messages.length>=2);console.log('PASS conversation and user/assistant messages persisted');

 const botToken=process.env.JETREE_E2E_TELEGRAM_BOT_TOKEN;
 assert(botToken,'Test bot token required');
 const hookInfo=await fetch('https://api.telegram.org/bot'+botToken+'/getWebhookInfo');
 const hookData=await hookInfo.json();assert.equal(hookData.ok,true);assert.equal(hookData.result.url,'','Refuse to use a bot with an existing webhook');
 const rawUpdates=await fetch('https://api.telegram.org/bot'+botToken+'/getUpdates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timeout:0,limit:100,allowed_updates:['message']})});
 const telegramData=await rawUpdates.json();assert.equal(telegramData.ok,true);
 const marker=telegramData.result.find(u=>u.message?.text?.trim()==='jetree-e2e-ready');assert(marker,'Synthetic Telegram readiness marker required');
 const target={chatId:marker.message.chat.id};
 function encrypt(value){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY,'base64'),iv);const content=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return {token_ciphertext:content.toString('base64'),token_iv:iv.toString('base64'),token_auth_tag:cipher.getAuthTag().toString('base64')};}
 const webhookSecret=randomBytes(32).toString('hex');
 const bot=db(await service.from('telegram_bots').insert({agent_id:agent.id,owner_user_id:user.id,...encrypt(process.env.JETREE_E2E_TELEGRAM_BOT_TOKEN),secret_hash:createHash('sha256').update(webhookSecret).digest('hex'),bot_username:'synthetic-test-bot',is_active:true}).select('id').single(),'fixture encrypted bot');
 const updateId=Math.floor(Date.now()/1000);
 const hookBody={update_id:updateId,message:{message_id:1,chat:{id:target.chatId},from:{first_name:'Synthetic'},text:'Synthetic Jetree test: what is 17 plus 25? Reply with 42.'}};
 const webhook=await fetch(origin+'/api/webhook/telegram/'+agent.id,{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':webhookSecret},body:JSON.stringify(hookBody)});assert.equal(webhook.status,200);
 const replay=await fetch(origin+'/api/webhook/telegram/'+agent.id,{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':webhookSecret},body:JSON.stringify(hookBody)});assert.equal(replay.status,200);
 const queued=await service.from('telegram_updates').select('id',{head:true,count:'exact'}).eq('bot_id',bot.id);db(queued,'queue dedup');assert.equal(queued.count,1);
 // Simulate a retry after the user message was already persisted.
 const queuedUpdate=db(await service.from('telegram_updates').select('id').eq('bot_id',bot.id).eq('update_id',updateId).single(),'seeded retry update');
 db(await service.from('telegram_chat_sessions').insert({bot_id:bot.id,chat_id:target.chatId,conversation_id:result.body.conversationId}),'seed retry session');
 db(await service.from('messages').insert({conversation_id:result.body.conversationId,role:'user',content:hookBody.message.text,telegram_update_id:queuedUpdate.id}),'seed already persisted Telegram message');
 async function worker(){const r=await fetch(origin+'/api/telegram/worker',{method:'POST',headers:{'x-jetree-worker-secret':process.env.JETREE_TELEGRAM_WORKER_SECRET},signal:AbortSignal.timeout(180000)});assert.equal(r.status,200);assert.equal((await r.json()).processed,1);}
 await worker();
 const update=db(await service.from('telegram_updates').select('id,status,attempts,task_id,response_text,last_error').eq('bot_id',bot.id).eq('update_id',updateId).single(),'queue result');console.log('Worker status '+update.status+'; error '+(update.last_error||'none'));assert.equal(update.status,'completed');
 const messageCount=await service.from('messages').select('id',{head:true,count:'exact'}).eq('telegram_update_id',update.id);db(messageCount,'idempotent message count');assert.equal(messageCount.count,1);assert.match(update.response_text,/42/);
 const task=db(await service.from('tasks').select('status,result').eq('id',update.task_id).single(),'task result');assert.equal(task.status,'completed');assert.match(task.result,/42/);console.log('PASS authenticated webhook, real worker inference, Telegram delivery and completed task');
 const retry=db(await service.from('telegram_updates').insert({bot_id:bot.id,agent_id:agent.id,update_id:updateId+1,chat_id:target.chatId,message_text:'Synthetic delivery retry',response_text:'Jetree E2E: synthetic delivery retry recovered.',status:'delivery_pending',task_id:update.task_id}).select('id').single(),'retry fixture');
 db(await service.from('telegram_bots').update(encrypt('000000:synthetic_invalid_token')).eq('id',bot.id),'inject invalid delivery credential');await worker();
 const failed=db(await service.from('telegram_updates').select('status,attempts,last_error,next_attempt_at').eq('id',retry.id).single(),'retry metadata');assert.equal(failed.status,'delivery_pending');assert.equal(failed.attempts,1);assert.equal(failed.last_error,'TELEGRAM_DELIVERY_FAILED');assert(new Date(failed.next_attempt_at)>new Date());
 db(await service.from('telegram_bots').update(encrypt(process.env.JETREE_E2E_TELEGRAM_BOT_TOKEN)).eq('id',bot.id),'restore test bot credential');db(await service.from('telegram_updates').update({next_attempt_at:new Date(0).toISOString()}).eq('id',retry.id),'advance only synthetic retry');await worker();assert.equal(db(await service.from('telegram_updates').select('status').eq('id',retry.id).single(),'recovered delivery').status,'completed');const afterRetry=db(await service.from('agent_executions').select('id').eq('user_id',user.id),'execution count after delivery retry');assert.equal(afterRetry.length,2);console.log('PASS delivery failure, backoff and recovery without repeated inference');
 const terminal=db(await service.from('telegram_updates').insert({bot_id:bot.id,agent_id:agent.id,update_id:updateId+2,chat_id:target.chatId,message_text:'Synthetic terminal failure',response_text:'Synthetic terminal failure',status:'delivery_pending',attempts:4,task_id:update.task_id}).select('id').single(),'terminal fixture');db(await service.from('telegram_bots').update(encrypt('000000:synthetic_invalid_token')).eq('id',bot.id),'terminal failure injection');await worker();assert.equal(db(await service.from('telegram_updates').select('status,attempts').eq('id',terminal.id).single(),'terminal status').status,'failed');assert.equal(db(await service.from('tasks').select('status').eq('id',update.task_id).single(),'terminal task').status,'failed');console.log('PASS fifth failed attempt is terminal and task is failed');


 db(await service.from('telegram_bots').update(encrypt(process.env.JETREE_E2E_TELEGRAM_BOT_TOKEN)).eq('id',bot.id),'restore valid test bot');
 async function expectGuard(updateNumber,code){
   const record=db(await service.from('telegram_updates').insert({bot_id:bot.id,agent_id:agent.id,update_id:updateNumber,chat_id:target.chatId,message_text:'Synthetic blocked delivery',response_text:'Must never be sent',status:'delivery_pending'}).select('id').single(),'guard fixture');
   await worker();const blocked=db(await service.from('telegram_updates').select('status,last_error').eq('id',record.id).single(),'guard result');assert.equal(blocked.status,'failed');assert.equal(blocked.last_error,code);
 }
 db(await service.from('agents').update({deleted_at:new Date().toISOString()}).eq('id',agent.id),'archive synthetic agent');await expectGuard(updateId+3,'AGENT_OR_DEPARTMENT_ARCHIVED');db(await service.from('agents').update({deleted_at:null}).eq('id',agent.id),'restore synthetic agent');
 db(await service.from('departments').update({deleted_at:new Date().toISOString()}).eq('id',dep),'archive synthetic department');await expectGuard(updateId+4,'AGENT_OR_DEPARTMENT_ARCHIVED');db(await service.from('departments').update({deleted_at:null}).eq('id',dep),'restore synthetic department');
 const foreign=db(await service.auth.admin.createUser({email:'jetree-e2e-foreign-'+run+'@example.invalid',password:randomBytes(32).toString('base64url')+'!Aa1',email_confirm:true}),'foreign synthetic owner').user;extraUsers.push(foreign.id);
 db(await service.from('telegram_bots').update({owner_user_id:foreign.id}).eq('id',bot.id),'set unassigned synthetic owner');await expectGuard(updateId+5,'BOT_OWNER_ACCESS_REVOKED');
 db(await service.from('department_members').insert({department_id:dep,user_id:foreign.id}),'grant synthetic membership');db(await service.from('department_members').delete().eq('department_id',dep).eq('user_id',foreign.id),'revoke synthetic membership');await expectGuard(updateId+6,'BOT_OWNER_ACCESS_REVOKED');
 db(await service.from('telegram_bots').update({owner_user_id:user.id}).eq('id',bot.id),'restore synthetic owner');console.log('PASS worker blocks archived agents/departments, foreign owners and revoked members before delivery');
 const revoke=await api('/api/provider-connections?id='+connectionId,'DELETE',{provider:'gemini'});assert.equal(revoke.status,200);connected=false;const denied=await api('/api/agents/chat','POST',{agentId:agent.id,message:'Synthetic post-revocation denial'});assert.equal(denied.status,409);console.log('PASS provider revocation blocks new inference');
} catch(e){console.error(e instanceof assert.AssertionError?e.message:'Live test failed; sensitive details suppressed');process.exitCode=1;} finally {
 if(connected)await api('/api/provider-connections?id='+connectionId,'DELETE',{provider:'gemini'}).catch(()=>{});
 await client.auth.signOut();
 if(user){for(const table of ['tasks','activity_logs'])db(await service.from(table).delete().eq(table==='tasks'?'created_by':'user_id',user.id),'cleanup '+table);}
 if(dep)db(await service.from('departments').delete().eq('id',dep),'cleanup department');
 if(user)db(await service.auth.admin.deleteUser(user.id),'cleanup Auth');
 for(const id of extraUsers)db(await service.auth.admin.deleteUser(id),'cleanup foreign Auth');
 console.log('Synthetic Gemini fixtures removed');
}
