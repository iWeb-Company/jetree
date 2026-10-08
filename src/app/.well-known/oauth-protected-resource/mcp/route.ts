import { NextResponse } from 'next/server';
import { appBaseUrl } from '@/lib/server/tool-connections';
import { MCP_READ, MCP_WRITE } from '@/lib/mcp-contract';
export const dynamic = 'force-dynamic';
export function GET() {
  const origin = appBaseUrl();
  return NextResponse.json({ resource: origin + '/mcp', authorization_servers: [origin], scopes_supported: [MCP_READ, MCP_WRITE], bearer_methods_supported: ['header'], resource_name: 'Jetree · Claude' });
}
