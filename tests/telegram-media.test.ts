import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadTelegramAudio, audioFormat, MAX_AUDIO_BYTES, transcriptionProvider, transcribeTelegramAudio, startTelegramTyping } from '../src/lib/server/telegram-media';
import { extractTelegramTextUpdate } from '../src/lib/telegram-webhook';

const audio = { fileId: 'synthetic_file', mimeType: 'audio/ogg', duration: 3, size: 4 };
test('voice and audio attachments enter the queue with captions and no binary payload', () => {
  const voice = extractTelegramTextUpdate({ update_id: 1, message: { chat: { id: 2 }, voice: { file_id: audio.fileId, duration: 3, file_size: 4 } } });
  assert.deepEqual(voice?.audio, audio); assert.equal(voice?.text, '[Audio de Telegram]');
  const music = extractTelegramTextUpdate({ update_id: 2, message: { chat: { id: 2 }, caption: ' Resumí esto ', audio: { file_id: 'music', duration: 4, mime_type: 'audio/mpeg' } } });
  assert.equal(music?.text, 'Resumí esto'); assert.equal(music?.audio?.mimeType, 'audio/mpeg');
  assert.equal(extractTelegramTextUpdate({ update_id: 3, message: { chat: { id: 2 }, document: { file_id: 'not-audio' } } }), null);
});
test('audio limits and transcription keys use selected providers only', () => {
  assert.throws(() => audioFormat({ ...audio, duration: 301 }), /AUDIO_TOO_LARGE/);
  assert.throws(() => audioFormat({ ...audio, size: MAX_AUDIO_BYTES + 1 }), /AUDIO_TOO_LARGE/);
  assert.throws(() => audioFormat({ ...audio, mimeType: 'text/html' }), /FORMAT_UNSUPPORTED/);
  assert.equal(transcriptionProvider('custom', { gemini: 'google', custom: 'router' }), 'gemini');
  assert.equal(transcriptionProvider('custom', { openai: 'openai', custom: 'router' }), 'openai');
  assert.equal(transcriptionProvider('custom', { custom: 'router' }), 'custom');
  assert.equal(transcriptionProvider('claude', { gemini: 'google' }), 'gemini');
  assert.throws(() => transcriptionProvider('deepseek', { deepseek: 'key' }), /PROVIDER_REQUIRED/);
});
test('Telegram downloads only approved file paths and enforces actual bytes without trusting metadata', async () => {
  let calls = 0;
  const downloaded = await downloadTelegramAudio('synthetic_token', audio, async (url, options) => {
    calls++; assert.equal(options?.redirect, 'error'); assert.equal(new URL(String(url)).hostname, 'api.telegram.org');
    return calls === 1 ? Response.json({ ok: true, result: { file_path: 'voice/file.oga' } }) : new Response('ogg!');
  });
  assert.equal(downloaded.toString(), 'ogg!');
  await assert.rejects(downloadTelegramAudio('test', audio, async () => Response.json({ ok: true, result: { file_path: '../secret' } })), /DOWNLOAD_FAILED/);
  let fetches = 0;
  await assert.rejects(downloadTelegramAudio('test', audio, async () => {
    return ++fetches === 1 ? Response.json({ ok: true, result: { file_path: 'voice/a.oga' } }) : new Response(new Uint8Array(MAX_AUDIO_BYTES + 1));
  }), /AUDIO_TOO_LARGE/);
});
test('Google, OpenAI and OpenRouter transcription transport never places keys in URLs', async () => {
  for (const provider of ['gemini', 'openai', 'custom'] as const) {
    const text = await transcribeTelegramAudio(Buffer.from('ogg!'), audio, provider, 'synthetic-key', async (url, options) => {
      assert.equal(String(url).includes('synthetic-key'), false); assert.equal(options?.method, 'POST');
      if (provider === 'openai') assert.ok(options?.body instanceof FormData);
      return provider === 'gemini' ? Response.json({ candidates: [{ content: { parts: [{ text: 'hola' }] } }] }) : Response.json({ text: 'hola' });
    });
    assert.equal(text, 'hola');
  }
});
test('typing renews while processing and stops, including when Telegram is unavailable', async () => {
  let calls = 0;
  const stop = startTelegramTyping('synthetic', 123, async (_, options) => { calls++; assert.equal(JSON.parse(String(options?.body)).action, 'typing'); throw new Error('offline'); }, 10);
  await new Promise(resolve => setTimeout(resolve, 35)); await stop();
  const stoppedCount = calls; assert.ok(calls >= 2);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(calls, stoppedCount);
});

test('transcription identifies permanent provider failures without exposing responses or credentials', async () => {
  for (const [status, code] of [[402,'AUDIO_CREDITS_REQUIRED'],[401,'AUDIO_TRANSCRIPTION_AUTH_FAILED'],[403,'AUDIO_TRANSCRIPTION_AUTH_FAILED'],[404,'AUDIO_TRANSCRIPTION_MODEL_UNAVAILABLE'],[400,'AUDIO_TRANSCRIPTION_REJECTED'],[429,'AUDIO_TRANSCRIPTION_FAILED'],[503,'AUDIO_TRANSCRIPTION_FAILED']] as const) {
    await assert.rejects(transcribeTelegramAudio(Buffer.from('ogg!'),audio,'custom','synthetic-secret',async()=>Response.json({ error:'private provider details synthetic-secret' },{status})),error => error instanceof Error && error.message === code);
  }
  await assert.rejects(transcribeTelegramAudio(Buffer.from('ogg!'),audio,'custom','synthetic',async()=>Response.json({text:42})),/AUDIO_EMPTY/);
});
