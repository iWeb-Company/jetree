export type PluginCategory = 'installed';

export type AgentPlugin = {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  icon: string;
  url?: string;
  providerCompatibility: ('openai' | 'gemini' | 'claude' | 'custom' | 'deepseek' | 'groq')[];
  enabledByDefault?: boolean;
  operations: string[];
};

export const PLUGIN_CATEGORIES: { id: PluginCategory; label: string; icon: string }[] = [
  { id: 'installed', label: 'Conectores disponibles', icon: '🔌' },
];

export const ALL_CHATGPT_WORK_PLUGINS: AgentPlugin[] = [
  {id:'plugin-custom-mcp',name:'MCP personalizados',description:'Usa los servidores MCP que conectaste y asignaste a este agente. Las llamadas requieren aprobación salvo lecturas que autorices explícitamente.',category:'installed',icon:'🔌',providerCompatibility:['openai','gemini','claude','custom','deepseek','groq'],operations:['list_mcp_servers','list_mcp_tools','call_mcp_tool (con aprobación por defecto)','recursos y prompts MCP']},
  {
    id: 'plugin-figma-core', name: 'Figma', description: 'Lee archivos, analiza diseños y consulta comentarios. Comentar y editar requiere aprobación; la edición espera al plugin abierto en Figma.',
    category: 'installed', icon: '🎨', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek', 'groq'],
    operations: ['list_figma_files', 'get_figma_file', 'get_figma_nodes', 'inspect_figma', 'list_figma_comments', 'post_figma_comment (con aprobación)', 'apply_figma_changes (con aprobación y plugin)', 'get_figma_jobs'],
  },
  {
    id: 'plugin-gmail-core', name: 'Gmail', description: 'Busca y lee correos. Enviar, contestar, marcar como leído y mover a papelera requiere aprobación.',
    category: 'installed', icon: '✉️', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek', 'groq'],
    operations: ['search_messages', 'get_message', 'send_message (con aprobación)', 'reply_message (con aprobación)', 'trash_message (con aprobación)', 'restore_message (con aprobación)', 'mark_read (con aprobación)'],
  },
  {
    id: 'plugin-web-search', name: 'Internet y YouTube', description: 'Busca información actual y videos de YouTube con enlaces a las fuentes.',
    category: 'installed', icon: '🌐', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek', 'groq'],
    operations: ['search_web', 'search_youtube'],
  },
  {
    id: 'plugin-github-core', name: 'GitHub', description: 'Consulta repositorios, commits, ramas y archivos según tu conexión. Crear ramas, PRs, issues y archivos requiere aprobación.',
    category: 'installed', icon: '🐙', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek', 'groq'],
    operations: ['list_repositories', 'get_file', 'list_commits', 'list_branches', 'create_branch (con aprobación)', 'create_pull_request (con aprobación)', 'create_issue (con aprobación)', 'create_file (con aprobación)'],
  },
  {
    id: 'plugin-google-drive-core', name: 'Google Drive', description: 'Busca y lee archivos autorizados por la app. Crear documentos o enviarlos a la papelera requiere aprobación.',
    category: 'installed', icon: '📁', providerCompatibility: ['openai', 'gemini', 'claude', 'custom', 'deepseek', 'groq'],
    operations: ['search_files', 'get_text_file', 'create_doc (con aprobación)', 'trash_file (con aprobación)'],
  },
];
