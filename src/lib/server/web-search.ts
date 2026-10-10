import type { ToolRequest } from '@/lib/agents/tool-catalog';

export async function webSearch(operation: ToolRequest['operation'], input: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TOOL_SEARCH_NOT_CONFIGURED');
  const video = operation === 'search_youtube';
  const response = await fetcher('https://api.tavily.com/search', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: input.query, max_results: input.maxResults || 5, search_depth: 'basic', auto_parameters: false, include_answer: false, include_raw_content: false, ...(video ? { include_domains: ['youtube.com', 'youtu.be'] } : {}) }),
    signal: AbortSignal.timeout(20_000), redirect: 'error',
  });
  if (!response.ok) throw new Error([429, 432, 433].includes(response.status) ? 'TOOL_PROVIDER_RATE_LIMITED' : response.status === 401 ? 'TOOL_PROVIDER_AUTH_FAILED' : 'TOOL_OPERATION_FAILED');
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results || []).filter(item => {
    try { const url = new URL(item.url || ''); return ['http:', 'https:'].includes(url.protocol) && (!video || ((url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com' || url.hostname === 'm.youtube.com') && (url.pathname === '/watch' && Boolean(url.searchParams.get('v')) || /^\/(shorts|embed)\/[^/]+/.test(url.pathname)) || url.hostname === 'youtu.be' && url.pathname.length > 1)); } catch { return false; }
  }).slice(0, Number(input.maxResults || 5)).map(item => ({ title: item.title?.slice(0, 300), url: item.url, content: item.content?.slice(0, 1500) }));
}
