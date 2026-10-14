import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { parseFileSpec } from '@/lib/generated-files';
export async function renderFile(raw: unknown) {
  const spec = parseFileSpec(raw);
  let bytes: Buffer; let mimeType: string;
  if (spec.format === 'xlsx') {
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Jetree';
    for (const sheet of spec.sheets!) {
      const ws = workbook.addWorksheet(sheet.name);
      sheet.rows.forEach(row => ws.addRow(row));
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E63' } };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.columns.forEach(column => { column.width = Math.min(45, Math.max(14, ...sheet.rows.map(row => String(row[(column.number || 1) - 1] ?? '').length + 2))); });
    }
    bytes = Buffer.from(await workbook.xlsx.writeBuffer()); mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (spec.format === 'html') {
    bytes = Buffer.from(spec.content!, 'utf8'); mimeType = 'text/html';
  } else {
    const pdf = await PDFDocument.create(); pdf.setTitle(spec.title); pdf.setCreator('Jetree');
    pdf.registerFontkit(fontkit);
    const regular = await pdf.embedFont(await readFile(join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf')), { subset: true });
    const bold = regular;
    let page = pdf.addPage([595.28, 841.89]); let y = 790;
    const draw = (text: string, size: number, heading = false) => {
      const font = heading ? bold : regular;
      const lines: string[] = []; let line = '';
      for (const char of text) {
        const next = line + char;
        if (font.widthOfTextAtSize(next, size) > 490 && line) { lines.push(line); line = char; } else line = next;
      }
      lines.push(line);
      for (const value of lines) {
        if (y < 55) { page = pdf.addPage([595.28, 841.89]); y = 790; }
        page.drawText(value, { x: 50, y, size, font, color: rgb(0.08, 0.12, 0.18) }); y -= size * 1.5;
      }
      y -= 5;
    };
    try { draw(spec.title, 20, true); for (const paragraph of spec.content!.split(/\r?\n/)) draw(paragraph.replace(/\t/g, '    '), 11); }
    catch { throw new Error('FILE_PDF_CHARACTER_UNSUPPORTED'); }
    bytes = Buffer.from(await pdf.save()); mimeType = 'application/pdf';
  }
  if (!bytes.length || bytes.length > 5242880) throw new Error('FILE_TOO_LARGE');
  return { bytes, mimeType, name: spec.name };
}
