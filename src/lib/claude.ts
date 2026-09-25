export async function analyzeWithClaude(prompt: string, apiKeyOverride?: string, model: string = 'claude-3-5-sonnet-20241022') {
  const apiKey = apiKeyOverride || process.env.ANTHROPIC_API_KEY || '';

  if (!apiKey) {
    return `[Modo Simulación / Sin API Key de Anthropic]: Claude procesó tu solicitud ("${prompt.slice(0, 60)}..."). Para conectar en vivo tu cuenta, vincula tu suscripción OAuth de Claude Pro o ingresa tu API Key en la configuración del agente.`;
  }

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
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API Error: ${errText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'Sin respuesta de Claude.';
  } catch (error) {
    console.error('Error al analizar con Claude:', error);
    throw error;
  }
}
