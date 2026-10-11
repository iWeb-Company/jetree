'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';

type File = { file_key: string; name: string };
type Session = { id: string; file_key: string; verified: boolean; last_seen_at: string | null; expires_at: string };
type Job = { id: string; file_key: string; summary: string; status: string; hasPreview: boolean; error_code: string | null; result: { detail?: string } | null };
type State = { files: File[]; sessions: Session[]; jobs: Job[]; connection: { status: string; account_label: string } | null };
const labels: Record<string,string> = { queued:'En cola · espera al plugin',leased:'Aplicando',applied:'Aplicado',failed:'Falló antes de editar',uncertain:'Incierto · revisar en Figma',cancelled:'Cerrado' };
export default function FigmaConnectionsPanel({ headers }: { headers: () => Promise<{ Authorization: string }> }) {
  const [state,setState]=useState<State>({files:[],sessions:[],jobs:[],connection:null});
  const [token,setToken]=useState('');const [url,setUrl]=useState('');const [code,setCode]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [preview,setPreview]=useState('');
  const refresh=useCallback(async()=>{
    const response=await fetch('/api/figma',{headers:await headers(),cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);setState(data);
  },[headers]);
  useEffect(()=>{refresh().catch(error=>setNotice(error.message));const timer=setInterval(()=>refresh().catch(()=>{}),10000);return()=>clearInterval(timer);},[refresh]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const act=async(action:string,input:Record<string,unknown>={})=>{
    if(busy)return;setBusy(true);setNotice('');
    try{const response=await fetch('/api/figma',{method:'POST',headers:{...await headers(),'Content-Type':'application/json'},body:JSON.stringify({action,...input})});const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(action==='connect'){setToken('');setNotice('Figma conectado. Habilitá Figma en tus agentes: pueden leer por enlace sin registrar cada archivo. Agregá solo los archivos que quieras comentar o editar.');}
      else if(action==='register'){setUrl('');setNotice('Archivo registrado. Podés leerlo desde el chat y vincular el plugin para editar.');}
      else if(action==='pair'){setCode(data.code);setNotice('Código válido durante 10 minutos, de un solo uso. Abrí el archivo indicado y pegalo únicamente en el plugin Jetree.');}
      else if(action==='disconnect'){setCode('');setNotice('Token eliminado y plugins desconectados de Jetree. También podés revocar el token desde tu cuenta Figma.');}
      else setNotice('Estado actualizado.');
      await refresh();
    }catch(error){setNotice(error instanceof Error?error.message:'No se pudo completar la operación.');}finally{setBusy(false);}
  };
  const view=async(id:string)=>{try{const response=await fetch('/api/figma?preview='+encodeURIComponent(id),{headers:await headers()});if(!response.ok)throw new Error('No se pudo abrir la captura.');setPreview(URL.createObjectURL(await response.blob()));}catch(error){setNotice((error as Error).message);}};
  const connected=state.connection?.status==='connected';
  const button='rounded-lg border border-cyan-900 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50';
  const field='w-full rounded-lg border border-gray-800 bg-gray-950 p-2 text-xs text-white';
  return <section aria-label="Conexión Figma" className="space-y-3 rounded-xl border border-cyan-950/60 bg-[#05070b] p-4">
    <div className="flex items-center justify-between"><h4 className="font-semibold text-white">🎨 Figma</h4><span className="text-xs text-cyan-200">{connected?'Conectado':'Desconectado'}</span></div>
    <p className="text-xs text-gray-400">Managers y agentes pueden leer y analizar cualquier archivo accesible con tu cuenta: pasales su enlace por web o Telegram, sin registrarlo ni abrir el plugin. Para comentar o editar, registrá el archivo y aprobá la acción. Las ediciones esperan al plugin abierto en el archivo.</p>
    {!connected ? <form onSubmit={event=>{event.preventDefault();act('connect',{token});}} className="space-y-2">
      <label className="block text-xs text-gray-300">Token personal de Figma<input aria-label="Token personal de Figma" className={field} type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} required /></label>
      <p className="text-[11px] text-gray-400">Crealo en Figma → Settings → Security → Personal access tokens. Permisos: current_user:read, file_content:read, file_comments:read y file_comments:write. Jetree lo guarda cifrado.</p>
      <button className={button} disabled={busy||!token}>Conectar Figma</button>
    </form> : <><p className="text-xs text-gray-400">Cuenta: {state.connection?.account_label}</p><button className={button} disabled={busy} onClick={()=>act('disconnect')}>Desconectar Figma y plugins</button>
      <form onSubmit={event=>{event.preventDefault();act('register',{url});}} className="flex flex-col gap-2 sm:flex-row"><input aria-label="Enlace de archivo Figma" className={field} placeholder="https://www.figma.com/design/…" value={url} onChange={event=>setUrl(event.target.value)} required /><button className={button} disabled={busy||!url}>Agregar archivo</button></form>
      <p className="text-[11px] text-gray-400">Estos archivos habilitan comentarios y vinculación del plugin. La lectura por enlace usa los permisos de tu cuenta y no requiere esta lista. Necesitás permiso de edición en Figma para modificar capas. La API no enumera automáticamente todos tus proyectos.</p>
    </>}
    <details className="text-xs text-gray-300"><summary className="cursor-pointer text-cyan-200">Instalar el plugin Jetree en Figma</summary>
      <ol className="mt-2 list-decimal space-y-2 pl-5"><li><a href="/figma-plugin/jetree-figma.zip" download className="text-cyan-300 underline">Descargar el plugin</a> y descomprimirlo.</li><li>En Figma Desktop, Plugins → Development → New plugin → Figma Design. Creá un plugin con interfaz.</li><li>Copiá code.js y ui.html descargados a su carpeta. En manifest.json conservá el id que creó Figma y reemplazá los otros campos por los del archivo descargado.</li><li>Abrí el archivo registrado, ejecutá el plugin y elegí el mismo entorno que este panel. Generá el código debajo, pegalo en el plugin, guardá el archivo y pulsá verificar.</li></ol>
      <p className="mt-2 text-gray-400">No necesita variables nuevas en la VPS ni otro servicio de pago. Figma aplica sus cuotas de API. La vinculación del plugin vence en 24 horas. Cerrarlo deja las nuevas ediciones en cola.</p>
    </details>
    {state.files.map(file=><article key={file.file_key} className="space-y-2 rounded-lg border border-gray-800 p-3">
      <a href={`https://www.figma.com/design/${file.file_key}`} target="_blank" rel="noreferrer" className="text-xs text-cyan-200 underline">{file.name}</a>
      <p className="break-all text-[10px] text-gray-500">{file.file_key}</p><button disabled={busy||!connected} className={button} onClick={()=>act('pair',{fileKey:file.file_key})}>Generar código para el plugin</button>
      {state.sessions.filter(item=>item.file_key===file.file_key).map(session=><div key={session.id} className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400"><span>{!session.verified?'Pendiente de verificar':session.last_seen_at&&Date.now()-Date.parse(session.last_seen_at)<30000?'Plugin conectado':'Plugin sin actividad reciente'}</span><button className={button} disabled={busy} onClick={()=>act('revoke_session',{sessionId:session.id})}>Revocar plugin</button></div>)}
    </article>)}
    {code&&<div className="rounded-lg border border-amber-800 p-3"><label className="text-xs text-amber-200">Código para pegar en el plugin<input aria-label="Código de vinculación Figma" readOnly className={field} value={code} onFocus={event=>event.target.select()} /></label></div>}
    {state.jobs.length>0&&<div className="space-y-2"><h5 className="text-sm text-white">Cambios en Figma</h5>{state.jobs.map(job=><article key={job.id} className="space-y-2 rounded-lg border border-gray-800 p-3 text-xs"><p className="text-white">{job.summary}</p><p className={job.status==='uncertain'?'text-amber-300':'text-cyan-200'}>{labels[job.status]||job.status}</p>{job.result?.detail&&<p className="text-gray-400">{job.result.detail}</p>}
      {job.status==='queued'&&<button className={button} disabled={busy} onClick={()=>act('cancel_job',{jobId:job.id})}>Cancelar cambio en cola</button>}
      {job.status==='uncertain'&&<button className={button} disabled={busy} onClick={()=>{if(window.confirm('Cerrá el plugin y revisá qué cambios se aplicaron en Figma. ¿Ya lo hiciste? Esto cierra el trabajo sin repetirlo y revoca su vinculación.'))act('resolve_uncertain',{jobId:job.id,confirmed:true});}}>Revisé el archivo: cerrar sin repetir</button>}
      {job.hasPreview&&<button className={button} onClick={()=>view(job.id)}>Ver captura del resultado</button>}
    </article>)}</div>}
    {preview&&<div className="space-y-2"><Image src={preview} unoptimized width={512} height={512} alt="Resultado aplicado en Figma" className="max-h-96 rounded-lg object-contain" /><button className={button} onClick={()=>setPreview('')}>Cerrar captura</button></div>}
    {notice&&<p role="status" className="text-xs text-cyan-200">{notice}</p>}
  </section>;
}
