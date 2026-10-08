export type ToolProvider = 'github' | 'google_drive';
export type ToolOperation =
  | 'list_repositories'
  | 'get_file'
  | 'create_issue'
  | 'create_file'
  | 'list_commits'
  | 'list_branches'
  | 'create_branch'
  | 'create_pull_request'
  | 'search_files'
  | 'get_text_file'
  | 'create_doc'
  | 'trash_file';

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

const branchName = (value: unknown): string => {
  const result = text(value, 150);
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(result) || /\.\.|\/\/|\.lock(?:\/|$)/.test(result) || /[/.]$/.test(result)) throw new Error('TOOL_INPUT_INVALID');
  return result;
};

export function jetreeBranchName(value: unknown): string {
  const name = branchName(value);
  if (name.includes('/')) throw new Error('TOOL_INPUT_INVALID');
  return name.startsWith('jetree-branch-') ? name : 'jetree-branch-' + name;
}

export function parseToolRequest(toolId: unknown, operation: unknown, rawInput: unknown): ToolRequest {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) throw new Error('TOOL_INPUT_INVALID');
  const input = rawInput as Record<string, unknown>;
  if (toolId === 'plugin-github-core') {
    if (operation === 'list_repositories') return { provider: 'github', operation, input: {}, write: false };
    if (operation === 'list_commits' || operation === 'list_branches') return {
      provider: 'github', operation, write: false,
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), ...(operation === 'list_commits' && input.branch !== undefined ? { branch: branchName(input.branch) } : {}) },
    };
    if (operation === 'create_branch') return {
      provider: 'github', operation, write: true,
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), branch: jetreeBranchName(input.branch), base: branchName(input.base) },
    };
    if (operation === 'create_pull_request') return {
      provider: 'github', operation, write: true,
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), head: jetreeBranchName(input.head), base: branchName(input.base), title: text(input.title, 200), body: text(input.body ?? '', 5000, false) },
    };
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
      input: { owner: repoPart(input.owner), repo: repoPart(input.repo), path: safeRepoPath(input.path), message: text(input.message, 200), content: text(input.content, 12_000), ...(input.branch ? { branch: jetreeBranchName(input.branch) } : {}) },
    };
  }
  if (toolId === 'plugin-google-drive-core') {
    if (operation === 'trash_file') return { provider: 'google_drive', operation, write: true, input: { fileId: text(input.fileId, 150) } };
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
  { id: 'plugin-github-core', name: 'GitHub', provider: 'github' as const, operations: ['list_repositories', 'get_file', 'list_commits', 'list_branches', 'create_branch', 'create_pull_request', 'create_issue', 'create_file'], inputs: {
    list_repositories: '{}', get_file: '{owner,repo,path}', list_commits: '{owner,repo,branch?} — indicá branch si el usuario pide una rama; sin branch se consulta la predeterminada', list_branches: '{owner,repo}',
    create_branch: '{owner,repo,branch,base} — branch siempre jetree-branch-…; base debe existir',
    create_pull_request: '{owner,repo,head,base,title,body} — head jetree-branch-…; no merge automático',
    create_issue: '{owner,repo,title,body}', create_file: '{owner,repo,path,message,content,branch?}',
  } },
  { id: 'plugin-google-drive-core', name: 'Google Drive', provider: 'google_drive' as const, operations: ['search_files', 'get_text_file', 'create_doc', 'trash_file'], inputs: {
    search_files: '{query,pageSize?}', get_text_file: '{fileId}', create_doc: '{name,content}', trash_file: '{fileId} — envía a papelera, requiere aprobación',
  } },
];
