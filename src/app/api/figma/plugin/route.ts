import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { completeFigmaJob, requireFigmaSession, startFigmaPair, verifyFigmaSession } from '@/lib/server/figma-tools';
import { boundedFigmaBody } from '@/lib/server/figma-rest';
import { toolErrorMessage } from '@/lib/tool-feedback';
export const runtime = 'nodejs';
// Figma's UI iframe has a null origin. Only scoped, random bridge tokens work
// here; browser cookies and Supabase JWTs are deliberately not accepted.
const cors = { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin' };
export function OPTIONS() { return new Response(null,{status:204,headers:cors}); }
export async function POST(request: Request) {
  try {
    const body = JSON.parse((await boundedFigmaBody(new Response(request.body), request.headers.has('authorization') ? 1600000 : 1000)).toString('utf8'));
    let result: unknown;
    if (body.action === 'pair_start') result = await startFigmaPair(body.code);
    else {
      const session = await requireFigmaSession(request);
      if (body.action === 'verify') result = await verifyFigmaSession(session);
      else {
        if (!session.verified) throw new Error('FIGMA_PAIR_WAITING');
        if (body.action === 'claim') {
          const { data, error } = await getServiceSupabase().rpc('claim_figma_job', { p_session_id: session.id, p_user_id: session.user_id });
          if (error) throw new Error('FIGMA_STORAGE_FAILED');
          const job = data?.[0];
          result = { job: job ? { id: job.id, commands: job.commands, summary: job.summary, leaseUntil: job.lease_until } : null };
        } else if (body.action === 'complete') result = await completeFigmaJob(session, body);
        else throw new Error('TOOL_INPUT_INVALID');
      }
    }
    return NextResponse.json(result, { headers: cors });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED';
    return NextResponse.json({ error: toolErrorMessage(code), code: /^[A-Z_]+$/.test(code) ? code : 'TOOL_INPUT_INVALID' }, { headers: cors, status: code === 'AUTH_REQUIRED' ? 401 : code === 'TOOL_NOT_AUTHORIZED' ? 403 : code === 'FIGMA_PAIR_WAITING' || code === 'FIGMA_JOB_NOT_ACTIVE' ? 409 : code === 'FIGMA_PAIR_INVALID' ? 400 : code === 'TOOL_PROVIDER_RATE_LIMITED' ? 429 : 502 });
  }
}
