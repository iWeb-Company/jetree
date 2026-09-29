import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { decryptProviderSecret, getUserProviderApiKey } from '@/lib/server/provider-secrets';
import { executeAgentChat } from '@/lib/agents/orchestrator';
import type { Agent } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_ATTEMPTS = 5;

function authorized(request: Request) {
  const expected = process.env.JETREE_TELEGRAM_WORKER_SECRET || '';
  const actual = request.headers.get('x-jetree-worker-secret') || '';
  const left = Buffer.from(expected), right = Buffer.from(actual);
  return left.length >= 32 && left.length === right.length && timingSafeEqual(left, right);
}

function backoff(attempt: number) { return new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000).toISOString(); }

async function sendTelegram(token: string, chatId: number, text: string) {
  const chunks = text.match(/[\s\S]{1,4000}/g) || [''];
  for (const chunk of chunks) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error('TELEGRAM_DELIVERY_FAILED');
  }
}

async function processUpdate(service: ReturnType<typeof getServiceSupabase>, update: any) {
  const attempt = update.attempts || 1;
  const fail = async (error: unknown, taskId?: string) => {
    const rawReason = error instanceof Error ? error.message : '';
    const reason = /^[A-Z0-9_]{1,80}$/.test(rawReason) ? rawReason : 'EXECUTION_FAILED';
    const terminal = attempt >= MAX_ATTEMPTS;
    await service.from('telegram_updates').update({
      status: terminal ? 'failed' : (update.status === 'delivery_pending' ? 'delivery_pending' : 'pending'),
      attempts: attempt, next_attempt_at: backoff(attempt), locked_at: null,
      last_error: reason, updated_at: new Date().toISOString(),
    }).eq('id', update.id);
    if (taskId || update.task_id) await service.from('tasks').update({
      status: terminal ? 'failed' : 'in_progress', retry_count: attempt, last_error: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId || update.task_id);
  };

  try {
    const [{ data: bot, error: botError }, { data: agentRow, error: agentError }] = await Promise.all([
      service.from('telegram_bots').select('*').eq('id', update.bot_id).eq('is_active', true).single(),
      service.from('agents').select('*').eq('id', update.agent_id).single(),
    ]);
    if (botError || agentError || !bot || !agentRow) throw new Error('BOT_OR_AGENT_UNAVAILABLE');
    const token = decryptProviderSecret({ ciphertext: bot.token_ciphertext, iv: bot.token_iv, auth_tag: bot.token_auth_tag });

    if (update.status === 'delivery_pending' && update.response_text) {
      await sendTelegram(token, Number(update.chat_id), update.response_text);
      await service.from('telegram_updates').update({ status: 'completed', attempts: attempt, locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq('id', update.id);
      if (update.task_id) await service.from('tasks').update({ status: 'completed', retry_count: attempt - 1, last_error: null, updated_at: new Date().toISOString() }).eq('id', update.task_id);
      return;
    }

    const agent: Agent = {
      id: agentRow.id, name: agentRow.name, description: agentRow.description || '', departmentId: agentRow.department_id,
      roleType: agentRow.role_type, subordinateIds: agentRow.subordinate_ids || [], provider: agentRow.provider,
      model: agentRow.model, systemPrompt: agentRow.system_prompt || '', enabledPluginIds: agentRow.enabled_tool_ids || [],
      status: agentRow.status || 'idle', avatar: agentRow.avatar || undefined, createdBy: agentRow.created_by,
    };
    const { data: task } = update.task_id ? { data: { id: update.task_id } } : await service.from('tasks').insert({
      title: update.message_text.slice(0, 80), description: `Mensaje de Telegram de @${update.sender_name}.`,
      department_id: agent.departmentId, assigned_agent_id: agent.id, created_by: bot.owner_user_id,
      status: 'in_progress', source_channel: 'telegram', trace_id: update.trace_id,
    }).select('id').single();
    if (!task) throw new Error('TASK_CREATE_FAILED');
    await service.from('telegram_updates').update({ task_id: task.id, attempts: attempt, updated_at: new Date().toISOString() }).eq('id', update.id);
    await service.from('tasks').update({ status: 'in_progress', last_error: null, updated_at: new Date().toISOString() }).eq('id', task.id);

    const { data: rosterRows, error: rosterError } = await service.from('agents').select('*').eq('department_id', agent.departmentId).is('deleted_at', null);
    if (rosterError) throw new Error('AGENT_ROSTER_UNAVAILABLE');
    const roster: Agent[] = (rosterRows || []).map((row: any) => ({
      id: row.id, name: row.name, description: row.description || '', departmentId: row.department_id, roleType: row.role_type,
      subordinateIds: row.subordinate_ids || [], provider: row.provider, model: row.model, systemPrompt: row.system_prompt || '',
      enabledPluginIds: row.enabled_tool_ids || [], status: row.status || 'idle', createdBy: row.created_by,
    }));
    const [{ data: session }] = await Promise.all([
      service.from('telegram_chat_sessions').select('conversation_id').eq('bot_id', bot.id).eq('chat_id', update.chat_id).maybeSingle(),
    ]);
    let conversationId = session?.conversation_id;
    if (!conversationId) {
      const { data: conversation, error: conversationError } = await service.from('conversations').insert({
        department_id: agent.departmentId, agent_id: agent.id, created_by: bot.owner_user_id,
        title: `Telegram: ${update.sender_name}`,
      }).select('id').single();
      if (conversationError || !conversation) throw new Error('CONVERSATION_CREATE_FAILED');
      conversationId = conversation.id;
      const { error: linkError } = await service.from('telegram_chat_sessions').upsert({ bot_id: bot.id, chat_id: update.chat_id, conversation_id: conversationId }, { onConflict: 'bot_id,chat_id' });
      if (linkError) throw new Error('CHAT_SESSION_SAVE_FAILED');
    }
    const { error: messageError } = await service.from('messages').upsert({
      conversation_id: conversationId, author_user_id: null, role: 'user', content: update.message_text,
      telegram_update_id: update.id,
    }, { onConflict: 'telegram_update_id', ignoreDuplicates: true });
    if (messageError) throw new Error('MESSAGE_SAVE_FAILED');
    const { data: historyRows } = await service.from('messages').select('role,content,telegram_update_id').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(40);
    const history = (historyRows || []).filter((row: any) => row.telegram_update_id !== update.id).slice(-20)
      .map((row: any) => ({ role: row.role as 'user'|'assistant', content: row.content }));
    const apiKeys: Record<string, string> = {};
    for (const provider of new Set(roster.map(item => item.provider))) {
      const key = await getUserProviderApiKey(bot.owner_user_id, provider);
      if (key) apiKeys[provider] = key;
    }
    const result = await executeAgentChat(agent, update.message_text, roster, history, apiKeys);
    const responseText = result.delegation
      ? `${agent.name}: ${result.delegation.specialistResult || result.reply}`
      : result.reply;
    const executionId = crypto.randomUUID();
    const { error: executionError } = await service.from('agent_executions').insert({
      id: executionId, user_id: bot.owner_user_id, department_id: agent.departmentId, agent_id: agent.id,
      conversation_id: conversationId, provider: agent.provider, model: agent.model, status: 'completed',
      input_chars: Math.max(1, update.message_text.length), output_chars: responseText.length,
      delegation: result.delegation || null, finished_at: new Date().toISOString(),
    });
    if (executionError) throw new Error('EXECUTION_LEDGER_SAVE_FAILED');
    await service.from('messages').insert({ conversation_id: conversationId, author_user_id: null, role: 'assistant', content: responseText.slice(0, 12000), execution_id: executionId });
    await service.from('telegram_updates').update({ status: 'delivery_pending', response_text: responseText, attempts: attempt, last_error: null, updated_at: new Date().toISOString() }).eq('id', update.id);
    await service.from('tasks').update({ result: responseText.slice(0, 12000), retry_count: attempt - 1, last_error: null, updated_at: new Date().toISOString() }).eq('id', task.id);
    await sendTelegram(token, Number(update.chat_id), responseText);
    await service.from('telegram_updates').update({ status: 'completed', locked_at: null, updated_at: new Date().toISOString() }).eq('id', update.id);
    await service.from('tasks').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', task.id);
  } catch (error) {
    await fail(error);
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const service = getServiceSupabase();
    const { data, error } = await service.rpc('claim_telegram_updates', { batch_size: 10 });
    if (error) return NextResponse.json({ error: 'Queue unavailable.' }, { status: 503 });
    for (const update of data || []) await processUpdate(service, update);
    return NextResponse.json({ processed: data?.length || 0 });
  } catch {
    return NextResponse.json({ error: 'Worker failed.' }, { status: 500 });
  }
}
