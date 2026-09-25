import { GoogleGenAI } from '@google/genai';

const defaultApiKey = process.env.GEMINI_API_KEY || '';

export async function analyzeWithGemini(prompt: string, apiKeyOverride?: string, model: string = 'gemini-2.5-flash') {
  try {
    const aiClient = new GoogleGenAI({ apiKey: apiKeyOverride || defaultApiKey });
    const response = await aiClient.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error('Error al analizar con Gemini:', error);
    throw error;
  }
}