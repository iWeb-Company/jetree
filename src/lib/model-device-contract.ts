export const MODEL_DEVICE_ONLINE_MS = 20_000;
export const MODEL_DEVICE_PROVIDER = 'gemini';

export function validDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function deviceIsOnline(lastSeen: string | null, revokedAt: string | null, now = Date.now()): boolean {
  const seen = lastSeen ? Date.parse(lastSeen) : NaN;
  return !revokedAt && Number.isFinite(seen) && seen <= now && now - seen < MODEL_DEVICE_ONLINE_MS;
}

export function selectedModelSource(value: unknown): 'api' | 'local' {
  if (value === undefined || value === 'api') return 'api';
  if (value === 'local') return 'local';
  throw new Error('MODEL_SOURCE_INVALID');
}
