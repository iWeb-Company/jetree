import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServiceSupabase } from './auth';
export const codingHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const codingToken = () => 'jcr_' + randomBytes(32).toString('base64url');
export async function requireCodingExecutor(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /,'');
  if (!token || !/^jcr_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('AUTH_REQUIRED');
  const {data,error}=await getServiceSupabase().from('coding_executors').select('id,user_id').eq('token_hash',codingHash(token)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
  if (error || !data) throw new Error('AUTH_REQUIRED');
  return data;
}
export function codingFailure(error: unknown) {
  const code=error instanceof Error?error.message:'CODING_STORAGE_FAILED';
  const messages: Record<string,string>={AUTH_REQUIRED:'Iniciá sesión o volvé a vincular el ejecutor.',CODING_INPUT_INVALID:'Revisá los datos de la sesión.',CODING_REPORT_INVALID:'El informe no cumple el contrato de verificación.',CODING_PAIR_INVALID:'El código venció o ya fue usado.',CODING_NOT_FOUND:'No tenés acceso a ese recurso.',CODING_STORAGE_FAILED:'No se pudo guardar la operación.',CODING_BUSY:'Hay demasiadas sesiones pendientes.',BODY_TOO_LARGE:'El informe supera el tamaño permitido.'};
  const safe=messages[code]?code:'CODING_INPUT_INVALID';
  return NextResponse.json({error:messages[safe],code:safe},{status:safe==='AUTH_REQUIRED'?401:safe==='CODING_NOT_FOUND'?404:safe==='CODING_STORAGE_FAILED'?503:safe==='CODING_BUSY'?409:400,headers:{'Cache-Control':'no-store'}});
}
