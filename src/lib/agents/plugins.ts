export type PluginCategory = 'installed';

export type AgentPlugin = {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  icon: string;
  url?: string;
  providerCompatibility: ('openai' | 'gemini' | 'claude' | 'custom' | 'deepseek')[];
  enabledByDefault?: boolean;
  operations: string[];
};

export const PLUGIN_CATEGORIES: { id: PluginCategory; label: string; icon: string }[] = [
  { id: 'installed', label: 'Conectores disponibles', icon: '🔌' },
];

export const ALL_CHATGPT_WORK_PLUGINS: AgentPlugin[] = [
  {
    id: 'plugin-gmail-core', name: 'Gmail', description: 'Busca y lee correos. Enviar, contestar, marcar como leído y mover a papelera requiere aprobación.',
    category: 'installed', icon: '✉️', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek'],
    operations: ['search_messages', 'get_message', 'send_message (con aprobación)', 'reply_message (con aprobación)', 'trash_message (con aprobación)', 'restore_message (con aprobación)', 'mark_read (con aprobación)'],
  },
  {
    id: 'plugin-web-search', name: 'Internet y YouTube', description: 'Busca información actual y videos de YouTube con enlaces a las fuentes.',
    category: 'installed', icon: '🌐', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek'],
    operations: ['search_web', 'search_youtube'],
  },
  {
    id: 'plugin-github-core', name: 'GitHub', description: 'Consulta repositorios, commits, ramas y archivos según tu conexión. Crear ramas, PRs, issues y archivos requiere aprobación.',
    category: 'installed', icon: '🐙', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek'],
    operations: ['list_repositories', 'get_file', 'list_commits', 'list_branches', 'create_branch (con aprobación)', 'create_pull_request (con aprobación)', 'create_issue (con aprobación)', 'create_file (con aprobación)'],
  },
  {
    id: 'plugin-google-drive-core', name: 'Google Drive', description: 'Busca y lee archivos autorizados por la app. Crear documentos o enviarlos a la papelera requiere aprobación.',
    category: 'installed', icon: '📁', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek'],
    operations: ['search_files', 'get_text_file', 'create_doc (con aprobación)', 'trash_file (con aprobación)'],
  },
];
