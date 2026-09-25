import OpenAI from 'openai';

const defaultApiKey = process.env.OPENAI_API_KEY || '';

export async function analyzeWithChatGPT(prompt: string, apiKeyOverride?: string, model: string = 'gpt-4o-mini') {
  try {
    const client = new OpenAI({ apiKey: apiKeyOverride || defaultApiKey });
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error al analizar con ChatGPT:', error);
    throw error;
  }
}