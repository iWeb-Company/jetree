'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ArchivedRecord = { id: string; name: string; deleted_at: string; department_id?: string };

interface ArchivedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => Promise<void> | void;
}

export default function ArchivedItemsModal({ isOpen, onClose, onRestored }: ArchivedItemsModalProps) {
  const [departments, setDepartments] = useState<ArchivedRecord[]>([]);
  const [agents, setAgents] = useState<ArchivedRecord[]>([]);
  const [activeDepartmentIds, setActiveDepartmentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadArchived = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Tu sesión expiró. Iniciá sesión nuevamente.');
      const headers = { Authorization: `Bearer ${token}` };
      const [departmentsResponse, agentsResponse] = await Promise.all([
        fetch('/api/departments?includeArchived=true', { headers, cache: 'no-store' }),
        fetch('/api/agents?includeArchived=true', { headers, cache: 'no-store' }),
      ]);
      const [departmentPayload, agentPayload] = await Promise.all([departmentsResponse.json(), agentsResponse.json()]);
      if (!departmentsResponse.ok) throw new Error(departmentPayload.error || 'No se pudieron cargar los departamentos archivados.');
      if (!agentsResponse.ok) throw new Error(agentPayload.error || 'No se pudieron cargar los agentes archivados.');
      const allDepartments = departmentPayload.departments || [];
      const allAgents = agentPayload.agents || [];
      setDepartments(allDepartments.filter((item: ArchivedRecord) => item.deleted_at));
      setAgents(allAgents.filter((item: ArchivedRecord) => item.deleted_at));
      setActiveDepartmentIds(new Set(allDepartments.filter((item: ArchivedRecord) => !item.deleted_at).map((item: ArchivedRecord) => item.id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la papelera.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => { loadArchived(); }, [loadArchived]);

  const restore = async (kind: 'agents' | 'departments', id: string) => {
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/${kind}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: JSON.stringify({ id, action: 'restore' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo restaurar el elemento.');
      await Promise.all([loadArchived(), onRestored()]);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'No se pudo restaurar el elemento.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92dvh] overflow-y-auto w-full max-w-2xl space-y-5 rounded-2xl border border-cyan-950/80 bg-[#080c14] p-4 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Papelera del workspace</h3>
            <p className="mt-1 text-xs text-gray-400">Los elementos archivados se pueden restaurar.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-400 hover:text-white">✕</button>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
        {loading ? <p className="text-xs text-gray-500">Cargando papelera…</p> : (
          <div className="grid gap-5 md:grid-cols-2">
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Departamentos</h4>
              {departments.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#05070b] px-3 py-2.5">
                  <span className="truncate text-sm text-white">{item.name}</span>
                  <button onClick={() => restore('departments', item.id)} className="ml-2 text-xs text-emerald-300 hover:text-emerald-200">Restaurar</button>
                </div>
              ))}
              {!departments.length && <p className="text-xs text-gray-500">No hay departamentos archivados.</p>}
            </section>
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Agentes</h4>
              {agents.map(item => {
                const canRestore = !item.department_id || activeDepartmentIds.has(item.department_id);
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#05070b] px-3 py-2.5">
                    <span className="truncate text-sm text-white">{item.name}</span>
                    {canRestore ? (
                      <button onClick={() => restore('agents', item.id)} className="ml-2 text-xs text-emerald-300 hover:text-emerald-200">Restaurar</button>
                    ) : <span className="ml-2 text-[10px] text-gray-500">Restaurá su departamento primero</span>}
                  </div>
                );
              })}
              {!agents.length && <p className="text-xs text-gray-500">No hay agentes archivados.</p>}
            </section>
          </div>
        )}

        <div className="flex justify-end border-t border-cyan-950/60 pt-3">
          <button onClick={onClose} className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
