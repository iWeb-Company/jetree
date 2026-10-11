'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ImageRef } from '@/lib/chat-images';

export default function ChatImage({ image }: { image: ImageRef }) {
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl = ''; const controller = new AbortController();
    setFailed(false); setUrl('');
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error();
      const response = await fetch(`/api/chat-images?id=${encodeURIComponent(image.id)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const blob = await response.blob(); if (!active) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id]);
  if (failed) return <p className="mt-2 text-xs text-amber-300">No se pudo cargar la imagen o ya no tenés acceso.</p>;
  if (!url) return <p className="mt-2 text-xs opacity-70">Cargando imagen…</p>;
  return <figure className="mt-3 space-y-2">
    {/* Private blob URL is fetched with the session header; no token in the URL. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={image.kind === 'generated' ? 'Imagen generada por el agente' : 'Imagen adjunta al mensaje'} className="max-h-80 w-auto max-w-full rounded-xl object-contain" />
    <figcaption><a href={url} download={`jetree-${image.id}.png`} className="text-xs underline">Descargar imagen</a></figcaption>
  </figure>;
}
