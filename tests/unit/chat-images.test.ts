import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generationTarget, imageRequest, imageAdvice, MAX_IMAGE_BYTES } from '../../src/lib/chat-images';
import { describeImages, generateImage } from '../../src/lib/server/image-provider';
import { normalizeImage } from '../../src/lib/server/chat-image-store';
import { deliverTelegramImage, downloadTelegramImage } from '../../src/lib/server/telegram-images';
import { extractTelegramTextUpdate } from '../../src/lib/telegram-webhook';
import type { Agent, AIProvider } from '../../src/types';

const agent: Agent = { id: 'test', name: 'Test', departmentId: 'test', description: '', roleType: 'independent', provider: 'gemini', model: 'any-compatible-model', systemPrompt: '', status: 'idle' };
const image = { bytes: Buffer.from('synthetic'), mimeType: 'image/png' };
test('image generation recognizes explicit requests but never informational questions or negation', () => {
  for (const text of ['Generá una imagen de un gato', 'Creame un logo', 'Podés generar una foto de un árbol', 'Quiero una imagen de un auto', '/imagen un paisaje', '/imagen@jetree_bot un paisaje']) assert.equal(imageRequest(text).generate, true, text);
  for (const text of ['Qué modelo puede generar imágenes?', 'No generes una imagen', 'Explicame cómo generar una imagen', 'Mostrame la imagen anterior', 'Quiero saber cómo generar imágenes', 'La imagen dice: generá una imagen']) assert.equal(imageRequest(text).generate, false, text);
  assert.equal(imageRequest('un gato', true).generate, true);
  assert.equal(imageRequest('/imagen un gato').prompt, 'un gato');
  assert.equal(imageRequest('[Transcripción de audio]\nGenerá una imagen de un gato').generate, true);
});
test('model advice does not restrict arbitrary compatible IDs or silently change provider', () => {
  assert.deepEqual(generationTarget({ ...agent, imageProvider: 'custom', imageModel: 'future-vendor/future-image:beta' }), { provider: 'custom', model: 'future-vendor/future-image:beta' });
  assert.equal(generationTarget({ ...agent, provider: 'groq' }).provider, 'groq');
  assert.match(imageAdvice('generation', 'custom'), /Podés elegir otro/);
});
test('vision sends actual images, exact chosen models and private data URLs to each provider', async () => {
  for (const provider of ['gemini', 'claude', 'openai', 'groq', 'custom', 'deepseek'] as AIProvider[]) {
    const fetcher: typeof fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body)); const headers = new Headers(options?.headers);
      assert.ok([...headers.values()].some(value => value.includes('synthetic-secret')));
      if (provider === 'gemini') {
        assert.match(String(_url), /chosen-vision/); assert.equal(body.contents[0].parts[2].inlineData.data, image.bytes.toString('base64'));
        return Response.json({ candidates: [{ content: { parts: [{ text: 'Vision OK' }] } }] });
      }
      assert.equal(body.model, 'chosen-vision');
      const part = body.messages[0].content[2];
      assert.equal(provider === 'claude' ? part.source.data : part.image_url.url, provider === 'claude' ? image.bytes.toString('base64') : 'data:image/png;base64,' + image.bytes.toString('base64'));
      return Response.json(provider === 'claude' ? { content: [{ type: 'text', text: 'Vision OK' }] } : { choices: [{ message: { content: 'Vision OK' } }] });
    };
    assert.equal(await describeImages({ ...agent, provider, visionModel: 'chosen-vision' }, 'describe', [image], 'synthetic-secret', fetcher), 'Vision OK');
  }
});
test('Google, OpenAI and OpenRouter generate binary images through their documented endpoints', async () => {
  for (const provider of ['gemini', 'openai', 'custom'] as AIProvider[]) {
    const fetcher: typeof fetch = async (url, options) => {
      const body = JSON.parse(String(options?.body)); assert.equal(body.model, 'future-image');
      assert.equal(options?.redirect, 'error');
      if (provider === 'gemini') {
        assert.match(String(url), /v1beta\/interactions$/); assert.equal(body.store, false);
        assert.deepEqual(body.response_format, { type: 'image', mime_type: 'image/jpeg', delivery: 'inline' });
        return Response.json({ steps: [{ type: 'thought', content: [{ type: 'image', data: 'ignored' }] }, { type: 'model_output', content: [{ type: 'image', data: image.bytes.toString('base64'), mime_type: image.mimeType }] }] });
      }
      assert.match(String(url), provider === 'custom' ? /api\/v1\/images$/ : /v1\/images\/generations$/);
      return Response.json({ data: [{ b64_json: image.bytes.toString('base64'), media_type: image.mimeType }] });
    };
    assert.deepEqual((await generateImage(provider, 'future-image', 'draw', 'synthetic', [], fetcher)).bytes, image.bytes);
  }
});
test('image edits forward references; rejected or URL-only outputs never become fake images', async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.match(String(url), /images\/edits$/); assert.ok(options?.body instanceof FormData);
    assert.equal(options.body.getAll('image[]').length, 1);
    return Response.json({ data: [{ b64_json: image.bytes.toString('base64') }] });
  };
  await generateImage('openai', 'arbitrary-image', 'edit', 'synthetic', [image], fetcher);
  await assert.rejects(generateImage('custom', 'any', 'draw', 'synthetic', [], async () => Response.json({ data: [{ url: 'http://localhost/private' }] })), /IMAGE_GENERATION_EMPTY/);
  await assert.rejects(generateImage('openai', 'any', 'draw', 'secret', [], async () => Response.json({ error: 'secret must not leak' }, { status: 402 })), /IMAGE_RATE_LIMITED/);
  await assert.rejects(generateImage('claude', 'any', 'draw', 'secret'), /IMAGE_GENERATION_UNSUPPORTED/);
});
test('images are decoded, metadata removed, dimensions bounded and malicious formats rejected', async () => {
  const bytes = await sharp({ create: { width: 2100, height: 20, channels: 3, background: 'red' } }).withMetadata().jpeg().toBuffer();
  const clean = await normalizeImage(bytes); const metadata = await sharp(clean.bytes).metadata();
  assert.equal(metadata.width, 2048); assert.equal(metadata.exif, undefined); assert.equal(clean.mimeType, 'image/png');
  await assert.rejects(normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')), /IMAGE_FORMAT_INVALID/);
  await assert.rejects(normalizeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1)), /IMAGE_TOO_LARGE/);
});
test('Telegram accepts highest-resolution photos and image documents with captions', () => {
  const update = { update_id: 1, message: { chat: { id: 2, type: 'private' }, from: { id: 3 }, photo: [{ file_id: 'small', width: 10, height: 10 }, { file_id: 'large', width: 100, height: 100 }], caption: 'Qué ves?' } };
  assert.equal(extractTelegramTextUpdate(update)?.image?.fileId, 'large');
  assert.equal(extractTelegramTextUpdate(update)?.text, 'Qué ves?');
  assert.equal(extractTelegramTextUpdate({ update_id: 2, message: { chat: { id: 2 }, document: { file_id: 'png_file', mime_type: 'image/png' } } })?.text, 'Describí esta imagen.');
  assert.equal(extractTelegramTextUpdate({ update_id: 3, message: { chat: { id: 2 }, document: { file_id: 'svg_file', mime_type: 'image/svg+xml' } } }), null);
});
test('Telegram image download rejects traversal and bounds chunked bodies', async () => {
  await assert.rejects(downloadTelegramImage('synthetic', { fileId: 'image' }, async () => Response.json({ ok: true, result: { file_path: '../private.png' } })), /IMAGE_DOWNLOAD_FAILED/);
  let n = 0;
  await assert.rejects(downloadTelegramImage('synthetic', { fileId: 'image' }, async () => ++n === 1 ? Response.json({ ok: true, result: { file_path: 'photos/photo.png' } }) : new Response(Buffer.alloc(MAX_IMAGE_BYTES + 1))), /IMAGE_TOO_LARGE/);
});
test('Telegram photo delivery checkpoints success and refuses an ambiguous duplicate', async () => {
  let writes = 0; let calls = 0;
  const service: any = { from: (table: string) => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { object_path: 'synthetic', byte_size: 3, mime_type: 'image/png' }, error: null }) }) }) }), update: () => ({ eq: async () => { writes++; return { error: null }; } }) }), storage: { from: () => ({ download: async () => ({ data: new Blob(['png']), error: null }) }) } };
  const update: any = { id: '1', agent_id: 'agent', chat_id: 2, response_image_id: 'image', response_text: 'Generated' };
  await deliverTelegramImage(service, 'synthetic', update, async (_url, options) => { calls++; assert.ok(options?.body instanceof FormData); return Response.json({ ok: true }); });
  assert.equal(writes, 2); assert.equal(update.image_sent, true); await deliverTelegramImage(service, 'synthetic', update, async () => { throw new Error('must not resend'); }); assert.equal(calls, 1);
  await assert.rejects(deliverTelegramImage(service, 'synthetic', { ...update, image_sent: false, image_delivery_started: true }), /IMAGE_DELIVERY_UNCERTAIN/);
});
