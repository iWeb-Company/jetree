import { createHash, randomBytes } from 'node:crypto';
import { getServiceSupabase } from './auth';
import { AgentEngineError, ProviderCall } from '@/lib/agents/provider-adapter';
import { deviceIsOnline, validDeviceToken } from '@/lib/model-device-contract';

export const newDeviceToken = () => randomBytes(32).toString('hex');
export const hashDeviceToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function deviceAuthorization(request: Request): string {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!validDeviceToken(token)) throw new Error('DEVICE_INVALID');
  return hashDeviceToken(token);
}

export async function requireOwnedModelDevice(userId: string, deviceId: string) {
  const { data, error } = await getServiceSupabase().from('model_devices')
    .select('id,provider,last_seen_at,revoked_at').eq('id', deviceId).eq('user_id', userId).maybeSingle();
  if (error || !data || !deviceIsOnline(data.last_seen_at, data.revoked_at)) {
    throw new AgentEngineError('MODEL_DEVICE_OFFLINE');
  }
  return data;
}

export function personalDeviceProvider(userId: string, deviceId: string, signal: AbortSignal): ProviderCall {
  const requestDeadline = Date.now() + 50_000;
  return async (agent, prompt) => {
    if (agent.provider !== 'gemini') throw new AgentEngineError('MODEL_DEVICE_PROVIDER_UNSUPPORTED');
    if (prompt.length > 24_000) throw new AgentEngineError('AGENT_CONTEXT_TOO_LARGE');
    if (signal.aborted || Date.now() >= requestDeadline) throw new AgentEngineError('PROVIDER_TIMEOUT');
    const service = getServiceSupabase();
    const { data: id, error } = await service.rpc('enqueue_model_device_job', {
      owner_id: userId, device_id: deviceId, input_text: prompt,
    });
    if (error || typeof id !== 'string') throw new AgentEngineError('MODEL_DEVICE_UNAVAILABLE');
    const deadline = Math.min(requestDeadline, Date.now() + 45_000);
    try {
      while (Date.now() < deadline && !signal.aborted) {
        const { data: job, error: readError } = await service.from('model_device_jobs')
          .select('status,response').eq('id', id).eq('user_id', userId).eq('device_id', deviceId).maybeSingle();
        if (readError || !job) throw new AgentEngineError('MODEL_DEVICE_UNAVAILABLE');
        if (job.status === 'completed' && typeof job.response === 'string' && job.response.trim()) return job.response;
        if (job.status === 'failed' || job.status === 'cancelled') throw new AgentEngineError('MODEL_DEVICE_UNAVAILABLE');
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      throw new AgentEngineError('PROVIDER_TIMEOUT');
    } finally {
      // Delete transient prompts/results even when the browser cancels or the device disappears.
      await service.from('model_device_jobs').delete().eq('id', id).eq('user_id', userId).eq('device_id', deviceId);
    }
  };
}
