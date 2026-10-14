'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FileRef } from '@/lib/generated-files';
export default function ChatFile({ file }: { file: FileRef }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const download = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error();
      const response = await fetch(`/api/chat-files?id=${encodeURIComponent(file.id)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { setError('No se pudo descargar el archivo o ya no tenés acceso.'); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-3"><p className="break-all text-sm font-medium">{file.name}</p><p className="mt-1 text-xs text-gray-400">{Math.max(1, Math.ceil(file.byteSize / 1024))} KB</p><button type="button" disabled={busy} onClick={() => void download()} className="mt-2 text-sm text-cyan-300 underline disabled:opacity-50">{busy ? 'Descargando…' : 'Descargar archivo'}</button>{error && <p role="alert" className="mt-2 text-xs text-amber-300">{error}</p>}</div>;
}
