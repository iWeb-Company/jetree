import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getServiceSupabase } from '@/lib/server/auth';

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  auth_tag: string;
};

function getEncryptionKey(): Buffer {
  const encoded = process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY;
  if (!encoded) throw new Error('SERVER_CONFIGURATION_ERROR');

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('SERVER_CONFIGURATION_ERROR');
  return key;
}

export function encryptProviderSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptProviderSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(secret.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(secret.auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function getUserProviderApiKey(
  userId: string,
  provider: 'openai' | 'gemini' | 'claude' | 'custom',
): Promise<string | null> {
  const service = getServiceSupabase();
  const { data: connection, error } = await service
    .from('provider_connections')
    .select('id, status, connection_type')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw new Error('PROVIDER_CONNECTION_LOOKUP_FAILED');
  if (!connection || connection.status !== 'configured' || connection.connection_type !== 'api_key') return null;

  const { data: secret, error: secretError } = await service
    .from('provider_connection_secrets')
    .select('ciphertext, iv, auth_tag')
    .eq('connection_id', connection.id)
    .maybeSingle();

  if (secretError) throw new Error('PROVIDER_SECRET_LOOKUP_FAILED');
  if (!secret) return null;
  return decryptProviderSecret(secret as EncryptedSecret);
}
