import { NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/server/auth';
import { connectFigma, createFigmaPairCode, disconnectFigmaSessions, registerFigmaFile } from '@/lib/server/figma-tools';
import { boundedFigmaBody } from '@/lib/server/figma-rest';
import { toolErrorMessage } from '@/lib/tool-feedback';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request); const service = getServiceSupabase();
    await service.from('figma_jobs').update({ status:'uncertain',error_code:'FIGMA_LEASE_EXPIRED' }).eq('user_id',user.id).eq('status','leased').lt('lease_until',new Date().toISOString());
    const query = new URL(request.url).searchParams;
    if (query.has('conversationId')) {
      const { data,error } = await service.from('figma_jobs').select('id,summary,status,result,preview_path').eq('user_id',user.id).eq('conversation_id',query.get('conversationId')).order('created_at',{ascending:false}).limit(10);
      if(error)throw new Error('FIGMA_STORAGE_FAILED');
      return NextResponse.json({jobs:(data||[]).map(job=>({...job,preview_path:undefined,hasPreview:Boolean(job.preview_path)}))},{headers:{'Cache-Control':'no-store'}});
    }
    if (query.has('preview')) {
      const { data: job, error } = await service.from('figma_jobs').select('preview_path').eq('id', query.get('preview')).eq('user_id', user.id).maybeSingle();
      if (error || !job?.preview_path) throw new Error('TOOL_NOT_AUTHORIZED');
      const { data, error: storageError } = await service.storage.from('figma-previews').download(job.preview_path);
      if (storageError || !data) throw new Error('FIGMA_STORAGE_FAILED');
      return new Response(await data.arrayBuffer(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const results = await Promise.all([
      service.from('figma_files').select('file_key,name').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      service.from('figma_sessions').select('id,file_key,verified,last_seen_at,expires_at').eq('user_id', user.id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).limit(50),
      service.from('figma_jobs').select('id,file_key,agent_id,summary,status,result,error_code,preview_path,created_at,finished_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(40),
      service.from('tool_connections').select('status,account_label').eq('user_id', user.id).eq('provider','figma').maybeSingle(),
    ]);
    if (results.some(result => result.error)) throw new Error('FIGMA_STORAGE_FAILED');
    return NextResponse.json({ files: results[0].data || [], sessions: results[1].data || [], jobs: (results[2].data || []).map(job => ({ ...job, hasPreview: Boolean(job.preview_path), preview_path: undefined })), connection: results[3].data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request); const service = getServiceSupabase();
    const body = JSON.parse((await boundedFigmaBody(new Response(request.body), 12000)).toString('utf8'));
    if (body.action === 'connect') { await connectFigma(user.id, body.token); return NextResponse.json({ ok: true }); }
    if (body.action === 'register') return NextResponse.json(await registerFigmaFile(user.id, body.url));
    if (body.action === 'pair') return NextResponse.json(await createFigmaPairCode(user.id, body.fileKey), { headers: { 'Cache-Control': 'no-store' } });
    if (body.action === 'disconnect') {
      await disconnectFigmaSessions(user.id);
      const { error } = await service.from('tool_connections').delete().eq('user_id', user.id).eq('provider','figma');
      if (error) throw new Error('FIGMA_STORAGE_FAILED');
      await service.from('tool_connection_audit').insert({ user_id: user.id, provider: 'figma', action: 'revoked' });
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'revoke_session') {
      const { error } = await service.from('figma_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).eq('id', body.sessionId);
      if (error) throw new Error('FIGMA_STORAGE_FAILED');
      await service.from('figma_jobs').update({ status: 'uncertain', error_code: 'FIGMA_ACCESS_REVOKED' }).eq('user_id', user.id).eq('session_id',body.sessionId).eq('status','leased');
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'cancel_job' || body.action === 'resolve_uncertain') {
      const status = body.action === 'cancel_job' ? 'queued' : 'uncertain';
      if (status === 'uncertain' && body.confirmed !== true) throw new Error('TOOL_INPUT_INVALID');
      const { data: job } = await service.from('figma_jobs').select('id,session_id').eq('user_id',user.id).eq('id',body.jobId).eq('status',status).maybeSingle();
      if (!job) throw new Error('FIGMA_JOB_NOT_ACTIVE');
      if (status === 'uncertain' && job.session_id) {
        const { error } = await service.from('figma_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id',user.id).eq('id',job.session_id);
        if (error) throw new Error('FIGMA_STORAGE_FAILED');
      }
      const { data, error } = await service.from('figma_jobs').update({ status:'cancelled',finished_at:new Date().toISOString(),error_code:status==='uncertain'?'FIGMA_MANUALLY_REVIEWED':'FIGMA_USER_CANCELLED' }).eq('id',job.id).eq('status',status).select('id').maybeSingle();
      if (error || !data) throw new Error('FIGMA_JOB_NOT_ACTIVE');
      return NextResponse.json({ ok: true });
    }
    throw new Error('TOOL_INPUT_INVALID');
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED';
  return NextResponse.json({ error: toolErrorMessage(code), code: /^[A-Z_]+$/.test(code) ? code : 'TOOL_INPUT_INVALID' }, { status: code === 'AUTH_REQUIRED' ? 401 : code === 'TOOL_NOT_AUTHORIZED' ? 403 : code.startsWith('TOOL_INPUT') ? 400 : code === 'FIGMA_JOB_NOT_ACTIVE' ? 409 : 502 });
}
