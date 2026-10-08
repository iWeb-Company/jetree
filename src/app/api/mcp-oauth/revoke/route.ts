import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { MCP_CLIENT, mcpToken, tokenHash } from '@/lib/mcp-contract';
import { mcpJsonHeaders } from '@/lib/server/mcp-auth';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 5000) return new Response(null, { status: 413 });
  const reader = request.body?.getReader(); if (!reader) return new Response(null, { status: 400 });
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 5000) { await reader.cancel(); return new Response(null, { status: 413 }); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const raw = Buffer.concat(chunks).toString('utf8');
  const params = new URLSearchParams(raw); const token = params.get('token');
  if (params.get('client_id') === MCP_CLIENT && (mcpToken(token, 'a') || mcpToken(token, 'r'))) {
    const service = getServiceSupabase(); const hash = tokenHash(token!);
    const { error } = await service.from('mcp_grants').update({ revoked_at: new Date().toISOString() }).or(`access_hash.eq.${hash},refresh_hash.eq.${hash}`);
    if (error) return new Response(null, { status: 503, headers: mcpJsonHeaders });
  }
  return NextResponse.json({}, { headers: mcpJsonHeaders });
}
