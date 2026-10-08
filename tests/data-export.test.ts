import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { exportVisibleData } from '../src/lib/server/data-export';

function fixture(fail = false, huge = false) {
  const queries: { table: string; columns: string; filters: string[]; offset: number }[] = [];
  const client = { from(table: string) {
    const q = { table, columns: '', filters: [] as string[], offset: 0 };
    queries.push(q);
    const chain = {
      select(columns: string) { q.columns = columns; return chain; },
      order() { return chain; },
      range(offset: number) { q.offset = offset; return chain; },
      eq(column: string, value: string) { q.filters.push(`${column}=${value}`); return chain; },
      then(resolve: (value: unknown) => unknown) {
        if (fail && table === 'messages') return Promise.resolve(resolve({ error: { message: 'private diagnostic' }, data: null }));
        const count = table === 'messages' ? (q.offset === 0 ? 500 : 2) : 1;
        return Promise.resolve(resolve({ error: null, data: Array.from({ length: count }, (_, i) => ({ id: String(q.offset + i), content: huge ? 'x'.repeat(60000) : 'synthetic' })) }));
      },
    };
    return chain;
  } } as unknown as SupabaseClient;
  return { client, queries };
}

test('export paginates messages, narrows private account rows, and never queries vaults', async () => {
  const { client, queries } = fixture();
  const result = await exportVisibleData(client, 'owner');
  assert.equal(result.tables.messages.length, 502);
  assert.equal(result.tables.profiles.length, 1);
  for (const table of ['profiles', 'provider_connections', 'agent_tool_calls', 'tool_connection_audit']) {
    const query = queries.find(q => q.table === table)!;
    assert.deepEqual(query.filters, [`${table === 'profiles' ? 'id' : 'user_id'}=owner`]);
  }
  assert.ok(!queries.some(q => /secret|oauth|telegram|^tool_connections$/.test(q.table)));
  assert.ok(!queries.some(q => /token|ciphertext|auth_tag|metadata/.test(q.columns)));
});

test('export refuses partial output when a page fails', async () => {
  const { client } = fixture(true);
  await assert.rejects(exportVisibleData(client, 'owner'), /^Error: EXPORT_FAILED$/);
});

test('export refuses oversized output instead of truncating it', async () => {
  const { client } = fixture(false, true);
  await assert.rejects(exportVisibleData(client, 'owner'), /EXPORT_TOO_LARGE/);
});
