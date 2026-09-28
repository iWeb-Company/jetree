'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Department } from '@/types';

type Member = { id: string; email: string; role: string; created_at?: string };

interface DepartmentMembersModalProps {
  department: Department | null;
  onClose: () => void;
}

export default function DepartmentMembersModal({ department, onClose }: DepartmentMembersModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!department) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Tu sesión expiró. Iniciá sesión nuevamente.');
      const response = await fetch(`/api/departments/${encodeURIComponent(department.id)}/members`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los miembros.');
      setMembers(payload.members || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los miembros.');
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  if (!department) return null;

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/departments/${encodeURIComponent(department.id)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo agregar el miembro.');
      setEmail('');
      await loadMembers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo agregar el miembro.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/departments/${encodeURIComponent(department.id)}/members?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo quitar el miembro.');
      setMembers(current => current.filter(member => member.id !== userId));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo quitar el miembro.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-5 rounded-2xl border border-cyan-950/80 bg-[#080c14] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Miembros del departamento</h3>
            <p className="mt-1 text-xs text-gray-400">{department.icon} {department.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-400 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2">
          <input type="email" required value={email} onChange={event => setEmail(event.target.value)}
            placeholder="persona@empresa.com" className="min-w-0 flex-1 rounded-xl border border-cyan-950 bg-[#05070b] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
          <button disabled={saving} className="rounded-xl bg-cyan-500 px-4 text-xs font-semibold text-black disabled:opacity-50">
            {saving ? 'Agregando…' : 'Agregar'}
          </button>
        </form>
        <p className="text-[11px] text-gray-500">La persona debe tener una cuenta de Jetree creada previamente.</p>

        {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading ? <p className="text-xs text-gray-500">Cargando miembros…</p> : members.map(member => (
            <div key={member.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#05070b] px-3 py-2.5">
              <div>
                <p className="text-sm text-white">{member.email}</p>
                <p className="text-[10px] uppercase text-gray-500">{member.role === 'admin' ? 'Administrador global' : 'Miembro'}</p>
              </div>
              {member.role !== 'admin' && (
                <button type="button" onClick={() => handleRemove(member.id)} className="text-xs text-red-300 hover:text-red-200">Quitar</button>
              )}
            </div>
          ))}
          {!loading && members.length === 0 && <p className="text-xs text-gray-500">Sin miembros asignados.</p>}
        </div>
        <div className="flex justify-end border-t border-cyan-950/60 pt-3">
          <button onClick={onClose} className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
