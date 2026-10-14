'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
type Job = { id: string; summary: string; status: string; hasPreview: boolean; result: { detail?: string } | null };
const names:Record<string,string>={queued:'En cola: espera al plugin',leased:'Aplicando en Figma',applied:'Aplicado en Figma',failed:'Falló antes de editar',uncertain:'Incierto: revisá el archivo en Figma',cancelled:'Cambio cerrado'};
export default function FigmaConversationJobs({ conversationId }: { conversationId: string | null }) {
  const [jobs,setJobs]=useState<Job[]>([]);const [preview,setPreview]=useState('');
  useEffect(()=>{
    let active=true;setJobs([]);setPreview('');if(!conversationId)return;
    async function refresh(){
      const {data}=await supabase.auth.getSession();if(!data.session)return;
      const response=await fetch('/api/figma?conversationId='+encodeURIComponent(conversationId!),{headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'});
      if(!response.ok)return;const payload=await response.json();if(active)setJobs(payload.jobs||[]);
    }
    refresh().catch(()=>{});const timer=setInterval(()=>refresh().catch(()=>{}),5000);
    return()=>{active=false;clearInterval(timer);};
  },[conversationId]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const show=async(id:string)=>{const {data}=await supabase.auth.getSession();if(!data.session)return;const response=await fetch('/api/figma?preview='+id,{headers:{Authorization:'Bearer '+data.session.access_token}});if(response.ok)setPreview(URL.createObjectURL(await response.blob()));};
  if(!jobs.length)return null;
  return <section aria-label="Cambios Figma de esta conversación" className="space-y-2">
    {jobs.slice(0,5).map(job=><article key={job.id} className="rounded-xl border border-cyan-900/60 bg-cyan-950/10 p-3 text-xs">
      <p className="text-gray-200">🎨 {job.summary}</p><p className={job.status==='uncertain'?'text-amber-300':'text-cyan-300'}>{names[job.status]||job.status}</p>
      {job.result?.detail&&<p className="mt-1 text-gray-400">{job.result.detail}</p>}
      {job.hasPreview&&<button onClick={()=>show(job.id).catch(()=>{})} className="mt-2 text-cyan-200 underline">Ver captura del resultado</button>}
    </article>)}
    {preview&&<div><Image src={preview} unoptimized width={512} height={512} alt="Resultado aplicado en Figma" className="max-h-96 rounded-lg object-contain" /><button onClick={()=>setPreview('')} className="text-xs text-cyan-200">Cerrar captura</button></div>}
  </section>;
}
