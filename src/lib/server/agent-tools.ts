import { getServiceSupabase } from '@/lib/server/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getToolAccessToken } from '@/lib/server/tool-connections';
import { assertToolEnabled, parseToolRequest, type ToolRequest } from '@/lib/agents/tool-catalog';

function capText(value: string, max = 16_000) { return value.length > max ? value.slice(0, max) + '\n[recortado]' : value; }
function encodePath(value: string) { return value.split('/').map(encodeURIComponent).join('/'); }

async function providerResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('TOOL_PROVIDER_AUTH_FAILED');
    if (response.status === 429) throw new Error('TOOL_PROVIDER_RATE_LIMITED');
    if (response.status >= 500) throw new Error('TOOL_PROVIDER_UNAVAILABLE');
    throw new Error('TOOL_OPERATION_FAILED');
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return capText(await response.text());
}

async function githubRequest(token: string, operation: ToolRequest['operation'], input: Record<string, unknown>) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  if (operation === 'list_repositories') {
    const response = await fetch('https://api.github.com/user/repos?visibility=public&sort=updated&per_page=30', { headers, signal: AbortSignal.timeout(15_000) });
    const data = await providerResponse(response) as Array<Record<string, unknown>>;
    return data.map(repo => ({ full_name: repo.full_name, description: repo.description, html_url: repo.html_url, updated_at: repo.updated_at })).slice(0, 30);
  }
  const owner = String(input.owner); const repo = String(input.repo);
  if (operation === 'get_file') {
    const path = encodePath(String(input.path));
    const metadataResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`, { headers, signal: AbortSignal.timeout(12_000) });
    const metadata = await providerResponse(metadataResponse) as { size?: number; type?: string };
    if (metadata.type !== 'file' || Number(metadata.size || 0) > 200_000) throw new Error('TOOL_FILE_TYPE_UNSUPPORTED');
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`, { headers: { ...headers, Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return providerResponse(response);
    return capText(await response.text());
  }
  if (operation === 'create_issue') {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, {
      method: 'POST', headers,
      body: JSON.stringify({ title: input.title, body: input.body }), signal: AbortSignal.timeout(15_000),
    });
    const data = await providerResponse(response) as Record<string, unknown>;
    return { number: data.number, html_url: data.html_url, title: data.title };
  }
  if (operation === 'create_file') {
    const path = encodePath(String(input.path));
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ message: input.message, content: Buffer.from(String(input.content), 'utf8').toString('base64') }), signal: AbortSignal.timeout(15_000),
    });
    const data = await providerResponse(response) as { content?: { html_url?: string; path?: string }; commit?: { sha?: string } };
    return { path: data.content?.path, html_url: data.content?.html_url, commit: data.commit?.sha };
  }
  throw new Error('TOOL_NOT_SUPPORTED');
}

async function driveRequest(token: string, operation: ToolRequest['operation'], input: Record<string, unknown>) {
  const headers = { Authorization: `Bearer ${token}` };
  if (operation === 'search_files') {
    const rawQuery = String(input.query || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `trashed = false${rawQuery ? ` and name contains '${rawQuery}'` : ''}`;
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q); url.searchParams.set('pageSize', String(input.pageSize));
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,size)');
    const data = await providerResponse(await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })) as { files?: unknown[] };
    return (data.files || []).slice(0, 20);
  }
  if (operation === 'get_text_file') {
    const id = encodeURIComponent(String(input.fileId));
    const metadata = await providerResponse(await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,size`, { headers, signal: AbortSignal.timeout(12_000) })) as { mimeType?: string; size?: string };
    if (Number(metadata.size || 0) > 200_000 || !['text/plain', 'text/markdown', 'text/csv', 'application/vnd.google-apps.document'].includes(metadata.mimeType || '')) throw new Error('TOOL_FILE_TYPE_UNSUPPORTED');
    const endpoint = metadata.mimeType === 'application/vnd.google-apps.document'
      ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text%2Fplain`
      : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
    return capText(await String(await providerResponse(response)), 16_000);
  }
  if (operation === 'create_doc') {
    const boundary = 'jetree_' + crypto.randomUUID().replace(/-/g, '');
    const metadata = JSON.stringify({ name: input.name, mimeType: 'application/vnd.google-apps.document' });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.content}\r\n--${boundary}--`;
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType', {
      method: 'POST', headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` }, body, signal: AbortSignal.timeout(20_000),
    });
    return providerResponse(response);
  }
  throw new Error('TOOL_NOT_SUPPORTED');
}

export async function executeAuthorizedTool(client: SupabaseClient, userId: string, agentId: string, toolId: string, operation: string, rawInput: unknown, approvalId?: string, conversationId?: string | null) {
  const service = getServiceSupabase();
  const { data: agent, error: agentError } = await client.from('agents').select('id, enabled_tool_ids').eq('id', agentId).maybeSingle();
  if (agentError || !agent) throw new Error('TOOL_AGENT_ACCESS_DENIED');
  assertToolEnabled(agent.enabled_tool_ids, toolId);
  const request = parseToolRequest(toolId, operation, rawInput);

  if (request.write && !approvalId) {
    const { data: approval, error } = await service.from('agent_tool_approvals').insert({
      user_id: userId, agent_id: agentId, tool_id: toolId, provider: request.provider, operation: request.operation,
      conversation_id: conversationId || null, input: request.input, status: 'pending',
    }).select('id').single();
    if (error || !approval) throw new Error('TOOL_AUDIT_FAILED');
    const { error: callError } = await service.from('agent_tool_calls').insert({
      user_id: userId, agent_id: agentId, approval_id: approval.id, provider: request.provider,
      tool_id: toolId, operation: request.operation, status: 'pending_approval',
      result_summary: 'Esperando aprobación explícita del usuario.',
    });
    if (callError) throw new Error('TOOL_AUDIT_FAILED');
    return { pendingApproval: true, approvalId: approval.id, message: 'La acción de escritura requiere aprobación.' };
  }
  if (request.write && approvalId) {
    const { data: approval } = await service.from('agent_tool_approvals').select('status, user_id, agent_id, tool_id, operation')
      .eq('id', approvalId).maybeSingle();
    if (!approval || approval.status !== 'executing' || approval.user_id !== userId || approval.agent_id !== agentId || approval.tool_id !== toolId || approval.operation !== operation) {
      throw new Error('TOOL_APPROVAL_NOT_PENDING');
    }
  }
  const callQuery = approvalId
    ? await service.from('agent_tool_calls').select('id').eq('approval_id', approvalId).eq('user_id', userId).eq('status', 'executing').maybeSingle()
    : { data: null, error: null };
  let call = callQuery.data;
  let callError = callQuery.error;
  if (!approvalId) {
    const inserted = await service.from('agent_tool_calls').insert({
      user_id: userId, agent_id: agentId, provider: request.provider,
      tool_id: toolId, operation: request.operation, status: 'executing',
    }).select('id').single();
    call = inserted.data;
    callError = inserted.error;
  }
  if (callError || !call) throw new Error('TOOL_AUDIT_FAILED');
  try {
    const token = await getToolAccessToken(userId, request.provider);
    const result = request.provider === 'github'
      ? await githubRequest(token, request.operation, request.input)
      : await driveRequest(token, request.operation, request.input);
    const summary = Array.isArray(result)
      ? `Se devolvieron ${result.length} resultados.`
      : typeof result === 'string'
        ? `Lectura completada; ${result.length} caracteres.`
        : `Operación completada; datos disponibles (${Object.keys((result || {}) as object).join(', ').slice(0, 300)}).`;
    const { error: auditError } = await service.from('agent_tool_calls').update({ status: 'succeeded', result_summary: summary, finished_at: new Date().toISOString() }).eq('id', call.id);
    if (auditError) throw new Error('TOOL_AUDIT_FAILED');
    const content = `Resultado de herramienta (${request.provider} · ${request.operation}):\n${JSON.stringify(result).slice(0, 10_500)}`;
    let message = { id: `tool-${call.id}`, agentId, role: 'assistant' as const, content, timestamp: new Date().toISOString() };
    if (conversationId) {
      const { data: saved, error: messageError } = await service.from('messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content }).select('id, created_at').single();
      if (!messageError && saved) {
        message = { ...message, id: saved.id, timestamp: saved.created_at };
        await service.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
      }
    }
    return { result, message, conversationId: conversationId || null };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED';
    await service.from('agent_tool_calls').update({ status: 'failed', error_code: code, finished_at: new Date().toISOString() }).eq('id', call.id);
    throw error;
  }
}

export async function claimToolApproval(userId: string, approvalId: string) {
  const service = getServiceSupabase();
  const { data, error } = await service.from('agent_tool_approvals').update({ status: 'executing', decided_at: new Date().toISOString() })
    .eq('id', approvalId).eq('user_id', userId).eq('status', 'pending')
    .select('id, agent_id, tool_id, operation, input, conversation_id').maybeSingle();
  if (error || !data) throw new Error('TOOL_APPROVAL_NOT_PENDING');
  const { error: callError } = await service.from('agent_tool_calls').update({ status: 'executing' })
    .eq('approval_id', approvalId).eq('user_id', userId).eq('status', 'pending_approval');
  if (callError) throw new Error('TOOL_AUDIT_FAILED');
  return data;
}

export async function finishToolApproval(userId: string, approvalId: string, status: 'completed' | 'failed', errorCode: string | null = null) {
  const service = getServiceSupabase();
  await service.from('agent_tool_approvals').update({ status, error_code: errorCode, finished_at: new Date().toISOString() }).eq('id', approvalId).eq('user_id', userId);
  if (status === 'failed') await service.from('agent_tool_calls').update({ status: 'failed', error_code: errorCode, finished_at: new Date().toISOString() })
    .eq('approval_id', approvalId).eq('user_id', userId).eq('status', 'executing');
}

export async function rejectToolApproval(userId: string, approvalId: string) {
  const service = getServiceSupabase();
  const { data, error } = await service.from('agent_tool_approvals').update({ status: 'rejected', decided_at: new Date().toISOString(), finished_at: new Date().toISOString() })
    .eq('id', approvalId).eq('user_id', userId).eq('status', 'pending').select('id').maybeSingle();
  if (error || !data) throw new Error('TOOL_APPROVAL_NOT_PENDING');
  await service.from('agent_tool_calls').update({ status: 'rejected', result_summary: 'El usuario rechazó la acción.', finished_at: new Date().toISOString() })
    .eq('approval_id', approvalId).eq('user_id', userId).eq('status', 'pending_approval');
}
