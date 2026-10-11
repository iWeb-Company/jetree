// Test-only preload; refuses hosted databases and non-CI use. Never imported by app.
import assert from 'node:assert/strict';
import { appendFile, mkdir } from 'node:fs/promises';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true');
assert.equal(process.env.CI, 'true');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const realFetch = globalThis.fetch;
const failedDeliveries = new Set();
const syntheticImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const issuers = new Map([
  ['api.openai.com', ['sk-proj-synthetic-', 'openai']],
  ['api.groq.com', ['gsk_synthetic-', 'groq']],
  ['api.deepseek.com', ['sk-synthetic-deepseek-', 'deepseek']],
  ['api.anthropic.com', ['sk-ant-api03-synthetic-', 'claude']],
  ['generativelanguage.googleapis.com', ['AIzaSynthetic-', 'gemini']],
  ['openrouter.ai', ['sk-or-v1-synthetic-', 'custom']],
]);
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.figma.com') {
    const token = new Headers(options?.headers).get('X-Figma-Token');
    assert.match(token || '', /^synthetic-figma-[0-9a-f-]{36}$/);
    const owner = token.slice('synthetic-figma-'.length);
    if (url.pathname === '/v1/me') return Response.json({ id: owner, handle: 'Synthetic Figma' });
    if (url.pathname.startsWith('/v1/files/')) {
      const fileKey = url.pathname.split('/')[3];
      if (url.pathname.endsWith('/comments')) return Response.json({ comments: [{ id:'comment1',message:'Synthetic comment',user:{handle:'Designer'} }] });
      let marker = 'wrong-file';
      if (url.searchParams.has('plugin_data') && fileKey !== 'WrongFile123') {
        const query = new URLSearchParams({ select:'marker',user_id:'eq.'+owner,file_key:'eq.'+fileKey,revoked_at:'is.null',order:'created_at.desc',limit:'1' });
        const response = await realFetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/figma_sessions?'+query,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}});
        assert.equal(response.status,200);marker=(await response.json())[0]?.marker;
      }
      return Response.json({name:'Synthetic design',editorType:'figma',role:'editor',version:'1',document:{id:'0:0',type:'DOCUMENT',sharedPluginData:{jetree:{bridge:marker}},children:[{id:'0:1',type:'CANVAS',name:'Page',children:[{id:'1:2',type:'FRAME',name:'Screen'}]}]}});
    }
    throw new Error('Unsupported synthetic Figma endpoint');
  }
  if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
    const body = new URLSearchParams(String(options?.body));
    assert.ok(body.get('code') === 'synthetic-gmail-code' || body.get('refresh_token') === 'synthetic-gmail-refresh');
    return Response.json({ access_token: 'synthetic-gmail-token', refresh_token: 'synthetic-gmail-refresh', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/gmail.modify' });
  }
  if (url.hostname === 'openidconnect.googleapis.com') {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer synthetic-gmail-token');
    return Response.json({ email: 'gmail-fixture@example.invalid' });
  }
  if (url.hostname === 'gmail.googleapis.com') {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer synthetic-gmail-token');
    await mkdir('artifacts', { recursive: true });
    await appendFile('artifacts/gmail-fixture-events.jsonl', JSON.stringify({ path: url.pathname, method: options?.method || 'GET' }) + '\n');
    if (options?.method === 'POST') return Response.json({ id: 'synthetic-mail', threadId: 'synthetic-thread' });
    if (url.pathname.endsWith('/messages')) return Response.json({ messages: [{ id: 'synthetic-mail' }] });
    return Response.json({ id: 'synthetic-mail', threadId: 'synthetic-thread', payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'sender@example.invalid' }, { name: 'Subject', value: 'Synthetic email' }, { name: 'Message-ID', value: '<synthetic@example.invalid>' }], body: { data: Buffer.from('Synthetic email text').toString('base64url') } } });
  }
  if (url.hostname === 'api.tavily.com') {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer synthetic-tavily-key');
    const body = JSON.parse(String(options?.body));
    return Response.json({ results: [{ title: 'Synthetic source', url: body.include_domains ? 'https://www.youtube.com/watch?v=synthetic' : 'https://example.invalid/source', content: 'Synthetic current information' }] });
  }
  if (url.hostname === 'api.telegram.org') {
    assert.ok(url.pathname.includes('botsynthetic-audio-token/'), 'Fixture refuses real Telegram tokens');
    const operation = url.pathname.split('/').at(-1);
    const requestBody = options?.body instanceof FormData ? Object.fromEntries(options.body.entries()) : options?.body ? JSON.parse(options.body) : {};
    await mkdir('artifacts', { recursive: true });
    await appendFile('artifacts/telegram-fixture-events.jsonl', JSON.stringify({ operation, chatId: requestBody.chat_id, fileId: requestBody.file_id, replyMarkup: requestBody.reply_markup, creditsNotice: requestBody.text?.includes('no tiene saldo suficiente') === true }) + '\n');
    if (operation === 'getFile') return Response.json({ ok: true, result: requestBody.file_id?.startsWith('synthetic_image') ? { file_path: 'photos/synthetic.png', file_size: syntheticImage.length } : { file_path: 'voice/synthetic.oga', file_size: 4 } });
    if (operation === 'synthetic.oga') return new Response('ogg!');
    if (operation === 'synthetic.png') return new Response(syntheticImage, { headers: { 'Content-Type': 'image/png' } });
    assert.ok(['sendPhoto', 'sendMessage', 'sendChatAction', 'answerCallbackQuery', 'editMessageReplyMarkup', 'setWebhook'].includes(operation));
    if (operation === 'sendPhoto' && requestBody.chat_id === '445566' && !failedDeliveries.has('image')) { failedDeliveries.add('image'); return Response.json({ ok: false }, { status: 503 }); }
    if (operation === 'sendMessage' && requestBody.chat_id === 54321 && !failedDeliveries.has(requestBody.chat_id)) {
      failedDeliveries.add(requestBody.chat_id);
      return Response.json({ ok: false }, { status: 503 });
    }
    return Response.json({ ok: true, result: true });
  }
  const issuer = issuers.get(url.hostname);
  if (!issuer) return realFetch(input, options);
  const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
  const key = headers.get('authorization')?.replace(/^Bearer /,'') || headers.get('x-api-key') || headers.get('x-goog-api-key') || '';
  // No real key leaves this disposable test process.
  if (!key.toLowerCase().includes('synthetic-')) throw new Error('Fixture refuses non-synthetic provider key');
  if (!key.startsWith(issuer[0]) || key.endsWith('-invalid')) return Response.json({ error: 'Rejected synthetic key' }, { status: 401 });
  if ((options?.method ?? (input instanceof Request ? input.method : 'GET')) === 'POST') {
    const body = options?.body instanceof FormData ? Object.fromEntries(options.body.entries()) : JSON.parse(options?.body ?? await input.clone().text());
    const imageModel = body.model || decodeURIComponent(/\/models\/([^/]+):generateContent$/.exec(url.pathname)?.[1] || '');
    if (imageModel.startsWith('images-ci-')) {
      body.model = imageModel;
      await mkdir('artifacts', { recursive: true });
      const generation = /\/interactions$|\/images(?:\/generations|\/edits)?$/.test(url.pathname);
      if (generation && issuer[1] === 'gemini') assert.deepEqual(body.response_format, { type: 'image', mime_type: 'image/jpeg', delivery: 'inline' }, 'Google only supports JPEG image output format');
      const parts = body.contents?.[0]?.parts || body.messages?.[0]?.content || [];
      const prompt = typeof parts === 'string' ? parts : parts.filter(part => part.type === 'text' || part.text).map(part => part.text).join('\n');
      await appendFile('artifacts/image-fixture-events.jsonl', JSON.stringify({ operation: generation ? 'generate' : 'vision', provider: issuer[1], model: body.model, references: generation ? body.input?.filter?.(item => item.type === 'image').length || body.input_references?.length || (body['image[]'] ? 1 : 0) : parts.filter(part => part.type === 'image' || part.type === 'image_url' || part.inlineData).length }) + '\n');
      if (generation) return issuer[1] === 'gemini' ? Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: syntheticImage.toString('base64') }] }] }) : Response.json({ data: [{ b64_json: syntheticImage.toString('base64'), media_type: 'image/png' }] });
      const text = prompt.includes('Contrato de delegación') ? JSON.stringify({ decision: 'direct', managerNotes: 'Synthetic image checked', directResponse: 'Synthetic manager image understood' }) : 'Synthetic image understood';
      return issuer[1] === 'gemini' ? Response.json({ candidates: [{ content: { parts: [{ text }] } }] }) : issuer[1] === 'claude' ? Response.json({ content: [{ type: 'text', text }] }) : Response.json({ choices: [{ message: { role: 'assistant', content: text } }] });
    }
    if (url.pathname === '/api/v1/audio/transcriptions') return Response.json({error:'Synthetic insufficient credits'},{status:402});
    if (issuer[1] === 'gemini') {
      assert.equal(url.pathname,'/v1beta/models/gemini-3.5-flash-lite:generateContent','Fixture refuses hardcoded unavailable legacy models');
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'audio/ogg');
      return Response.json({ candidates: [{ content: { parts: [{ text: 'Respondé: audio comprendido' }] } }] });
    }
    assert.ok(['synthetic-deepseek','synthetic-custom:free','synthetic-groq'].includes(body.model));
    const toolPrompt = body.messages?.map(item => item.content).join('\n') || '';
    if (toolPrompt.includes('[Telegram tools CI]')) {
      let decision;
      if (toolPrompt.includes('Contrato de delegación')) {
        const target = /- ID: ([0-9a-f-]+);/.exec(toolPrompt)?.[1];
        decision = { decision: 'delegate', managerNotes: 'Delegating synthetic tool test', delegateTo: target, subTask: 'Execute original synthetic tool request' };
      } else if (!toolPrompt.includes('Herramientas disponibles:')) {
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'Vinculá tu chat para herramientas.' } }] });
      } else if (toolPrompt.includes('Mandá un correo de prueba')) {
        decision = toolPrompt.includes('Corrección del servidor: todavía no se creó una aprobación')
          ? { toolId: 'plugin-gmail-core', operation: 'send_message', input: { to: 'recipient@example.invalid', subject: 'Synthetic Telegram email', body: 'Synthetic body' } }
          : { answer: 'Preparé la acción y quedó pendiente de tu aprobación.\nAcción pendiente: send_message' };
      } else if (toolPrompt.includes('Buscá videos')) {
        decision = toolPrompt.includes('Resultados externos anteriores') ? { answer: 'Synthetic video found' } : { toolId: 'plugin-web-search', operation: 'search_youtube', input: { query: 'synthetic videos' } };
      } else if (!toolPrompt.includes('Resultados externos anteriores')) {
        decision = { toolId: 'plugin-gmail-core', operation: 'search_messages', input: { query: 'subject:Synthetic' } };
      } else if (!toolPrompt.includes('["plugin-gmail-core","get_message"')) {
        decision = { toolId: 'plugin-gmail-core', operation: 'get_message', input: { messageId: 'synthetic-mail' } };
      } else decision = { answer: 'Synthetic email text' };
      return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(decision) } }] });
    }
    const audioPrompt = JSON.stringify(body.messages).includes('[Transcripción de audio]');
    return Response.json({ id: 'synthetic', choices: [{ message: { role: 'assistant', content: audioPrompt ? 'Synthetic audio understood' : issuer[1] === 'groq' ? 'Synthetic Groq API OK' : 'Synthetic DeepSeek API OK' } }] });
  }
  return issuer[1] === 'gemini'
    ? Response.json({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] })
    : Response.json({ data: [{ id: 'synthetic-' + issuer[1] }] });
};
