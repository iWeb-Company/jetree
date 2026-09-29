import OpenAI from 'openai';

export async function analyzeWithChatGPT(prompt: string, apiKey: string, model: string = 'gpt-4o-mini') {
  if (!apiKey) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
  try {
    const client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 1 });
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  } catch (error) {
    throw error;
  }
}

export async function analyzeWithOpenRouter(prompt: string, apiKey: string, model: string) {
  if (!apiKey) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
  if (!model || model === 'custom-model') throw new Error('CUSTOM_MODEL_REQUIRED');

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    timeout: 25_000,
    maxRetries: 1,
    defaultHeaders: { 'X-Title': 'Jetree' },
  });
  const response = await client.chat.completions.create({
    model,
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0].message.content;
}
