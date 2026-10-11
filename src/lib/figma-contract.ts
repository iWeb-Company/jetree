// Shared by the server and the Figma sandbox. Never accept executable code.
export type FigmaCommand = {
  op: 'create_frame' | 'create_text' | 'create_rectangle' | 'create_component' | 'create_instance' | 'update_node' | 'duplicate_node' | 'move_node' | 'delete_node';
  nodeId?: string; parentId?: string; ref?: string; componentId?: string;
  expected?: { name?: string; characters?: string };
  props?: FigmaProps;
};
export type FigmaProps = { name?: string; characters?: string; x?: number; y?: number; width?: number; height?: number; fill?: string; fontSize?: number; cornerRadius?: number; layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'; itemSpacing?: number; padding?: number };
export const FIGMA_OPERATIONS = ['list_figma_files', 'get_figma_file', 'get_figma_nodes', 'inspect_figma', 'list_figma_comments', 'post_figma_comment', 'apply_figma_changes', 'get_figma_jobs'] as const;
export type FigmaOperation = typeof FIGMA_OPERATIONS[number];
const invalid = (): never => { throw new Error('TOOL_INPUT_INVALID'); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) return invalid();
  return value;
}
export function figmaFileKey(value: unknown): string {
  const raw = string(value, 1000).trim();
  if (/^[a-zA-Z0-9]{6,128}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(url.hostname) || url.username || url.password || url.port) return invalid();
    const match = url.pathname.match(/^\/(?:design|file)\/([A-Za-z0-9]{6,128})(?:\/|$)/);
    if (match) return match[1];
  } catch { /* Report a domain-specific input error. */ }
  return invalid();
}
export function figmaNodeId(value: unknown, allowRef = false): string {
  const result = string(value, 150).replace(/^(\d+)-(\d+)$/, '$1:$2');
  if (/^(?:\d+:\d+|I\d+:\d+(?:;\d+:\d+)+)$/.test(result) || (allowRef && /^\$[A-Za-z][A-Za-z0-9_]{0,30}$/.test(result))) return result;
  return invalid();
}
export function parseFigmaCommands(value: unknown): FigmaCommand[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25 || JSON.stringify(value).length > 12000) return invalid();
  const refs = new Set<string>();
  return value.map(raw => {
    const item = object(raw);
    if (Object.keys(item).some(key => !['op', 'nodeId', 'parentId', 'ref', 'componentId', 'expected', 'props'].includes(key))) return invalid();
    const op = item.op as FigmaCommand['op'];
    if (!['create_frame', 'create_text', 'create_rectangle', 'create_component', 'create_instance', 'update_node', 'duplicate_node', 'move_node', 'delete_node'].includes(op)) return invalid();
    const created = op.startsWith('create_') || op === 'duplicate_node';
    const result: FigmaCommand = { op };
    const reference = (v: unknown) => { const id = figmaNodeId(v, true); if (id.startsWith('$') && !refs.has(id)) return invalid(); return id; };
    if (!op.startsWith('create_')) result.nodeId = reference(item.nodeId);
    if (op === 'create_instance') result.componentId = reference(item.componentId);
    if (item.parentId !== undefined) result.parentId = reference(item.parentId);
    if (op === 'move_node' && !result.parentId) return invalid();
    if (item.ref !== undefined) {
      if (!created || typeof item.ref !== 'string' || !/^\$[A-Za-z][A-Za-z0-9_]{0,30}$/.test(item.ref) || refs.has(item.ref)) return invalid();
      result.ref = item.ref; refs.add(item.ref);
    }
    if (item.expected !== undefined) {
      const expected = object(item.expected);
      if (Object.keys(expected).some(key => !['name', 'characters'].includes(key)) || !result.nodeId) return invalid();
      result.expected = {};
      if (expected.name !== undefined) result.expected.name = string(expected.name, 200, true);
      if (expected.characters !== undefined) result.expected.characters = string(expected.characters, 3000, true);
    }
    if (item.props !== undefined) {
      if (op === 'delete_node' || op === 'move_node') return invalid();
      const props = object(item.props); const normalized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(props)) {
        if (key === 'name' || key === 'characters') normalized[key] = string(val, key === 'name' ? 200 : 3000, true);
        else if (key === 'fill') { if (typeof val !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(val)) return invalid(); normalized[key] = val; }
        else if (key === 'layoutMode') { if (!['NONE', 'HORIZONTAL', 'VERTICAL'].includes(String(val))) return invalid(); normalized[key] = val; }
        else if (['x', 'y', 'width', 'height', 'fontSize', 'cornerRadius', 'itemSpacing', 'padding'].includes(key)) {
          if (typeof val !== 'number' || !Number.isFinite(val) || Math.abs(val) > 10000 || (['width', 'height', 'fontSize'].includes(key) && val <= 0) || (['cornerRadius', 'itemSpacing', 'padding'].includes(key) && val < 0)) return invalid();
          normalized[key] = val;
        } else return invalid();
      }
      result.props = normalized;
    }
    return result;
  });
}
export function parseFigmaInput(operation: unknown, value: unknown): { operation: FigmaOperation; input: Record<string, unknown>; write: boolean } {
  if (!FIGMA_OPERATIONS.includes(operation as FigmaOperation)) throw new Error('TOOL_NOT_SUPPORTED');
  const input = object(value); const op = operation as FigmaOperation;
  if (op === 'list_figma_files') return { operation: op, input: {}, write: false };
  const result: Record<string, unknown> = { fileKey: figmaFileKey(input.fileKey) };
  if (op === 'get_figma_file' || op === 'get_figma_nodes') {
    const depth = input.depth ?? 2;
    if (!Number.isInteger(depth) || Number(depth) < 1 || Number(depth) > 4) return invalid();
    result.depth = depth;
  }
  if (op === 'get_figma_nodes' || op === 'inspect_figma') {
    if (!Array.isArray(input.nodeIds) || input.nodeIds.length < 1 || input.nodeIds.length > (op === 'inspect_figma' ? 1 : 10)) return invalid();
    result.nodeIds = input.nodeIds.map(id => figmaNodeId(id));
  }
  if (op === 'inspect_figma') result.question = string(input.question ?? 'Describí el diseño y sus elementos.', 1000);
  if (op === 'post_figma_comment') {
    result.message = string(input.message, 2000);
    if (input.nodeId !== undefined) result.nodeId = figmaNodeId(input.nodeId);
  }
  if (op === 'apply_figma_changes') {
    result.commands = parseFigmaCommands(input.commands);
    result.summary = string(input.summary, 500);
  }
  return { operation: op, input: result, write: op === 'post_figma_comment' || op === 'apply_figma_changes' };
}
