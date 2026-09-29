export type ToolProvider = 'github' | 'google_drive';
export type ToolOperation =
  | 'list_repositories'
  | 'get_file'
  | 'create_issue'
  | 'create_file'
  | 'search_files'
  | 'get_text_file'
  | 'create_doc';

export type ToolRequest = { provider: ToolProvider; operation: ToolOperation; input: Record<string, unknown>; write: boolean };

export function assertToolEnabled(enabledToolIds: unknown, toolId: unknown): asserts toolId is string {
  if (typeof toolId !== 'string' || !Array.isArray(enabledToolIds) || !enabledToolIds.includes(toolId)) throw new Error('TOOL_NOT_AUTHORIZED');
}

export function assertToolConnectionConnected(status: unknown): void {
  if (status === 'connected') return;
  if (status === 'expired') throw new Error('TOOL_CONNECTION_EXPIRED');
  throw new Error('TOOL_CONNECTION_REQUIRED');
}

const text = (value: unknown, max: number, required = true): string => {
  if (typeof value !== 'string') throw new Error('TOOL_INPUT_INVALID');
  const normalized = value.trim();
  if ((required && normalized.length === 0) || normalized.length > max) throw new Error('TOOL_INPUT_INVALID');
  return normalized;
};

const repoPart = (value: unknown): string => {
  const result = text(value, 100);
  if (!/^[A-Za-z0-9_.-]+$/.test(result) || result === '.' || result === '..') throw new Error('TOOL_INPUT_INVALID');
  return result;
};

const safeRepoPath = (value: unknown): string => {
  const result = text(value, 500);
  if (result.startsWith('/') || result.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('TOOL_INPUT_INVALID');
  return result;
};

export function parseToolRequest(toolId: unknown, operation: unknown, rawInput: unknown): ToolRequest {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) throw new Error('TOOL_INPUT_INVALID');
  const input = rawInput as Record<string, unknown>;
  if (toolId === 'plugin-github-core') {
    if (operation === 'list_repositories') return { provider: 'github', operation, input: {}, write: false };
    if (operation === 'get_file') return {
      provider: 'github', operation, write: false,
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), path: safeRepoPath(input.path) },
    };
    if (operation === 'create_issue') return {
      provider: 'github', operation, write: true,
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), title: text(input.title, 200), body: text(input.body ?? '', 5000, false) },
    };
    if (operation === 'create_file') return {
      provider: 'github', operation, write: true,
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), path: safeRepoPath(input.path), message: text(input.message, 200), content: text(input.content, 12_000) },
    };
  }
  if (toolId === 'plugin-google-drive-core') {
    if (operation === 'search_files') return {
      provider: 'google_drive', operation, write: false,
      input: { query: text(input.query ?? '', 200, false), pageSize: Math.min(20, Math.max(1, typeof input.pageSize === 'number' && Number.isSafeInteger(input.pageSize) ? input.pageSize : 10)) },
    };
    if (operation === 'get_text_file') return {
      provider: 'google_drive', operation, write: false,
      input: { fileId: text(input.fileId, 150) },
    };
    if (operation === 'create_doc') return {
      provider: 'google_drive', operation, write: true,
      input: { name: text(input.name, 150), content: text(input.content, 10_000) },
    };
  }
  throw new Error('TOOL_NOT_SUPPORTED');
}

export const TOOL_CONNECTORS = [
  { id: 'plugin-github-core', name: 'GitHub', provider: 'github' as const, operations: ['list_repositories', 'get_file', 'create_issue', 'create_file'] },
  { id: 'plugin-google-drive-core', name: 'Google Drive', provider: 'google_drive' as const, operations: ['search_files', 'get_text_file', 'create_doc'] },
];
