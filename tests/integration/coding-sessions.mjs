import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium,expect } from '@playwright/test';
assert.equal(process.env.JETREE_DISPOSABLE_CI,'true');assert.equal(process.env.CI,'true');
const origin=process.env.JETREE_APP_URL;assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'127.0.0.1');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const db=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};const users=[];let browser;
async function api(token,body,path='/api/coding-sessions'){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
const runner=(token,body)=>api(token,body,'/api/coding-runner');
try{
  for(let n=0;n<2;n++){
    const email=`coding-${randomBytes(8).toString('hex')}@example.invalid`;const password=randomBytes(24).toString('base64url')+'!Aa1';const user=db(await service.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);users.push({...user,email,password,client,token:db(await client.auth.signInWithPassword({email,password})).session.access_token});
  }
  const user=users[0];assert.equal((await api(null)).status,401);assert.equal((await runner(user.token,{action:'claim'})).status,401,'User JWT is not runner identity');
  const code=(await api(user.token,{action:'pair'})).body.code;
  const pairing={action:'pair',code,name:'CI local executor',projects:[{localId:'demo',name:'Synthetic code project',models:[{provider:'groq',model:'synthetic'}],testCommand:'node --test'}]};
  const paired=await runner(null,pairing);assert.equal(paired.status,200);assert.equal((await runner(null,pairing)).status,400,'Pair code replay denied');const token=paired.body.token;const projectId=paired.body.projects[0].id;
  assert.equal((await api(users[1].token)).body.projects.length,0);assert.equal((await users[1].client.from('coding_projects').select('*')).error.code,'42501');
  const job={action:'create',projectId,requestId:randomUUID(),prompt:'Fix the sum function',provider:'groq',model:'synthetic',authorized:true};
  assert.equal((await api(user.token,{...job,authorized:false})).status,400);assert.equal((await api(user.token,{...job,model:'foreign'})).status,404);assert.equal((await api(users[1].token,job)).status,404);
  const created=await api(user.token,job);assert.equal(created.status,201);assert.equal((await api(user.token,job)).body.id,created.body.id,'Retry creates one session');
  const claims=await Promise.all([runner(token,{action:'claim'}),runner(token,{action:'claim'})]);const claimed=claims.map(r=>r.body.job).filter(Boolean);assert.equal(claimed.length,1);const j=claimed[0];
  assert.equal((await runner(token,{action:'progress',jobId:j.id,claimId:randomUUID(),sequence:1,stage:'running'})).status,404);
  assert.equal((await runner(token,{action:'progress',jobId:j.id,claimId:j.claimId,sequence:1,stage:'running'})).status,200);
  const report={state:'ready_for_review',files:[{name:'sum.cjs',status:'modified',diff:'--- a/sum.cjs\n+++ b/sum.cjs\n-exports.sum=(a,b)=>a-b;\n+exports.sum=(a,b)=>a+b;'}],summary:'Fixed the sum. Synthetic runner report; no live inference.',verification:{command:'node --test',exitCode:0,output:'3 tests passed'}};
  const complete={action:'complete',jobId:j.id,claimId:j.claimId,status:'ready_for_review',report};
  assert.equal((await runner(token,{...complete,report:{...report,verification:{...report.verification,exitCode:1}}})).status,400);
  assert.equal((await runner(token,complete)).status,200);assert.equal((await runner(token,{...complete,status:'failed',report:null})).status,200);
  const detail=await api(user.token,undefined,'/api/coding-sessions?session='+j.id);assert.equal(detail.body.session.status,'ready_for_review');assert.equal(detail.body.session.report.files[0].name,'sum.cjs');
  assert.equal((await api(users[1].token,undefined,'/api/coding-sessions?session='+j.id)).status,404);
  const second=(await api(user.token,{...job,requestId:randomUUID(),prompt:'Cancelled request'})).body.id;
  const secondClaim=(await runner(token,{action:'claim'})).body.job;assert.equal(secondClaim.id,second);await api(user.token,{action:'cancel',sessionId:second});
  assert.equal((await runner(token,{action:'progress',jobId:second,claimId:secondClaim.claimId,sequence:1,stage:'running'})).body.cancel,true);
  await runner(token,{action:'complete',jobId:second,claimId:secondClaim.claimId,status:'failed',errorCode:'RUN_INTERRUPTED'});assert.equal((await api(user.token,undefined,'/api/coding-sessions?session='+second)).body.session.status,'cancelled');
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(origin);await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill(user.password);await page.getByRole('button',{name:'Acceder al Workspace'}).click();await page.getByRole('button',{name:'Cerrar Sesión'}).waitFor({timeout:60000});await page.getByRole('button',{name:'Código',exact:true}).first().click();
  await page.getByLabel('Proyecto de código').selectOption(projectId);await page.getByLabel('Pedido de código').fill('A real browser queued request');await expect(page.getByRole('button',{name:'Iniciar tarea',exact:true})).toBeDisabled();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Iniciar tarea',exact:true}).click();await expect(page.getByRole('button').filter({hasText:'A real browser queued request'})).toBeVisible();
  await page.getByRole('button').filter({hasText:'Fix the sum function'}).click();await expect(page.getByText('Archivos modificados', {exact:true})).toBeVisible();await page.getByText('sum.cjs · modified',{exact:true}).click();await expect(page.locator('pre').filter({hasText:'exports.sum'})).toBeVisible();
  await mkdir('artifacts',{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>{window.scrollTo(0,0);for(const element of document.querySelectorAll('*'))if(element.scrollTop)element.scrollTop=0;});await page.screenshot({path:`artifacts/coding-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal overflow');}
  await api(user.token,{action:'revoke',executorId:paired.body.executorId});assert.equal((await runner(token,{action:'claim'})).status,401);assert.equal((await api(user.token,{...job,requestId:randomUUID()})).status,404);
  console.log('PASS coding pairing, private runner token, ownership, explicit authorization, model scope, concurrent claim, duplicate delivery, verified reports, cancellation, revocation, desktop/mobile browser and diffs');
}finally{if(browser)await browser.close();for(const user of users)await service.auth.admin.deleteUser(user.id);}
