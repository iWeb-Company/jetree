'use client';

import React from 'react';

type DepartmentNode = {
  id: string;
  name: string;
  description: string;
  lead?: string;
  subdepartments?: DepartmentNode[];
};

const iWebDepartments: DepartmentNode[] = [
  {
    id: 'ai-dev',
    name: 'Desarrollo e Inteligencia Artificial',
    description: 'Gestión de nodos, co-work de IA y automatizaciones corporativas',
    lead: 'Core Engineering',
    subdepartments: [
      { id: 'chatgpt-agents', name: 'Agentes ChatGPT', description: 'Procesamiento lógico y estructuración de datos', lead: 'OpenAI API' },
      { id: 'gemini-agents', name: 'Agentes Gemini', description: 'Análisis multimodal y coordinación operativa', lead: 'Google GenAI' },
    ],
  },
  {
    id: 'operations',
    name: 'Operaciones y Canales',
    description: 'Monitoreo de webhooks, flujos de trabajo y bots de Telegram',
    lead: 'Infraestructura',
  },
];

export default function DepartmentTree() {
  return (
    <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-cyan-950/40 bg-[#080c14]/40 flex justify-between items-center">
        <div>
          <h3 className="text-base font-semibold text-white">Estructura de Nodos iWeb</h3>
          <p className="text-xs text-gray-400 mt-0.5">Jerarquía visual inspirada en arquitectura de árboles</p>
        </div>
        <span className="text-xs bg-cyan-500/10 text-cyan-400 px-3 py-1 rounded-md border border-cyan-500/20 font-medium">
          Jerarquía Activa
        </span>
      </div>

      <div className="p-6 space-y-4">
        {iWebDepartments.map((dept) => (
          <div key={dept.id} className="border border-cyan-950/60 bg-[#05070b] p-5 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-sm font-bold">
                  🌳
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">{dept.name}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{dept.description}</p>
                </div>
              </div>
              {dept.lead && (
                <span className="text-xs px-3 py-1 rounded-full bg-cyan-950/30 text-cyan-300 border border-cyan-900/50 font-medium">
                  {dept.lead}
                </span>
              )}
            </div>

            {dept.subdepartments && (
              <div className="mt-4 pl-6 border-l-2 border-cyan-500/30 space-y-3">
                {dept.subdepartments.map((sub) => (
                  <div key={sub.id} className="bg-[#0b101d]/60 p-4 rounded-lg border border-cyan-950/40 flex items-center justify-between">
                    <div>
                      <h5 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        {sub.name}
                      </h5>
                      <p className="text-xs text-gray-400 mt-1">{sub.description}</p>
                    </div>
                    {sub.lead && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                        {sub.lead}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}