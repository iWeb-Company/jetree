import type { getServiceSupabase } from './auth';
import { readChatFile } from './chat-file-store';
export async function deliverTelegramFiles(service: ReturnType<typeof getServiceSupabase>, token: string, update: any, fetcher: typeof fetch = fetch) {
  for (const id of update.response_file_ids || []) {
    const { data: row, error } = await service.from('chat_files').select('*').eq('id', id).eq('agent_id', update.agent_id).not('message_id', 'is', null).maybeSingle();
    if (error || !row) throw new Error('FILE_STORAGE_FAILED');
    if (row.telegram_delivered) continue;
    if (row.telegram_delivery_started) throw new Error('FILE_DELIVERY_UNCERTAIN');
    const bytes = await readChatFile(service, row);
    const { data: claimed, error: claimError } = await service.from('chat_files').update({ telegram_delivery_started: true }).eq('id', id).eq('telegram_delivery_started', false).select('id').maybeSingle();
    if (claimError || !claimed) throw new Error('FILE_DELIVERY_UNCERTAIN');
    const body = new FormData(); body.set('chat_id', String(update.chat_id)); body.set('document', new Blob([new Uint8Array(bytes)], { type: row.mime_type }), row.name);
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30000) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error();
      const { error: saveError } = await service.from('chat_files').update({ telegram_delivered: true }).eq('id', id);
      if (saveError) throw new Error();
    } catch { throw new Error('FILE_DELIVERY_UNCERTAIN'); }
  }
}
