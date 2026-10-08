import { randomBytes } from 'node:crypto';
import { getServiceSupabase } from '@/lib/server/auth';
import { appBaseUrl } from '@/lib/server/tool-connections';
import { mcpToken, tokenHash } from '@/lib/mcp-contract';

export const mcpJsonHeaders = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
export const newMcpToken = (kind: 'a' | 'r') => `jtm_${kind}_${randomBytes(32).toString('base64url')}`;
export interface McpAgent { id: string; name: string; description: string | null; enabled_tool_ids: string[] }
export interface McpContext { grantId: string; userId: string; scopes: string[]; agents: McpAgent[] }
export async function requireMcpContext(request: Request): Promise<McpContext> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!mcpToken(token, 'a')) throw new Error('MCP_AUTH_REQUIRED');
  const service = getServiceSupabase();
  const { data, error } = await service.rpc('mcp_grant_context', { access_hash: tokenHash(token!) });
  if (error) throw new Error('MCP_UNAVAILABLE');
  if (!data) throw new Error('MCP_AUTH_REQUIRED');
  // Enforce current identity status, including deletion or an administrator ban.
  const { data: identity, error: identityError } = await service.auth.admin.getUserById(data.userId);
  if (identityError || !identity.user) throw new Error('MCP_AUTH_REQUIRED');
  const bannedUntil = (identity.user as unknown as { banned_until?: string }).banned_until;
  if (bannedUntil && Date.parse(bannedUntil) > Date.now()) throw new Error('MCP_AUTH_REQUIRED');
  return data;
}
export function mcpChallenge() {
  return `Bearer resource_metadata="${appBaseUrl()}/.well-known/oauth-protected-resource/mcp", scope="jetree:read"`;
}
