import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverTelegramFiles } from '../../src/lib/server/telegram-files';
test('Telegram documents checkpoint delivery and never replay an ambiguous send', async () => {
  for (const ambiguous of [false, true]) {
    const row = { id:'f',agent_id:'a',message_id:'m',object_path:'private/f',mime_type:'text/html',name:'test.html',byte_size:4,telegram_delivery_started:false,telegram_delivered:false };
    const service = {
      storage: { from: () => ({ download: async () => ({ data:new Blob(['test']),error:null }) }) },
      from: () => {
        let patch: any;
        const query: any = { select:()=>query,eq:()=>query,not:()=>query,update:(value:any)=>{patch=value;return query;},maybeSingle:async()=>{if(patch)Object.assign(row,patch);return {data:patch?{id:row.id}:row,error:null};},then:(resolve:any)=>{if(patch)Object.assign(row,patch);return Promise.resolve({error:null}).then(resolve);} };
        return query;
      },
    } as any;
    let sends=0;
    const fetcher: typeof fetch = async (_url,init) => {
      sends++;assert.equal((init?.body as FormData).get('chat_id'),'10');assert.equal(((init?.body as FormData).get('document') as File).name,'test.html');
      if(ambiguous)throw new Error('Network reply lost');
      return Response.json({ok:true});
    };
    const update={agent_id:'a',chat_id:10,response_file_ids:['f']};
    if(ambiguous){await assert.rejects(deliverTelegramFiles(service,'synthetic',update,fetcher),/FILE_DELIVERY_UNCERTAIN/);await assert.rejects(deliverTelegramFiles(service,'synthetic',update,fetcher),/FILE_DELIVERY_UNCERTAIN/);}
    else {await deliverTelegramFiles(service,'synthetic',update,fetcher);await deliverTelegramFiles(service,'synthetic',update,fetcher);assert.equal(row.telegram_delivered,true);}
    assert.equal(sends,1);
  }
});
