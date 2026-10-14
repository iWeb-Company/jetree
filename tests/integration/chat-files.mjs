import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
assert.equal(process.env.CI, 'true'); assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true');
const origin = process.env.JETREE_APP_URL;
assert.equal(new URL(origin).hostname, '127.0.0.1'); assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const db = r => { assert.equal(r.error, null, r.error?.message); return r.data; };
const users = []; let department, browser;
try {
  for (let n=0;n<3;n++) {
    const email=`files-${randomBytes(8).toString('hex')}@example.invalid`,password=randomBytes(24).toString('base64url')+'!Aa1';
    const user=db(await service.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
    users.push({...user,email,password,token:db(await client.auth.signInWithPassword({email,password})).session.access_token});
  }
  const [owner,member,outsider]=users;
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY,'base64'),iv);
  const encrypted=Buffer.concat([cipher.update('sk-or-v1-synthetic-files','utf8'),cipher.final()]);
  db(await service.rpc('save_provider_api_connection',{owner_id:owner.id,detected_provider:'custom',encrypted_value:encrypted.toString('base64'),encrypted_iv:iv.toString('base64'),encrypted_tag:cipher.getAuthTag().toString('base64')}));
  department=db(await service.from('departments').insert({name:'Files CI',created_by:owner.id}).select('id').single());
  db(await service.from('department_members').insert({department_id:department.id,user_id:member.id}));
  const api=(user,path,body)=>fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  let agent;
  for(const role of ['independent','manager']) {
    agent=db(await service.from('agents').insert({department_id:department.id,created_by:owner.id,name:'Files '+role,role_type:role,provider:'custom',model:'synthetic-custom:free',enabled_tool_ids:[]}).select('id').single());
    for(const format of ['pdf','xlsx','html']) {
      const response=await api(owner,'/api/agents/chat',{agentId:agent.id,message:`[Files CI ${format}] Creá un archivo ${format}`});
      const body=await response.json();assert.equal(response.status,200,body.error);assert.equal(body.files.length,1);
      const file=body.files[0]; const download=await api(owner,'/api/chat-files?id='+file.id);
      assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment;/);
      const bytes=Buffer.from(await download.arrayBuffer());
      if(format==='pdf')assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);
      if(format==='xlsx'){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);assert.equal(workbook.worksheets[0].getCell('B2').value,42);}
      if(format==='html'){assert.match(bytes.toString(),/<!doctype html>/);assert.match(download.headers.get('content-security-policy'),/sandbox/);}
      assert.equal((await api(member,'/api/chat-files?id='+file.id)).status,200);
      assert.equal((await api(outsider,'/api/chat-files?id='+file.id)).status,404);
      assert.equal((await fetch(origin+'/api/chat-files?id='+file.id)).status,401);
      const history=await (await api(owner,'/api/conversations?agentId='+agent.id)).json();
      assert.ok(history.messages.some(message=>message.files?.some(item=>item.id===file.id)));
    }
  }
  // Telegram uses the same generated files and caches them before delivery.
  const tokenIv=randomBytes(12),tokenCipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY,'base64'),tokenIv);
  const tokenBytes=Buffer.concat([tokenCipher.update('synthetic-audio-token'),tokenCipher.final()]);const secret='synthetic-files-webhook';
  const bot=db(await service.from('telegram_bots').insert({agent_id:agent.id,owner_user_id:owner.id,token_ciphertext:tokenBytes.toString('base64'),token_iv:tokenIv.toString('base64'),token_auth_tag:tokenCipher.getAuthTag().toString('base64'),secret_hash:createHash('sha256').update(secret).digest('hex')}).select('id').single());
  const post=body=>fetch(origin+'/api/webhook/telegram/'+agent.id,{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(body)});
  for(const [n,format] of ['pdf','xlsx','html'].entries()) {
    const update={update_id:9600+n,message:{chat:{id:667788},text:`[Files CI ${format}] Creá ${format}`}};
    assert.equal((await post(update)).status,200);
    let row;
    for(let i=0;i<150;i++){row=db(await service.from('telegram_updates').select('status,last_error,response_file_ids').eq('bot_id',bot.id).eq('update_id',update.update_id).maybeSingle());if(row?.status==='completed')break;assert.notEqual(row?.status,'failed',row?.last_error);await new Promise(r=>setTimeout(r,200));}
    assert.equal(row?.status,'completed');assert.equal(row.response_file_ids.length,1);
    const file=db(await service.from('chat_files').select('telegram_delivered').eq('id',row.response_file_ids[0]).single());assert.equal(file.telegram_delivered,true);
    assert.equal((await post(update)).status,200);
  }
  const events=(await readFile('artifacts/telegram-fixture-events.jsonl','utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(e=>e.operation==='sendDocument'&&String(e.chatId)==='667788').length,3);
  browser=await chromium.launch();const page=await browser.newPage();await page.goto(origin);
  await page.locator('input[type=email]').fill(owner.email);await page.locator('input[type=password]').fill(owner.password);await page.getByRole('button',{name:'Acceder al Workspace'}).click();
  await page.getByRole('button',{name:'Cerrar Sesión'}).waitFor({timeout:60000});await page.getByRole('button',{name:'Agentes IA',exact:true}).click();
  await page.getByRole('button',{name:'💬 Hablar',exact:true}).first().click();
  await page.getByRole('button',{name:'Descargar archivo',exact:true}).first().waitFor();
  await page.screenshot({path:'artifacts/chat-files-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/chat-files-mobile.png',fullPage:true});
  console.log('PASS generated PDF, XLSX and HTML for both roles, authenticated downloads, department isolation, history and Telegram document deduplication');
} finally {
  await browser?.close();
  if(department){const files=db(await service.from('chat_files').select('object_path').in('owner_user_id',users.map(u=>u.id)));if(files.length)await service.storage.from('chat-files').remove(files.map(f=>f.object_path));db(await service.from('tasks').delete().eq('department_id',department.id));db(await service.from('departments').delete().eq('id',department.id));}
  for(const user of users)db(await service.auth.admin.deleteUser(user.id));
}
