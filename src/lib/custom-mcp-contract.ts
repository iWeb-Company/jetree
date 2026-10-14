export const CUSTOM_MCP_ID = 'plugin-custom-mcp';
export const MCP_OPERATIONS = ['list_mcp_servers', 'list_mcp_tools', 'call_mcp_tool', 'list_mcp_resources', 'read_mcp_resource', 'list_mcp_prompts', 'get_mcp_prompt'] as const;
export type CustomMcpOperation = typeof MCP_OPERATIONS[number];
export type CustomMcpTool = { name: string; description: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string,unknown>; annotations?: Record<string, unknown> };
export const mcpUuid = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('TOOL_INPUT_INVALID');
  return value;
};
export function mcpText(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error('TOOL_INPUT_INVALID');
  return value.trim();
}
export function boundedMcpJson(value: unknown, bytes = 16000) {
  let nodes = 0;
  const walk = (item: unknown, depth: number) => {
    if (++nodes > 2000 || depth > 20) throw new Error('TOOL_INPUT_INVALID');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('TOOL_INPUT_INVALID');
    if (item && typeof item === 'object') for (const child of Object.values(item)) walk(child, depth + 1);
  };
  walk(value, 0);
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).length > bytes) throw new Error('TOOL_INPUT_INVALID');
  return serialized;
}
export function parseCustomMcpInput(operation: unknown, raw: Record<string, unknown>) {
  if (!MCP_OPERATIONS.includes(operation as CustomMcpOperation)) throw new Error('TOOL_NOT_SUPPORTED');
  const op = operation as CustomMcpOperation;
  if (op === 'list_mcp_servers') return { operation: op, input: {}, write: false };
  const input: Record<string, unknown> = { serverId: mcpUuid(raw.serverId) };
  if (op === 'call_mcp_tool' || op === 'get_mcp_prompt') {
    input.name = mcpText(raw.name, 200);
    if (!raw.arguments || typeof raw.arguments !== 'object' || Array.isArray(raw.arguments)) throw new Error('TOOL_INPUT_INVALID');
    boundedMcpJson(raw.arguments, 12000);input.arguments = raw.arguments;
  } else if (op === 'read_mcp_resource') input.uri = mcpText(raw.uri, 2000);
  else {
    input.offset = raw.offset === undefined ? 0 : raw.offset;
    if (!Number.isInteger(input.offset) || Number(input.offset) < 0 || Number(input.offset) > 500) throw new Error('TOOL_INPUT_INVALID');
    input.search = mcpText(raw.search ?? '', 200, true);
  }
  if (raw._definitionHash !== undefined) {
    if (typeof raw._definitionHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw._definitionHash)) throw new Error('TOOL_INPUT_INVALID');
    input._definitionHash = raw._definitionHash;
  }
  if (raw._configurationVersion !== undefined) {
    if (!Number.isInteger(raw._configurationVersion) || Number(raw._configurationVersion) < 1) throw new Error('TOOL_INPUT_INVALID');
    input._configurationVersion = raw._configurationVersion;
  }
  return { operation: op, input, write: ['call_mcp_tool', 'read_mcp_resource', 'get_mcp_prompt'].includes(op) };
}
