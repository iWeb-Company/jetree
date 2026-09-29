export type PluginCategory = 'installed';

export type AgentPlugin = {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  icon: string;
  url?: string;
  providerCompatibility: ('openai' | 'gemini' | 'claude' | 'custom')[];
  enabledByDefault?: boolean;
  operations: string[];
};

export const PLUGIN_CATEGORIES: { id: PluginCategory; label: string; icon: string }[] = [
  { id: 'installed', label: 'Conectores disponibles', icon: '🔌' },
];

export const ALL_CHATGPT_WORK_PLUGINS: AgentPlugin[] = [
  {
    id: 'plugin-github-core', name: 'GitHub', description: 'Lista repositorios públicos y lee archivos. Crear issues o archivos requiere aprobación por operación.',
    category: 'installed', icon: '🐙', providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    operations: ['list_repositories', 'get_file', 'create_issue (con aprobación)', 'create_file (con aprobación)'],
  },
  {
    id: 'plugin-google-drive-core', name: 'Google Drive', description: 'Busca y lee archivos autorizados por la app. Crear documentos requiere aprobación por operación.',
    category: 'installed', icon: '📁', providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    operations: ['search_files', 'get_text_file', 'create_doc (con aprobación)'],
  },
];
