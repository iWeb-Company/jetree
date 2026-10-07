import { toolErrorMessage } from '@/lib/tool-feedback';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { claimToolApproval, executeAuthorizedTool, finishToolApproval, rejectToolApproval } from '@/lib/server/agent-tools';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let userId = '';
  let approvalId = '';
  let executing = false;
  try {
    const { client, user } = await requireUser(request);
    userId = user.id;
    const body = await request.json();
    approvalId = typeof body?.approvalId === 'string' ? body.approvalId : '';
    if (!approvalId || !['approve', 'reject'].includes(body?.decision)) return NextResponse.json({ error: 'Decisión o aprobación inválida.' }, { status: 400 });
    if (body.decision === 'reject') {
      await rejectToolApproval(user.id, approvalId);
      return NextResponse.json({ ok: true, status: 'rejected' });
    }
    const approval = await claimToolApproval(user.id, approvalId);
    executing = true;
    const result = await executeAuthorizedTool(client, user.id, approval.agent_id, approval.tool_id, approval.operation, approval.input, approvalId, approval.conversation_id);
    if ('pendingApproval' in result) throw new Error('TOOL_APPROVAL_NOT_PENDING');
    await finishToolApproval(user.id, approvalId, 'completed');
    return NextResponse.json({ ok: true, status: 'completed', result: result.result, message: result.message, conversationId: result.conversationId });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED';
    if (executing && userId && approvalId) await finishToolApproval(userId, approvalId, 'failed', code);
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'TOOL_APPROVAL_NOT_PENDING' ? 409 : code === 'TOOL_CONNECTION_REQUIRED' || code === 'TOOL_CONNECTION_EXPIRED' ? 409 : code === 'TOOL_NOT_AUTHORIZED' ? 403 : 502;
    return NextResponse.json({ error: toolErrorMessage(code), code }, { status });
  }
}
