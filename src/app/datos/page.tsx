'use client';

import { useState } from 'react';
import InformationPage from '@/components/InformationPage';
import { supabase } from '@/lib/supabase';

export default function DataPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function download() {
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { setNotice('Iniciá sesión en Jetree para descargar tus datos.'); return; }
      const response = await fetch('/api/data-export', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
      if (!response.ok) { setNotice((await response.json()).error || 'No se pudo completar la exportación.'); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'jetree-datos.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Exportación descargada. Guardala en un lugar seguro: puede contener conversaciones compartidas.');
    } catch { setNotice('No se pudo completar la exportación. Intentá nuevamente.'); }
    finally { setBusy(false); }
  }
  return <InformationPage title="Tus datos">
    <section><h2 className="text-xl font-semibold">Descargar una copia</h2><p>Incluye departamentos, agentes, tareas e historial que tus permisos permiten consultar, además del estado de tus conexiones y auditoría. Los administradores pueden exportar datos compartidos de todo el workspace. No incluye claves API ni tokens. La copia refleja las consultas realizadas durante la descarga; no reemplaza un respaldo para restaurar la aplicación.</p>
      <button onClick={download} disabled={busy} className="mt-4 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{busy ? 'Preparando copia…' : 'Descargar mis datos'}</button>
      {notice && <p role="status" className="mt-4 text-sm text-cyan-200">{notice}</p>}
    </section>
    <section><h2 className="text-xl font-semibold">Solicitar corrección o eliminación</h2><p>Indicá qué cuenta y qué datos querés corregir o eliminar. El administrador verificará tu identidad y revisará los datos compartidos antes de actuar. La solicitud no elimina información automáticamente. Los archivos creados en servicios externos y las copias de respaldo requieren tratamiento separado.</p>
      <a href="mailto:facundod@iwebtecnology.com?subject=Jetree%3A%20solicitud%20sobre%20mis%20datos" className="mt-4 inline-block rounded-lg border border-cyan-700 px-5 py-3 text-cyan-200">Escribir al administrador</a>
    </section>
    <section><h2 className="text-xl font-semibold">Desconectar servicios</h2><p>Podés revocar GitHub y Drive en Herramientas, y eliminar tus conexiones de modelos en Conexiones IA. Archivar agentes o departamentos es recuperable y no equivale a borrar su información.</p></section>
  </InformationPage>;
}
