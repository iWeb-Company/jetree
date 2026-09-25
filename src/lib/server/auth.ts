import { createClient, type User } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function getServerSupabase(accessToken?: string) {
  return createClient(url, anonKey, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireUser(request: Request): Promise<{ client: ReturnType<typeof getServerSupabase>; user: User }> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new Error('AUTH_REQUIRED');
  const client = getServerSupabase(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  return { client, user: data.user };
}
