import type { ToolRequest } from '@/lib/agents/tool-catalog';

type MailPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: MailPart[]; headers?: Array<{ name: string; value: string }> };
type Mail = { id: string; threadId: string; snippet?: string; labelIds?: string[]; payload?: MailPart };
const base = 'https://gmail.googleapis.com/gmail/v1/users/me';

function header(mail: Mail, name: string) {
  return mail.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}
export function mailText(part: MailPart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8').slice(0, 12_000);
  const plain = (part.parts || []).map(mailText).filter(Boolean).join('\n');
  if (plain) return plain.slice(0, 12_000);
  if (part.mimeType === 'text/html' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8').replace(/<[^>]*>/g, ' ').slice(0, 12_000);
  return '';
}
export function composeMail(to: string, subject: string, body: string, reply?: { messageId: string; references: string }) {
  if ([to, subject, reply?.messageId || '', reply?.references || ''].some(value => /[\r\n]/.test(value))) throw new Error('TOOL_INPUT_INVALID');
  const headers = [`To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  if (reply) headers.push(`In-Reply-To: ${reply.messageId}`, `References: ${reply.references}`);
  return Buffer.from(headers.join('\r\n') + '\r\n\r\n' + (Buffer.from(body).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '')).toString('base64url');
}

export async function gmailRequest(token: string, operation: ToolRequest['operation'], input: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetcher(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'TOOL_PROVIDER_AUTH_FAILED' : response.status === 429 ? 'TOOL_PROVIDER_RATE_LIMITED' : 'TOOL_OPERATION_FAILED');
    return response.json();
  }
  const id = encodeURIComponent(String(input.messageId));
  if (operation === 'search_messages') {
    const params = new URLSearchParams({ q: String(input.query || ''), maxResults: String(input.maxResults || 5) });
    if (input.pageToken) params.set('pageToken', String(input.pageToken));
    const data = await request('/messages?' + params) as { messages?: { id: string }[]; nextPageToken?: string };
    const messages = await Promise.all((data.messages || []).slice(0, 10).map(async item => {
      const mail = await request(`/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`) as Mail;
      return { id: mail.id, threadId: mail.threadId, from: header(mail, 'From'), replyTo: header(mail, 'Reply-To'), to: header(mail, 'To'), subject: header(mail, 'Subject'), date: header(mail, 'Date'), snippet: mail.snippet?.slice(0, 500), labels: mail.labelIds };
    }));
    return { messages, nextPageToken: data.nextPageToken };
  }
  if (operation === 'get_message') {
    const mail = await request(`/messages/${id}?format=full`) as Mail;
    return { id: mail.id, threadId: mail.threadId, from: header(mail, 'From'), replyTo: header(mail, 'Reply-To'), to: header(mail, 'To'), subject: header(mail, 'Subject'), date: header(mail, 'Date'), text: mailText(mail.payload), snippet: mail.snippet, labels: mail.labelIds };
  }
  if (operation === 'trash_message' || operation === 'restore_message') return request(`/messages/${id}/${operation === 'trash_message' ? 'trash' : 'untrash'}`, 'POST');
  if (operation === 'mark_read') return request(`/messages/${id}/modify`, 'POST', { removeLabelIds: ['UNREAD'] });
  if (operation === 'send_message') return request('/messages/send', 'POST', { raw: composeMail(String(input.to), String(input.subject), String(input.body)) });
  if (operation === 'reply_message') {
    const mail = await request(`/messages/${id}?format=metadata&metadataHeaders=Reply-To&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`) as Mail;
    const subject = header(mail, 'Subject');
    const messageId = header(mail, 'Message-ID');
    if (!messageId || !mail.threadId) throw new Error('TOOL_OPERATION_FAILED');
    return request('/messages/send', 'POST', { threadId: mail.threadId, raw: composeMail(String(input.to), /^re:/i.test(subject) ? subject : 'Re: ' + subject, String(input.body), { messageId, references: (header(mail, 'References') + ' ' + messageId).trim() }) });
  }
  throw new Error('TOOL_NOT_SUPPORTED');
}
