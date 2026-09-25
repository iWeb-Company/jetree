export type Department = {
  id: string;
  name: string;
  description: string;
  icon?: string;
};

export type Agent = {
  id: string;
  name: string;
  departmentId: string;
  role: string;
  provider: 'chatgpt' | 'gemini' | 'human';
};

export type Task = {
  id: string;
  title: string;
  description: string;
  departmentId: string;
  assignedAgentId?: string;
  status: 'todo' | 'in_progress' | 'completed';
  sourceChannel: 'telegram' | 'chat' | 'api';
  createdAt: string;
};