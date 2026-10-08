import { availableMcpTools, runMcpTool, toolResult } from '@/lib/server/mcp-tools';
import { NextResponse } from 'next/server';
import { requireMcpContext, mcpChallenge, mcpJsonHeaders } from '@/lib/server/mcp-auth';
import { appBaseUrl } from '@/lib/server/tool-connections';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { validMcpOrigin } from '@/lib/mcp-contract';
import { toolErrorMessage } from '@/lib/tool-feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const versions = ['2025-11-25', '2025-06-18', '2025-03-26'];
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'MCP_UNAVAILABLE';
  const status = code === 'MCP_AUTH_REQUIRED' ? 401 : code === 'BODY_TOO_LARGE' ? 413 : code === 'BODY_INVALID' || error instanceof SyntaxError ? 400 : 503;
  return NextResponse.json({ error: status === 401 ? 'Autorización de Jetree requerida.' : 'No se pudo completar la solicitud.' }, { status, headers: { ...mcpJsonHeaders, ...(status === 401 ? { 'WWW-Authenticate': mcpChallenge() } : {}) } });
}
export async function POST(request: Request) {
  if (!validMcpOrigin(request.headers.get('origin'), appBaseUrl())) return new Response(null, { status: 403 });
  const version = request.headers.get('mcp-protocol-version');
  if (version && !versions.includes(version)) return new Response(null, { status: 400 });
  if (!request.headers.get('accept')?.includes('application/json') || !request.headers.get('accept')?.includes('text/event-stream')) return new Response(null, { status: 406 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, { status: 415 });
  try {
    const context = await requireMcpContext(request);
    const body = await readBoundedJson(request, 24_000);
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string' || (body.id !== undefined && typeof body.id !== 'string' && typeof body.id !== 'number')) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, { status: 400, headers: mcpJsonHeaders });
    if (body.id === undefined) return new Response(null, { status: 202, headers: mcpJsonHeaders });
    let result;
    if (body.method === 'initialize') result = { protocolVersion: versions.includes(body.params?.protocolVersion) ? body.params.protocolVersion : versions[0], capabilities: { tools: {} }, serverInfo: { name: 'Jetree', version: '1.0.0' }, instructions: 'Claude razona en su aplicación oficial. Jetree proporciona herramientas de tu usuario. Los cambios requieren aprobación humana en Jetree. No invoques agentes para obtener inferencia ni intentes aprobar cambios mediante MCP.' };
    else if (body.method === 'ping') result = {};
    else if (body.method === 'tools/list') result = { tools: availableMcpTools(context) };
    else if (body.method === 'tools/call') {
      try {
        const args = body.params?.arguments;
        if (args && (typeof args !== 'object' || Array.isArray(args))) throw new Error('TOOL_INPUT_INVALID');
        result = toolResult(await runMcpTool(context, body.params?.name, args || {}));
      } catch (error) { const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED'; result = toolResult({ error: toolErrorMessage(code), code }, true); }
    } else return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }, { headers: mcpJsonHeaders });
    return NextResponse.json({ jsonrpc: '2.0', id: body.id, result }, { headers: mcpJsonHeaders });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  if (!validMcpOrigin(request.headers.get('origin'), appBaseUrl())) return new Response(null, { status: 403 });
  try { await requireMcpContext(request); return new Response(null, { status: 405, headers: { ...mcpJsonHeaders, Allow: 'POST' } }); } catch (error) { return failure(error); }
}
export const DELETE = GET;
