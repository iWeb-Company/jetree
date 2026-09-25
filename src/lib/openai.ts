import OpenAI from 'openai';

export async function analyzeWithChatGPT(prompt: string, apiKey: string, model: string = 'gpt-4o-mini') {
  if (!apiKey) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
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
    defaultHeaders: { 'X-Title': 'Jetree' },
  });
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0].message.content;
}
