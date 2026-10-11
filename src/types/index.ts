export type Department = {
  id: string;
  name: string;
  description: string;
  created_by?: string;
  deleted_at?: string | null;
  lead?: string;
  icon?: string;
};

export type AgentRoleType = 'independent' | 'manager';

export type AIProvider = 'openai' | 'gemini' | 'claude' | 'custom' | 'deepseek' | 'groq';

export type TelegramBotConfig = {
  botUsername?: string;           // @MiAgenteBot
  webhookUrl?: string;            // URL del webhook asignado al agente
  isActive?: boolean;             // Si está conectado y respondiendo
  updatedAt?: string;
};

export type AgentPlugin = {
  id: string;
  name: string;
  description: string;
  category: 'work' | 'tools' | 'productivity' | 'dev';
  icon: string;
  providerCompatibility: ('openai' | 'gemini' | 'claude' | 'custom' | 'deepseek' | 'groq')[];
  enabledByDefault?: boolean;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  departmentId: string;
  roleType: AgentRoleType;         // 'independent' o 'manager'
  subordinateIds?: string[];       // Si es manager, IDs de los agentes a su cargo
  provider: AIProvider;
  model: string;                   // 'gpt-4o', 'gemini-2.5-flash', 'claude-3-5-sonnet-20241022', etc.
  systemPrompt: string;
  telegramBot?: TelegramBotConfig; // Configuración de Bot de Telegram individual
  enabledPluginIds?: string[];     // Plugins/Skills activas para este agente
  status: 'idle' | 'working' | 'offline';
  avatar?: string;
  createdAt?: string;
  createdBy?: string;
  deletedAt?: string | null;
};

export type UserSubscription = {
  id: string;
  provider: 'openai' | 'gemini' | 'claude' | 'custom' | 'deepseek' | 'groq';
  name: string;
  connected: boolean;
  userAccountEmail?: string;
  connectedAt?: string;
  tier?: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  departmentId?: string;
  assignedAgentId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority?: 'low' | 'medium' | 'high';
  sourceChannel?: 'telegram' | 'web' | 'api';
  result?: string;
  retryCount?: number;
  lastError?: string;
  traceId?: string;
  createdAt: string;
};

export type AgentActivityLog = {
  id: string;
  timestamp: string;
  agentId?: string;
  agentName?: string;
  type: 'telegram_in' | 'manager_analysis' | 'delegated' | 'agent_executing' | 'completed' | 'error';
  message: string;
  details?: string;
  targetAgentId?: string;
  targetAgentName?: string;
};

export type ChatMessage = {
  id: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  delegation?: {
    assignedToAgentId: string;
    assignedToAgentName: string;
    taskSummary: string;
    provider?: AIProvider;
    model?: string;
    specialistResult?: string;
  };
};
