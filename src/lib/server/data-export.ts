import type { SupabaseClient } from '@supabase/supabase-js';

// Only explicit business columns: never export credential vaults or OAuth states.
export const exportTables = {
  profiles: 'id,email,role,created_at',
  departments: 'id,name,description,icon,created_by,created_at,deleted_at',
  agents: 'id,department_id,created_by,name,description,role_type,provider,model,system_prompt,subordinate_ids,enabled_tool_ids,status,created_at,updated_at,deleted_at',
  tasks: 'id,department_id,assigned_agent_id,created_by,title,description,status,source_channel,result,created_at,updated_at',
  conversations: 'id,department_id,agent_id,created_by,title,created_at,updated_at',
  messages: 'id,conversation_id,author_user_id,role,content,delegation,created_at',
  activity_logs: 'id,user_id,agent_id,event_type,message,created_at',
  agent_executions: 'id,user_id,department_id,agent_id,conversation_id,provider,model,status,error_code,delegation,started_at,finished_at',
  provider_connections: 'id,user_id,provider,status,connected_at,updated_at',
  agent_tool_calls: 'id,user_id,agent_id,provider,tool_id,operation,status,error_code,started_at,finished_at',
  tool_connection_audit: 'id,user_id,provider,action,created_at',
} as const;

const ownTables = new Set(['profiles', 'provider_connections', 'agent_tool_calls', 'tool_connection_audit']);

export async function exportVisibleData(client: SupabaseClient, userId: string) {
  const tables: Record<string, unknown[]> = {};
  let bytes = 0;
  for (const [table, columns] of Object.entries(exportTables)) {
    const rows: unknown[] = [];
    // 500 rows per request also works with Supabase's default 1,000-row limit.
    for (let offset = 0; ; offset += 500) {
      let query = client.from(table).select(columns).order('id').range(offset, offset + 499);
      if (ownTables.has(table)) query = query.eq(table === 'profiles' ? 'id' : 'user_id', userId);
      const { data, error } = await query;
      if (error) throw new Error('EXPORT_FAILED');
      if (!Array.isArray(data)) throw new Error('EXPORT_FAILED');
      bytes += Buffer.byteLength(JSON.stringify(data), 'utf8');
      if (rows.length + data.length > 50_000 || bytes > 25 * 1024 * 1024) throw new Error('EXPORT_TOO_LARGE');
      rows.push(...data);
      if (data.length < 500) break;
    }
    tables[table] = rows;
  }
  return { version: 1, exportedAt: new Date().toISOString(), scope: 'Datos visibles según tus permisos; historial compartido del workspace', tables };
}
