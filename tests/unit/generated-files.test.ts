import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { renderFile } from '../../src/lib/server/file-renderer';
import { parseFileSpec, FILE_TOOL_ID } from '../../src/lib/generated-files';
import { executeAgentChat } from '../../src/lib/agents/orchestrator';
import type { Agent } from '../../src/types';

test('generated PDF paginates Spanish content and XLSX preserves real cell types without executing formulas', async () => {
  const pdf = await renderFile({ format: 'pdf', name: 'Informe', title: 'Gestión y análisis', content: 'Información del departamento.\n'.repeat(150) });
  assert.equal(pdf.mimeType, 'application/pdf'); assert.ok((await PDFDocument.load(pdf.bytes)).getPageCount() > 1);
  const excel = await renderFile({ format: 'xlsx', name: 'Ventas.xlsx', sheets: [{ name: 'Ventas', rows: [['Producto', 'Cantidad', 'Activo'], ['A', 12, true], ['=HYPERLINK("https://example.invalid")', 2, false]] }] });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(excel.bytes as any);
  assert.equal(workbook.worksheets[0].getCell('B2').value, 12); assert.equal(workbook.worksheets[0].getCell('C2').value, true);
  assert.equal(workbook.worksheets[0].getCell('A3').type, ExcelJS.ValueType.String);
});
test('HTML stays a downloadable byte artifact and invalid or oversized inputs are rejected', async () => {
  const html = '<!doctype html><html><body><h1>Prueba</h1><script>throw new Error("not executed")</script></body></html>';
  assert.equal((await renderFile({ format: 'html', name: 'Página', content: html })).bytes.toString(), html);
  for (const bad of [{format:'pdf',name:'../secret',content:'x'}, {format:'zip',name:'a',content:'x'}, {format:'pdf',name:'a',content:'x'.repeat(18001)}, {format:'xlsx',name:'a',sheets:[{name:'A',rows:[[{formula:'1+1'}]]}]}]) assert.throws(() => parseFileSpec(bad));
});
test('all agent roles can create files without granting access to external connectors', async () => {
  for (const roleType of ['manager', 'independent'] as const) {
    const agent = { id:'a',name:'Agent',departmentId:'d',description:'',roleType,subordinateIds:[],enabledPluginIds:[],provider:'groq',model:'chosen',systemPrompt:'',status:'idle' } as Agent;
    let calls = 0;
    const result = await executeAgentChat(agent, 'Creá un PDF de prueba', [], [], {}, async () => JSON.stringify({ toolId:FILE_TOOL_ID,operation:'create_file',input:{format:'pdf',name:'Prueba',content:'Contenido real'} }), undefined, async (_agent, toolId, operation, input) => {
      assert.equal(toolId,FILE_TOOL_ID); assert.equal(operation,'create_file'); calls++; return {result:await renderFile(input)};
    });
    assert.equal(calls,1); assert.match(result.reply,/Creé Prueba.pdf/);
  }
});

test('a manager with subordinates and no external connectors still creates a requested file', async () => {
  const specialist = { id:'specialist',name:'Specialist',departmentId:'d',description:'',roleType:'independent',subordinateIds:[],enabledPluginIds:[],provider:'groq',model:'chosen',systemPrompt:'',status:'idle' } as Agent;
  const manager = { ...specialist, id:'manager',name:'Manager',roleType:'manager',subordinateIds:[specialist.id] } as Agent;
  let steps = 0; let writes = 0;
  const result = await executeAgentChat(manager, 'Creá un PDF', [specialist], [], {}, async () => {
    if (++steps === 1) return JSON.stringify({decision:'direct',managerNotes:'Crear archivo',directResponse:'Respuesta sin archivo'});
    return JSON.stringify({toolId:FILE_TOOL_ID,operation:'create_file',input:{format:'pdf',name:'Manager',content:'Prueba'}});
  }, undefined, async () => { writes++;return {result:{id:'file'}}; });
  assert.equal(steps,2);assert.equal(writes,1);assert.match(result.reply,/Creé Manager.pdf/);
});

test('false claims that the internal file capability is disabled get one bounded correction', async () => {
  const agent = { id:'a',name:'Agent',description:'',departmentId:'d',roleType:'independent',provider:'groq',model:'chosen',systemPrompt:'',status:'idle',enabledPluginIds:[] } as Agent;
  let steps=0;
  const result=await executeAgentChat(agent,'Creá un HTML',[],[],{},async (_agent,prompt)=>{
    if(++steps===1)return JSON.stringify({answer:'No tengo disponible la herramienta para crear archivos (jetree-files) en mis conectores permitidos.'});
    assert.match(prompt,/Corrección del servidor: jetree-files/);
    return JSON.stringify({toolId:FILE_TOOL_ID,operation:'create_file',input:{format:'html',name:'Página',content:'<html></html>'}});
  },undefined,async()=>({result:{id:'file'}}));
  assert.equal(steps,2);assert.match(result.reply,/Creé Página.html/);
});
