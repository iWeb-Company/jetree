export async function analyzeWithClaude(prompt: string, apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
  if (!apiKey) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      const error = new Error('Anthropic request failed.');
      Object.assign(error, { status: response.status });
      throw error;
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'Sin respuesta de Claude.';
  } catch (error) {
    throw error;
  }
}
