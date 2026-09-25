import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY || '';

export const openai = new OpenAI({ apiKey });

export async function analyzeWithChatGPT(prompt: string) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error al analizar con ChatGPT:', error);
    throw error;
  }
}