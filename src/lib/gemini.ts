import { GoogleGenAI } from '@google/genai';

export async function analyzeWithGemini(prompt: string, apiKey: string, model: string = 'gemini-2.5-flash') {
  if (!apiKey) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
  try {
    const aiClient = new GoogleGenAI({ apiKey });
    const response = await aiClient.models.generateContent({
      model: model || 'gemini-2.5-flash',
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
