export const codingStates = ['queued','preparing','running','verifying','ready_for_review','tests_failed','failed','interrupted','cancelled'] as const;
export const codingLabels: Record<string,string> = { queued:'En cola',preparing:'Preparando copia',running:'Trabajando',verifying:'Verificando tests',ready_for_review:'Listo para revisar',tests_failed:'Tests fallidos',failed:'Falló',interrupted:'Interrumpido',cancelled:'Cancelado' };
export function codingId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('CODING_INPUT_INVALID');
  return value;
}
export function codingText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length>max || value.includes('\0')) throw new Error('CODING_INPUT_INVALID');
  return value.trim();
}
export type CodingModel = { provider:'groq'|'openrouter'|'deepseek'; model:string };
export function codingModels(value: unknown): CodingModel[] {
  if (!Array.isArray(value) || value.length<1 || value.length>10) throw new Error('CODING_INPUT_INVALID');
  return value.map(item => {
    if (!item || !['groq','openrouter','deepseek'].includes(item.provider) || typeof item.model!=='string' || !/^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,150}$/.test(item.model)) throw new Error('CODING_INPUT_INVALID');
    return {provider:item.provider,model:item.model};
  });
}
export function codingReport(value: any, testCommand: string) {
  if (!value || !['ready_for_review','tests_failed'].includes(value.state) || !Array.isArray(value.files) || value.files.length>2000 || value.verification?.command!==testCommand) throw new Error('CODING_REPORT_INVALID');
  const exitCode = value.verification.exitCode;
  if (exitCode!==null && (!Number.isInteger(exitCode) || exitCode<0 || exitCode>255)) throw new Error('CODING_REPORT_INVALID');
  if ((value.state==='ready_for_review') !== (exitCode===0)) throw new Error('CODING_REPORT_INVALID');
  const files = value.files.map((file: any) => {
    const name=codingText(file.name,240);
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some(part=>part==='..' || part==='.') || !['added','modified','deleted'].includes(file.status)) throw new Error('CODING_REPORT_INVALID');
    return {name,status:file.status,sensitive:Boolean(file.sensitive),...(typeof file.diff==='string' && !file.sensitive ? {diff:file.diff.slice(0,65536)} : {})};
  });
  const report={state:value.state,files,summary:typeof value.summary==='string'?value.summary.slice(0,6000):'',verification:{command:testCommand,exitCode,output:typeof value.verification.output==='string'?value.verification.output.slice(0,65536):''}};
  if (JSON.stringify(report).length>350000) throw new Error('CODING_REPORT_INVALID');
  return report;
}
