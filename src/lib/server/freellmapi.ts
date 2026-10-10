// Administrator-controlled gateway only: never accept an endpoint from a request
// or a model catalog. Private Docker networking is supported intentionally.
export function freeLLMApiBaseUrl(): string {
  const raw = process.env.FREELLMAPI_BASE_URL;
  if (!raw) throw new Error('FREELLMAPI_NOT_CONFIGURED');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('FREELLMAPI_NOT_CONFIGURED');
  }
  return url.toString().replace(/\/$/, '');
}
