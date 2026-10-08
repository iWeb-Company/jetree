'use client';
import ToolConnectionsModal from '@/components/ToolConnectionsModal';
export default function McpApprovals() {
  return <main className="min-h-dvh bg-[#080c14] p-4 text-gray-200"><h1>Aprobaciones de herramientas</h1><p>Iniciá sesión en Jetree antes de revisar tus propuestas.</p><ToolConnectionsModal isOpen onClose={() => window.location.assign('/')} /></main>;
}
