export const FILE_TOOL_ID = 'jetree-files';
export function requestsGeneratedFile(text: string): boolean {
  return /\b(pdf|excel|xlsx|html)\b/i.test(text.split('Solicitud actual:\n').at(-1) || text);
}
export type FileFormat = 'pdf' | 'xlsx' | 'html';
export type FileRef = { id: string; name: string; mimeType: string; byteSize: number };
export type FileSpec = { format: FileFormat; name: string; title: string; content?: string; sheets?: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }> };
export function parseFileSpec(value: unknown): FileSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FILE_INPUT_INVALID');
  const input = value as Record<string, unknown>;
  if (!['pdf', 'xlsx', 'html'].includes(String(input.format))) throw new Error('FILE_INPUT_INVALID');
  const format = input.format as FileFormat;
  if (typeof input.name !== 'string' || !/^[\p{L}\p{N} _.-]{1,100}$/u.test(input.name) || input.name.includes('..')) throw new Error('FILE_INPUT_INVALID');
  const name = input.name.replace(/\.(pdf|xlsx|html)$/i, '') + '.' + format;
  const title = typeof input.title === 'string' ? input.title.trim() : name;
  if (!title || title.length > 180) throw new Error('FILE_INPUT_INVALID');
  if (format !== 'xlsx') {
    if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 18000) throw new Error('FILE_INPUT_INVALID');
    return { format, name, title, content: input.content };
  }
  if (!Array.isArray(input.sheets) || !input.sheets.length || input.sheets.length > 5) throw new Error('FILE_INPUT_INVALID');
  let cells = 0; const names = new Set<string>();
  const sheets = input.sheets.map((sheet: any) => {
    if (!sheet || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 31 || /[\\/*?:\[\]]/.test(sheet.name) || names.has(sheet.name.toLowerCase()) || !Array.isArray(sheet.rows) || !sheet.rows.length || sheet.rows.length > 500) throw new Error('FILE_INPUT_INVALID');
    names.add(sheet.name.toLowerCase());
    const rows = sheet.rows.map((row: unknown) => {
      if (!Array.isArray(row) || !row.length || row.length > 30) throw new Error('FILE_INPUT_INVALID');
      cells += row.length;
      return row.map(cell => {
        if (cell === null || typeof cell === 'boolean' || typeof cell === 'number' && Number.isFinite(cell)) return cell;
        if (typeof cell === 'string' && cell.length <= 2000) return cell;
        throw new Error('FILE_INPUT_INVALID');
      });
    });
    return { name: sheet.name, rows };
  });
  if (cells > 5000 || JSON.stringify(sheets).length > 24000) throw new Error('FILE_INPUT_INVALID');
  return { format, name, title, sheets };
}
export const FILE_TOOL = { id: FILE_TOOL_ID, name: 'Crear archivos descargables', provider: 'files', operations: ['create_file'], inputs: { create_file: '{format:"pdf"|"xlsx"|"html",name,title,content?:texto PDF o código HTML completo,sheets?:[{name,rows:[[texto,número,boolean,null]]}]} — disponible para todos. XLSX: filas y columnas reales, primera fila cabecera, hasta 5 hojas; fórmulas se guardan como texto. No ejecuta código, publica sitios ni modifica archivos previos.' } };
