// Never persist arbitrary engine messages, response bodies or request headers.
export function engineFailure(message) {
  const error = message?.info?.error;
  if (error) {
    const name = ['APIError','ProviderAuthError','MessageAbortedError','ContextOverflowError','UnknownError'].includes(error.name) ? error.name : 'UnknownError';
    const status = error.data?.statusCode;
    const diagnostic = { code: 'ENGINE_ERROR', name, ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}) };
    return { code: name === 'ProviderAuthError' || status === 401 || status === 403 ? 'PROVIDER_AUTH_FAILED' : status === 429 ? 'PROVIDER_RATE_LIMIT' : name === 'ContextOverflowError' ? 'ENGINE_CONTEXT_LIMIT' : name === 'MessageAbortedError' ? 'RUN_INTERRUPTED' : 'ENGINE_TASK_FAILED', diagnostic };
  }
  if (!Array.isArray(message?.parts)) return { code: 'ENGINE_RESPONSE_INVALID', diagnostic: { code: 'ENGINE_RESPONSE_INVALID' } };
  if (!message.parts.some(part => part.type === 'text' && typeof part.text === 'string' && part.text.trim())) {
    const limited = message.info?.finish === 'length' || message.parts.some(part => part.type === 'step-finish' && part.reason === 'length');
    return { code: limited ? 'ENGINE_OUTPUT_LIMIT' : 'ENGINE_EMPTY_RESPONSE', diagnostic: { code: limited ? 'ENGINE_OUTPUT_LIMIT' : 'ENGINE_EMPTY_RESPONSE' } };
  }
  return null;
}
export function failureCode(diagnostics, fallback) {
  const last = diagnostics.filter(item => item.code === 'PROVIDER_HTTP_ERROR').at(-1);
  if (last?.status === 401 || last?.status === 403) return 'PROVIDER_AUTH_FAILED';
  if (last?.status === 429) return 'PROVIDER_RATE_LIMIT';
  if (last?.status === 413) return 'PROVIDER_REQUEST_TOO_LARGE';
  if (last?.category === 'TOKEN_LIMIT') return 'ENGINE_CONTEXT_LIMIT';
  if (last?.category === 'TOOL_GENERATION_FAILED') return 'PROVIDER_TOOL_GENERATION_FAILED';
  if (fallback === 'COMMAND_FAILED:docker') return 'DOCKER_COMMAND_FAILED';
  return /^[A-Z_]{1,80}$/.test(fallback) ? fallback : 'RUN_FAILED';
}
