import { NextResponse } from 'next/server';
import { appBaseUrl } from '@/lib/server/tool-connections';
import { MCP_READ, MCP_WRITE } from '@/lib/mcp-contract';
export const dynamic = 'force-dynamic';
export function GET() {
  const origin = appBaseUrl();
  return NextResponse.json({ issuer: origin, authorization_endpoint: origin + '/claude/autorizar', token_endpoint: origin + '/api/mcp-oauth/token', registration_endpoint: origin + '/api/mcp-oauth/register', revocation_endpoint: origin + '/api/mcp-oauth/revoke', scopes_supported: [MCP_READ, MCP_WRITE], response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], client_id_metadata_document_supported: false });
}
