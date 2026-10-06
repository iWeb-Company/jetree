import { GoogleGenAI } from '@google/genai';

export async function analyzeWithGemini(prompt: string, apiKey: string, model: string = 'gemini-3.5-flash-lite') {
  if (!apiKey) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
  try {
    const aiClient = new GoogleGenAI({ apiKey });
    const response = await aiClient.models.generateContent({
      model: model || 'gemini-3.5-flash-lite',
      contents: prompt,
      config: {
        maxOutputTokens: 1200,
        httpOptions: { timeout: 25_000, retryOptions: { attempts: 2, initialDelay: 0.5, maxDelay: 2 } },
      },
    });
    return response.text;
  } catch (error) {
    throw error;
  }
}
