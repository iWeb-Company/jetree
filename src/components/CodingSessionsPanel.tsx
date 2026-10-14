'use client';
import React,{useState,useEffect,useCallback,useRef} from 'react';
import { supabase } from '@/lib/supabase';
import { codingLabels,type CodingModel } from '@/lib/coding-contract';
import type { Agent } from '@/types';
import {PROVIDER_LABELS,connectionLabel,type ApiConnection} from '@/lib/api-providers';
import type {CodingActivity} from '@/lib/coding-activity';
type Executor={id:string;name:string;last_seen_at:string|null;expires_at:string;revoked_at:string|null};
type Project={id:string;name:string;executor_id:string;models:CodingModel[];test_command:string;jetree_models_enabled?:boolean};
type Session={id:string;project_id:string;prompt:string;status:string;provider:string;model:string;error_code:string|null;cancel_requested:boolean;created_at:string};
type Detail=Session&{activity?:{sequence:number;event:CodingActivity;created_at:string}[];events:{stage:string;at:string}[];report:null|{summary:string;files:{name:string;status:string;diff?:string;sensitive:boolean}[];verification:{command:string;exitCode:number|null;output:string}}};
const activeStates=['queued','preparing','running','verifying'];
export default function CodingSessionsPanel({agents=[]}:{agents?:Agent[]}){
  const [data,setData]=useState<{executors:Executor[];projects:Project[];sessions:Session[];apiConnections?:ApiConnection[]}>({executors:[],projects:[],sessions:[]});
  const [connectionId,setConnectionId]=useState('');const [apiModels,setApiModels]=useState<CodingModel[]>([]);const [catalogLoading,setCatalogLoading]=useState(false);const [catalogError,setCatalogError]=useState('');const [followLogs,setFollowLogs]=useState(true);const logViewport=useRef<HTMLDivElement>(null);
  const [projectId,setProjectId]=useState('');const [modelIndex,setModelIndex]=useState(0);const [agentId,setAgentId]=useState('');const [prompt,setPrompt]=useState('');const [authorized,setAuthorized]=useState(false);
  const [selected,setSelected]=useState('');const [detail,setDetail]=useState<Detail|null>(null);const [pair,setPair]=useState<{code:string;expiresAt:string}|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const requestId=useRef<string|null>(null);
  const api=useCallback(async(body?:Record<string,unknown>,query='')=>{
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Iniciá sesión para continuar.');
    const response=await fetch('/api/coding-sessions'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar la operación.');return result;
  },[]);
  const load=useCallback(async()=>{try{setData(await api());if(selected)setDetail((await api(undefined,'?session='+selected)).session);setError('');}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar.');}},[api,selected]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),2000);return()=>clearInterval(timer);},[load]);
  useEffect(()=>{let live=true;setApiModels([]);setCatalogError('');setModelIndex(0);if(!connectionId){setCatalogLoading(false);return;}setCatalogLoading(true);void api(undefined,'?catalog='+connectionId).then(result=>{if(live)setApiModels(result.models.map((m:{value:string})=>({provider:result.provider,model:m.value})));}).catch(e=>{if(live)setCatalogError(e.message);}).finally(()=>{if(live)setCatalogLoading(false);});return()=>{live=false;};},[api,connectionId]);
  useEffect(()=>{if(followLogs&&logViewport.current)logViewport.current.scrollTop=logViewport.current.scrollHeight;},[detail?.activity?.length,followLogs]);
  const available=data.projects.filter(p=>data.executors.some(e=>e.id===p.executor_id&&!e.revoked_at&&new Date(e.expires_at).getTime()>Date.now()));
  const project=available.find(p=>p.id===projectId);const models=connectionId?apiModels:project?.models||[];const model=models[modelIndex];
  const perform=async(body:Record<string,unknown>)=>{setBusy(true);setError('');try{const result=await api(body);await load();return result;}catch(e){setError(e instanceof Error?e.message:'No se pudo completar.');return null;}finally{setBusy(false);}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!project||!model||!authorized)return;
    requestId.current ||= crypto.randomUUID();const result=await perform({action:'create',requestId:requestId.current,projectId,connectionId:connectionId||undefined,agentId:agentId||undefined,prompt,...model,authorized});
    if(result){setSelected(result.id);setPrompt('');setAuthorized(false);requestId.current=null;}
  };
  return <section className="space-y-6 max-w-6xl mx-auto" aria-label="Sesiones de código">
    <div><h2 className="text-2xl font-semibold text-white">Código</h2><p className="text-sm text-gray-400 mt-2">Pedí un cambio, seguí la ejecución y revisá sus archivos y tests. Tu PC debe permanecer encendida y el ejecutor activo.</p></div>
    {error&&<p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200 text-sm">{error}</p>}
    <div className="rounded-2xl border border-cyan-900/40 bg-[#0b1220] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-white font-medium">Ejecutores locales</h3><button disabled={busy} onClick={async()=>{const result=await perform({action:'pair'});if(result)setPair(result);}} className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-4 py-2 text-cyan-200 text-sm">Vincular ejecutor</button></div>
      {pair&&<div className="border border-cyan-800/40 bg-cyan-950/20 p-4 rounded-xl text-sm space-y-2"><p className="text-gray-300">Usá este código en el CLI con tu configuración local. Vence en 10 minutos y se usa una sola vez.</p><code className="block break-all text-cyan-200 select-all">{pair.code}</code><p className="text-gray-400">La configuración del CLI define las carpetas, modelos y comando de tests autorizados. Las claves locales permanecen en tu PC; las conexiones de Jetree conservan la clave en el servidor.</p></div>}
      {!data.executors.length&&<p className="text-sm text-gray-400">Vinculá el CLI para registrar un proyecto. No hace falta subir el repositorio.</p>}
      {data.executors.map(executor=>{const online=!executor.revoked_at&&executor.last_seen_at&&Date.now()-new Date(executor.last_seen_at).getTime()<90000;return <div key={executor.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-3"><div><p className="text-gray-100 text-sm">{executor.name}</p><p className="text-xs text-gray-400">{executor.revoked_at?'Acceso revocado':new Date(executor.expires_at).getTime()<Date.now()?'Vinculación vencida':online?'Conectado':'Sin conexión · tareas en espera'}</p></div>{!executor.revoked_at&&<button disabled={busy} onClick={()=>{if(window.confirm('¿Revocar este ejecutor? Se cancelarán sus tareas pendientes y se solicitará detener la tarea activa.'))void perform({action:'revoke',executorId:executor.id});}} className="text-sm text-red-300">Revocar acceso</button>}</div>;})}
    </div>
    <form onSubmit={submit} className="rounded-2xl border border-cyan-900/40 bg-[#0b1220] p-5 space-y-4">
      <h3 className="font-medium text-white">Nueva sesión</h3>
      <div className="grid md:grid-cols-3 gap-4">
        <label className="text-sm text-gray-300">Proyecto<select aria-label="Proyecto de código" value={projectId} onChange={e=>{setProjectId(e.target.value);setModelIndex(0);setAuthorized(false);requestId.current=null;}} className="block w-full mt-2 rounded-lg bg-gray-950 border border-gray-700 p-2"><option value="">Elegir proyecto</option>{available.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm text-gray-300">Conexión IA<select aria-label="Conexión de código" value={connectionId} onChange={e=>{setConnectionId(e.target.value);setModelIndex(0);setAuthorized(false);requestId.current=null;}} className="block w-full mt-2 rounded-lg bg-gray-950 border border-gray-700 p-2"><option value="">Claves locales del ejecutor</option>{data.apiConnections?.map(c=><option key={c.id} value={c.id}>{connectionLabel(c)}</option>)}</select></label>
        <label className="text-sm text-gray-300">Modelo<select aria-label="Modelo de código" value={modelIndex} onChange={e=>{setModelIndex(Number(e.target.value));setAuthorized(false);requestId.current=null;}} disabled={!project||catalogLoading} className="block w-full mt-2 rounded-lg bg-gray-950 border border-gray-700 p-2">{catalogLoading?<option>Cargando catálogo…</option>:models.map((m,i)=><option key={m.provider+':'+m.model} value={i}>{m.provider} · {m.model}</option>)}</select></label>
        <label className="text-sm text-gray-300">Agente<select value={agentId} onChange={e=>{setAgentId(e.target.value);requestId.current=null;}} className="block w-full mt-2 rounded-lg bg-gray-950 border border-gray-700 p-2"><option value="">Sesión personal</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      <label className="block text-sm text-gray-300">Qué querés cambiar<textarea aria-label="Pedido de código" value={prompt} onChange={e=>{setPrompt(e.target.value);requestId.current=null;}} required maxLength={8000} rows={4} className="block w-full mt-2 rounded-lg bg-gray-950 border border-gray-700 p-3" placeholder="Corregí el bug y verificá los tests"/></label>
      {project&&<p className="text-xs text-gray-400">Tests autorizados en el ejecutor: <code>{project.test_command}</code></p>}
      {connectionId&&<p className="text-xs text-cyan-200">Usa tu conexión de Jetree; la clave permanece en el servidor. El catálogo no garantiza cuota ni soporte de herramientas para todos los modelos.</p>}
      {catalogError&&<p role="alert" className="text-sm text-amber-200">{catalogError}</p>}
      {connectionId&&project&&!project.jetree_models_enabled&&<p role="alert" className="text-sm text-amber-200">Este proyecto todavía no autorizó modelos de Jetree. Actualizá el ejecutor y habilitá jetreeModels en su configuración local.</p>}
      <label className="flex gap-3 text-sm text-gray-300"><input type="checkbox" checked={authorized} onChange={e=>setAuthorized(e.target.checked)} className="mt-1 w-4 h-4 shrink-0"/>Autorizo enviar el contexto necesario {connectionId?'a '+PROVIDER_LABELS[data.apiConnections?.find(c=>c.id===connectionId)?.provider||'custom']:'al proveedor elegido'} y ejecutar cambios y tests en una copia aislada. La actividad, los diffs y resultados se guardarán en Jetree para revisarlos.</label>
      <button disabled={busy||!project||!model||catalogLoading||Boolean(connectionId&&!project?.jetree_models_enabled)||!authorized||!prompt.trim()} className="rounded-lg bg-cyan-500 px-5 py-2 text-gray-950 font-medium disabled:opacity-40">Iniciar tarea</button>
    </form>
    <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5">
      <div className="space-y-2"><h3 className="text-white font-medium mb-3">Sesiones recientes</h3>{!data.sessions.length&&<p className="text-sm text-gray-400">Tus sesiones aparecerán aquí.</p>}{data.sessions.map(s=><button key={s.id} onClick={()=>{setSelected(s.id);setDetail(null);}} className={`w-full text-left rounded-xl border p-3 ${selected===s.id?'border-cyan-500/60 bg-cyan-950/20':'border-gray-800 bg-gray-950/40'}`}><span className="text-xs text-cyan-300">{codingLabels[s.status]}</span><p className="text-sm text-gray-200 mt-1 line-clamp-2">{s.prompt}</p><p className="text-xs text-gray-500 mt-1">{data.projects.find(p=>p.id===s.project_id)?.name||'Proyecto'} · {s.provider}</p></button>)}</div>
      <div className="min-w-0 rounded-2xl border border-gray-800 bg-[#0b1220] p-5 space-y-4">
        {!detail?<p className="text-gray-400 text-sm">Seleccioná una sesión para ver su actividad y resultado.</p>:<>
          <div className="flex flex-wrap justify-between gap-3"><h3 className="text-white font-medium">{codingLabels[detail.status]}</h3>{activeStates.includes(detail.status)&&<button disabled={busy||detail.cancel_requested} onClick={()=>void perform({action:'cancel',sessionId:detail.id})} className="text-sm text-red-300">{detail.cancel_requested?'Detención solicitada':'Detener'}</button>}</div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{detail.prompt}</p>
          <ul className="text-xs text-gray-400 space-y-1" aria-label="Actividad de la sesión">{detail.events.map((event,i)=><li key={i}>{new Date(event.at).toLocaleTimeString()} · {codingLabels[event.stage]||event.stage}</li>)}</ul>
          <div className="rounded-xl border border-gray-800 overflow-hidden"><div className="flex flex-wrap justify-between gap-2 p-3 bg-gray-950"><h4 className="text-sm text-white">Actividad del agente</h4><label className="flex gap-2 text-xs text-gray-400"><input type="checkbox" checked={followLogs} onChange={e=>setFollowLogs(e.target.checked)}/>Seguir actividad</label></div><div ref={logViewport} role="log" aria-label="Logs del agente" className="max-h-96 overflow-auto bg-[#070b12] p-3 space-y-3 font-mono text-xs">{!detail.activity?.length&&<p className="text-gray-500">{activeStates.includes(detail.status)?'Esperando actividad del ejecutor. Las versiones anteriores solo informan estados.':'Esta sesión no guardó actividad detallada.'}</p>}{detail.activity?.map(row=><div key={row.sequence} className="border-l border-gray-700 pl-3"><p className={row.event.status==='error'?'text-amber-300':'text-cyan-200'}><span className="text-gray-500">{new Date(row.created_at).toLocaleTimeString()} · </span>{row.event.label}<span className="ml-2 text-gray-500">{row.event.status==='running'?'en curso':row.event.status==='completed'?'completado':'error'}</span></p>{row.event.output&&<pre className="mt-1 whitespace-pre-wrap break-words text-gray-300">{row.event.output}</pre>}</div>)}</div></div>
          {detail.error_code&&<p className="text-sm text-amber-200">{detail.error_code==='EXECUTOR_DISCONNECTED'?'El ejecutor se desconectó. La tarea no se repetirá automáticamente.':detail.error_code}</p>}
          {detail.report&&<>
            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{detail.report.summary}</p>
            <p className="text-xs text-gray-400">El resultado está pendiente de tu revisión. Los cambios no se aplicaron al proyecto original ni se publicaron.</p>
            <h4 className="text-gray-100 text-sm font-medium">Archivos modificados</h4>
            {detail.report.files.map(file=><details key={file.name} className="rounded-lg border border-gray-800 p-3"><summary className="text-sm text-cyan-200 cursor-pointer break-all">{file.name} · {file.status}</summary>{file.diff?<pre className="overflow-auto max-h-80 text-xs text-gray-300 mt-3 whitespace-pre">{file.diff}</pre>:<p className="text-xs text-gray-400 mt-2">Contenido omitido; revisalo en la copia local.</p>}</details>)}
            <h4 className="text-gray-100 text-sm font-medium">Tests · salida {detail.report.verification.exitCode??'desconocida'}</h4><pre className="overflow-auto max-h-80 text-xs text-gray-300 whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-3">{detail.report.verification.output}</pre>
          </>}
        </>}
      </div>
    </div>
  </section>;
}
