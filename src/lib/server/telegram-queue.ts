import { getServiceSupabase } from '@/lib/server/auth';
import { decryptProviderSecret, getUserProviderApiKey } from '@/lib/server/provider-secrets';
import { executeAgentChat } from '@/lib/agents/orchestrator';
import type { Agent } from '@/types';
import { assertTelegramOwnerAccess, reserveTelegramExecution } from '@/lib/telegram-worker-guards';
import { audioFormat, downloadTelegramAudio, transcribeTelegramAudio, transcriptionProvider, transcriptionCandidates, startTelegramTyping } from './telegram-media';
import { claimToolApproval, executeAuthorizedTool, finishToolApproval, rejectToolApproval } from './agent-tools';
import { telegramApprovalKeyboard, telegramToolIdentityMatches } from '@/lib/telegram-tool-consent';
import { toolErrorMessage } from '@/lib/tool-feedback';

const MAX_ATTEMPTS = 5;

function backoff(attempt: number) { return new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000).toISOString(); }

async function sendTelegram(token: string, chatId: number, text: string, approvalId?: string) {
  const chunks = text.match(/[\s\S]{1,4000}/g) || [''];
  for (const [index, chunk] of chunks.entries()) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, ...(approvalId && index === chunks.length - 1 ? { reply_markup: telegramApprovalKeyboard(approvalId) } : {}) }),
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error('TELEGRAM_DELIVERY_FAILED');
  }
}

async function processUpdate(service: ReturnType<typeof getServiceSupabase>, update: any) {
  let stopTyping: (() => Promise<void>) | undefined;
  let botToken: string | undefined;
  const attempt = update.attempts || 1;
  const fail = async (error: unknown, taskId?: string) => {
    const rawReason = error instanceof Error ? error.message : '';
    const reason = /^[A-Z0-9_]{1,80}$/.test(rawReason) ? rawReason : 'EXECUTION_FAILED';
    const terminal = attempt >= MAX_ATTEMPTS || ['BOT_OWNER_ACCESS_REVOKED', 'AGENT_OR_DEPARTMENT_ARCHIVED', 'BOT_AGENT_MISMATCH', 'AUDIO_TOO_LARGE', 'AUDIO_FORMAT_UNSUPPORTED', 'AUDIO_PROVIDER_REQUIRED', 'AUDIO_EMPTY', 'AUDIO_CREDITS_REQUIRED', 'AUDIO_TRANSCRIPTION_AUTH_FAILED', 'AUDIO_TRANSCRIPTION_MODEL_UNAVAILABLE', 'AUDIO_TRANSCRIPTION_REJECTED'].includes(reason);
    await service.from('telegram_updates').update({
      status: terminal ? 'failed' : (update.status === 'delivery_pending' ? 'delivery_pending' : 'pending'),
      attempts: attempt, next_attempt_at: backoff(attempt), locked_at: null,
      last_error: reason, updated_at: new Date().toISOString(),
    }).eq('id', update.id);
    if (taskId || update.task_id) await service.from('tasks').update({
      status: terminal ? 'failed' : 'in_progress', retry_count: Math.max(0, attempt - 1), last_error: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId || update.task_id);
    if (terminal && reason.startsWith('AUDIO_') && botToken) {
      const hint = reason === 'AUDIO_PROVIDER_REQUIRED' ? 'Para procesar audios, conectá una clave API de Google, OpenAI u OpenRouter en Jetree.'
        : reason === 'AUDIO_CREDITS_REQUIRED' ? 'El proveedor de transcripción no tiene saldo suficiente. Los modelos gratuitos de chat de OpenRouter no incluyen Whisper. Podés conectar Google para transcribir o cargar saldo en el proveedor.'
        : reason === 'AUDIO_TRANSCRIPTION_AUTH_FAILED' ? 'El proveedor rechazó la clave para transcribir audio. Revisá la conexión API seleccionada en Jetree.'
        : reason === 'AUDIO_TRANSCRIPTION_MODEL_UNAVAILABLE' ? 'El modelo de transcripción no está disponible en ese proveedor. Conectá Google u OpenAI para procesar audios.'
        : reason === 'AUDIO_TRANSCRIPTION_REJECTED' ? 'El proveedor rechazó este audio. Probá con una nota de voz nueva o conectá Google para transcribir.'
        : reason === 'AUDIO_TOO_LARGE' ? 'El audio supera el límite de 5 minutos, 10 MB o la transcripción es demasiado larga. Enviá un audio más corto.'
        : reason === 'AUDIO_FORMAT_UNSUPPORTED' ? 'No puedo leer ese formato de audio. Enviá una nota de voz, MP3, WAV, M4A o WebM.'
        : 'No pude transcribir el audio. Probá con una nota de voz más clara o enviá el texto.';
      await sendTelegram(botToken, Number(update.chat_id), hint).catch(() => {});
    }
  };

  try {
    const [{ data: bot, error: botError }, { data: agentRow, error: agentError }] = await Promise.all([
      service.from('telegram_bots').select('*').eq('id', update.bot_id).eq('is_active', true).single(),
      service.from('agents').select('*').eq('id', update.agent_id).single(),
    ]);
    if (botError || agentError || !bot || !agentRow) throw new Error('BOT_OR_AGENT_UNAVAILABLE');
    if (bot.agent_id !== agentRow.id) throw new Error('BOT_AGENT_MISMATCH');
    const [departmentResult, profileResult, membershipResult] = await Promise.all([
      service.from('departments').select('created_by,deleted_at').eq('id', agentRow.department_id).single(),
      service.from('profiles').select('role').eq('id', bot.owner_user_id).maybeSingle(),
      service.from('department_members').select('user_id').eq('department_id', agentRow.department_id).eq('user_id', bot.owner_user_id).maybeSingle(),
    ]);
    if (departmentResult.error || profileResult.error || membershipResult.error || !departmentResult.data) throw new Error('BOT_OWNER_ACCESS_CHECK_FAILED');
    assertTelegramOwnerAccess({
      profileRole: profileResult.data?.role || null, ownerId: bot.owner_user_id,
      departmentCreatorId: departmentResult.data.created_by, isMember: Boolean(membershipResult.data),
      agentArchived: Boolean(agentRow.deleted_at), departmentArchived: Boolean(departmentResult.data.deleted_at),
    });
    const token = decryptProviderSecret({ ciphertext: bot.token_ciphertext, iv: bot.token_iv, auth_tag: bot.token_auth_tag });
    botToken = token;
    stopTyping = startTelegramTyping(token, Number(update.chat_id));

    const toolIdentity = telegramToolIdentityMatches(bot, update);
    const requireLiveToolChat = async () => {
      const { data: current, error } = await service.from('telegram_bots').select('tool_chat_id,tool_user_id').eq('id', bot.id).eq('owner_user_id', bot.owner_user_id).eq('is_active', true).maybeSingle();
      if (error || !current || !telegramToolIdentityMatches(current, update)) throw new Error('TELEGRAM_TOOL_CHAT_NOT_LINKED');
    };
    if (update.tool_event && update.status !== 'delivery_pending') {
      const event = update.tool_event;
      let reply: string;
      let notifyChat = true;
      if (event.kind === 'pair') {
        const { data: linked, error } = await service.from('telegram_bots').update({ tool_chat_id: update.chat_id, tool_user_id: update.sender_user_id, tool_pair_hash: null, tool_pair_expires_at: null })
          .eq('id', bot.id).eq('tool_pair_hash', event.hash).gt('tool_pair_expires_at', new Date().toISOString()).select('id').maybeSingle();
        if (error) throw new Error('TELEGRAM_TOOL_LINK_FAILED');
        reply = linked ? 'Chat vinculado. Podés usar las herramientas habilitadas y aprobar o rechazar acciones aquí. Solo este chat privado y tu usuario tienen acceso.' : 'El código venció o ya fue usado. Generá uno nuevo desde la configuración del bot en Jetree.';
      } else {
        const { data: binding, error: bindingError } = await service.from('telegram_tool_approvals').select('approval_id').eq('approval_id', event.approvalId).eq('bot_id', bot.id).eq('chat_id', update.chat_id).eq('telegram_user_id', update.sender_user_id).maybeSingle();
        const { data: approval, error: approvalError } = await service.from('agent_tool_approvals').select('agent_id').eq('id', event.approvalId).eq('user_id', bot.owner_user_id).maybeSingle();
        if (bindingError || approvalError) throw new Error('TELEGRAM_APPROVAL_CHECK_FAILED');
        const allowedTarget = approval && (approval.agent_id === agentRow.id || (agentRow.role_type === 'manager' && agentRow.subordinate_ids?.includes(approval.agent_id)));
        if (!toolIdentity || !binding || !allowedTarget) {
          reply = 'Esta acción no pertenece a tu chat autorizado.';
        } else {
          let claimed = false;
          try {
            await requireLiveToolChat();
            if (event.decision === 'reject') {
              await rejectToolApproval(bot.owner_user_id, event.approvalId);
              reply = 'Acción rechazada. No se ejecutó.';
            } else {
              const approved = await claimToolApproval(bot.owner_user_id, event.approvalId);
              claimed = true;
              const target = await service.from('agents').select('id').eq('id', approved.agent_id).eq('department_id', agentRow.department_id).is('deleted_at', null).maybeSingle();
              if (target.error || !target.data) throw new Error('TOOL_AGENT_ACCESS_DENIED');
              await executeAuthorizedTool(service, bot.owner_user_id, approved.agent_id, approved.tool_id, approved.operation, approved.input, event.approvalId, approved.conversation_id);
              await finishToolApproval(bot.owner_user_id, event.approvalId, 'completed');
              reply = 'Acción aprobada, ejecutada y registrada en Jetree.';
            }
          } catch (error) {
            const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED';
            if (claimed) await finishToolApproval(bot.owner_user_id, event.approvalId, 'failed', code);
            reply = toolErrorMessage(code);
            // A second button click only needs a callback toast, not another
            // message in the conversation. The immutable approval is unchanged.
            if (code === 'TOOL_APPROVAL_NOT_PENDING') notifyChat = false;
          }
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: update.chat_id, message_id: event.messageId, reply_markup: { inline_keyboard: [] } }), redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch(() => {});
        }
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: event.callbackId, text: reply.slice(0, 180) }), redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch(() => {});
      }
      if (!notifyChat) {
        const { error } = await service.from('telegram_updates').update({ status: 'completed', response_text: reply, locked_at: null, last_error: null }).eq('id', update.id);
        if (error) throw new Error('DELIVERY_SAVE_FAILED');
        return;
      }
      const { error } = await service.from('telegram_updates').update({ status: 'delivery_pending', response_text: reply }).eq('id', update.id);
      if (error) throw new Error('DELIVERY_SAVE_FAILED');
      update.status = 'delivery_pending'; update.response_text = reply;
    }

    if (update.status === 'delivery_pending' && update.response_text) {
      if (update.tool_response && !toolIdentity) throw new Error('TELEGRAM_TOOL_CHAT_NOT_LINKED');
      if (update.tool_response) await requireLiveToolChat();
      await sendTelegram(token, Number(update.chat_id), update.response_text, toolIdentity ? update.pending_approval_id : undefined);
      await service.from('telegram_updates').update({ status: 'completed', attempts: attempt, locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq('id', update.id);
      if (update.task_id) await service.from('tasks').update({ status: 'completed', retry_count: attempt - 1, last_error: null, updated_at: new Date().toISOString() }).eq('id', update.task_id);
      return;
    }

    // A retry after creating an approval must reuse its immutable draft, never
    // infer or create a second write. Tools are never available to unlinked chats.
    if (update.pending_approval_id) {
      if (!toolIdentity) throw new Error('TELEGRAM_TOOL_CHAT_NOT_LINKED');
      await requireLiveToolChat();
      const { data: pending, error } = await service.from('agent_tool_approvals').select('operation,input,status').eq('id', update.pending_approval_id).eq('user_id', bot.owner_user_id).single();
      if (error || !pending) throw new Error('TELEGRAM_APPROVAL_CHECK_FAILED');
      const text = pending.status === 'pending' ? `Acción pendiente: ${pending.operation}\n${JSON.stringify(pending.input, null, 2)}\nRevisá el detalle y elegí Aprobar o Rechazar.` : 'Esta aprobación ya fue resuelta.';
      await sendTelegram(token, Number(update.chat_id), text, pending.status === 'pending' ? update.pending_approval_id : undefined);
      await service.from('telegram_updates').update({ status: 'completed', locked_at: null, response_text: text }).eq('id', update.id);
      if (update.task_id) await service.from('tasks').update({ status: 'completed', result: text }).eq('id', update.task_id);
      return;
    }

    let quotaReserved = false;
    if (update.audio_file) {
      audioFormat(update.audio_file);
      if (!update.audio_transcript) {
        const transcriptionKeys: Record<string, string> = {};
        for (const provider of transcriptionCandidates(agentRow.provider)) {
          const key = await getUserProviderApiKey(bot.owner_user_id, provider);
          if (key) { transcriptionKeys[provider] = key; break; }
        }
        const provider = transcriptionProvider(agentRow.provider, transcriptionKeys);
        await reserveTelegramExecution(process.env.JETREE_WORKSPACE_DAILY_EXECUTION_LIMIT, async maxRuns => {
          const { data, error } = await service.rpc('consume_workspace_execution_quota', { max_runs: maxRuns }); return { data, error };
        });
        quotaReserved = true;
        const bytes = await downloadTelegramAudio(token, update.audio_file);
        update.audio_transcript = await transcribeTelegramAudio(bytes, update.audio_file, provider, transcriptionKeys[provider]);
        const { error } = await service.from('telegram_updates').update({ audio_transcript: update.audio_transcript }).eq('id', update.id);
        if (error) throw new Error('AUDIO_TRANSCRIPT_SAVE_FAILED');
      }
      update.message_text = `${update.message_text === '[Audio de Telegram]' ? '' : update.message_text + '\n'}[Transcripción de audio]\n${update.audio_transcript}`.slice(0, 8000);
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
    if (!toolIdentity) {
      agent.enabledPluginIds = [];
      agent.systemPrompt += '\nEste chat no está autorizado para herramientas. Para correos o búsquedas, pedí vincular el chat desde la configuración del bot en Jetree; no afirmes resultados externos.';
      for (const item of roster) { item.enabledPluginIds = []; item.systemPrompt += '\nEste chat no está autorizado para herramientas; pedí vincularlo en Jetree.'; }
    }
    const [{ data: session }] = await Promise.all([
      service.from('telegram_chat_sessions').select('conversation_id,tools_authorized').eq('bot_id', bot.id).eq('chat_id', update.chat_id).maybeSingle(),
    ]);
    if (session?.tools_authorized && !toolIdentity) {
      const reply = 'El acceso a herramientas de este chat fue revocado. Volvé a vincularlo desde Jetree para continuar esta conversación.';
      await service.from('telegram_updates').update({ status: 'delivery_pending', response_text: reply }).eq('id', update.id);
      update.status = 'delivery_pending';
      await sendTelegram(token, Number(update.chat_id), reply);
      await service.from('telegram_updates').update({ status: 'completed', locked_at: null }).eq('id', update.id);
      await service.from('tasks').update({ status: 'completed', result: reply }).eq('id', task.id);
      return;
    }
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
    if (toolIdentity) {
      const { error } = await service.from('telegram_chat_sessions').update({ tools_authorized: true }).eq('bot_id', bot.id).eq('chat_id', update.chat_id);
      if (error) throw new Error('CHAT_SESSION_SAVE_FAILED');
    }
    const { error: messageError } = await service.from('messages').insert({
      conversation_id: conversationId, author_user_id: null, role: 'user', content: update.message_text,
      telegram_update_id: update.id,
    });
    if (messageError) {
      // PostgREST cannot infer the partial unique index for an upsert.
      // Accept a duplicate only when this exact update already has a message.
      if (messageError.code !== '23505') throw new Error('MESSAGE_SAVE_FAILED');
      const { data: existingMessage, error: duplicateError } = await service.from('messages')
        .select('id').eq('telegram_update_id', update.id).maybeSingle();
      if (duplicateError || !existingMessage) throw new Error('MESSAGE_SAVE_FAILED');
    }
    const { data: historyRows } = await service.from('messages').select('role,content,telegram_update_id').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(21);
    const history = (historyRows || []).filter((row: any) => row.telegram_update_id !== update.id).slice(0, 20).reverse()
      .map((row: any) => ({ role: row.role as 'user'|'assistant', content: row.content }));
    const apiKeys: Record<string, string> = {};
    for (const provider of new Set(roster.map(item => item.provider))) {
      const key = await getUserProviderApiKey(bot.owner_user_id, provider);
      if (key) apiKeys[provider] = key;
    }
    if (!quotaReserved) await reserveTelegramExecution(process.env.JETREE_WORKSPACE_DAILY_EXECUTION_LIMIT, async maxRuns => {
      const { data, error } = await service.rpc('consume_workspace_execution_quota', { max_runs: maxRuns });
      return { data, error };
    });
    let approvalDraft: { id: string; operation: string; input: unknown } | undefined;
    const result = await executeAgentChat(agent, update.message_text, roster, history, apiKeys, undefined, undefined, async (actingAgent, toolId, operation, input) => {
      if (!toolIdentity) throw new Error('TELEGRAM_TOOL_CHAT_NOT_LINKED');
      await requireLiveToolChat();
      const output = await executeAuthorizedTool(service, bot.owner_user_id, actingAgent.id, toolId, operation, input, undefined, conversationId);
      if ('pendingApproval' in output && output.approvalId) {
        const { error: linkError } = await service.from('telegram_tool_approvals').insert({ approval_id: output.approvalId, bot_id: bot.id, chat_id: update.chat_id, telegram_user_id: update.sender_user_id });
        const { error: saveError } = await service.from('telegram_updates').update({ pending_approval_id: output.approvalId }).eq('id', update.id);
        if (linkError || saveError) throw new Error('TELEGRAM_APPROVAL_LINK_FAILED');
        update.pending_approval_id = output.approvalId;
        approvalDraft = { id: output.approvalId, operation, input };
      }
      return output;
    });
    let responseText = result.delegation
      ? `${agent.name}: ${result.delegation.specialistResult || result.reply}`
      : result.reply;
    if (approvalDraft) responseText += `\n\nAcción pendiente: ${approvalDraft.operation}\n${JSON.stringify(approvalDraft.input, null, 2)}\nRevisá todo el detalle antes de aprobar.`;
    const executionId = crypto.randomUUID();
    const { error: executionError } = await service.from('agent_executions').insert({
      id: executionId, user_id: bot.owner_user_id, department_id: agent.departmentId, agent_id: agent.id,
      conversation_id: conversationId, provider: agent.provider, model: agent.model, status: 'completed',
      input_chars: Math.max(1, update.message_text.length), output_chars: responseText.length,
      delegation: result.delegation || null, finished_at: new Date().toISOString(),
    });
    if (executionError) throw new Error('EXECUTION_LEDGER_SAVE_FAILED');
    await service.from('messages').insert({ conversation_id: conversationId, author_user_id: null, role: 'assistant', content: responseText.slice(0, 12000), execution_id: executionId });
    const { error: deliverySaveError } = await service.from('telegram_updates').update({ status: 'delivery_pending', response_text: responseText, tool_response: toolIdentity, attempts: attempt, last_error: null, updated_at: new Date().toISOString() }).eq('id', update.id);
    if (deliverySaveError) throw new Error('DELIVERY_SAVE_FAILED');
    // A delivery retry reuses the saved reply instead of paying to transcribe/infer again.
    update.status = 'delivery_pending';
    await service.from('tasks').update({ result: responseText.slice(0, 12000), retry_count: attempt - 1, last_error: null, updated_at: new Date().toISOString() }).eq('id', task.id);
    if (toolIdentity) await requireLiveToolChat();
    await sendTelegram(token, Number(update.chat_id), responseText, update.pending_approval_id);
    await service.from('telegram_updates').update({ status: 'completed', locked_at: null, updated_at: new Date().toISOString() }).eq('id', update.id);
    await service.from('tasks').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', task.id);
  } catch (error) {
    await fail(error);
  } finally {
    await stopTyping?.();
  }
}

export async function runTelegramQueue(botId?: string) {
    const service = getServiceSupabase();
    let processed = 0;
    const started = Date.now();
    for (let round = 0; round < (botId ? 3 : 1); round++) {
      // Leave long backlogs to the scheduler instead of extending the webhook indefinitely.
      if (round > 0 && Date.now() - started > 60_000) break;
      const { data, error } = botId ? await service.rpc('claim_telegram_updates_for_bot', { target_bot: botId, batch_size: 2 }) : await service.rpc('claim_telegram_updates', { batch_size: 2 });
      if (error) throw new Error('QUEUE_UNAVAILABLE');
      if (!data?.length) break;
      await Promise.all(data.map((update: any) => processUpdate(service, update)));
      processed += data.length;
    }
    return processed;
}
