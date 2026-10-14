'use client';
import type {McpPreset} from '@/lib/mcp-presets';
export default function NotesMcpGuide({preset}:{preset:McpPreset}) {
  if(preset==='custom')return null;
  return <details className="rounded-lg border border-gray-800 p-3 text-xs text-gray-400">
    <summary className="cursor-pointer text-cyan-200">Cómo conectar {preset==='notion'?'Notion':'Obsidian'} (guía breve)</summary>
    {preset==='notion'?<>
      <ol className="mt-3 list-decimal space-y-2 pl-5"><li>Pulsá Conectar MCP y completá la autorización de tu cuenta en Notion.</li><li>Revisá el workspace y el alcance del permiso: el MCP oficial puede leer y actualizar contenido accesible con esa cuenta en el workspace autorizado.</li><li>Al volver, elegí qué agentes y managers pueden usar esta conexión. Pediles buscar, crear o actualizar una página; revisá y aprobá cada cambio.</li></ol>
      <p className="mt-2">Cada usuario conecta su propia cuenta. No necesita tener su PC encendida.</p>
      <a href="https://developers.notion.com/guides/mcp/get-started-with-mcp" target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan-300 underline">Guía oficial de Notion</a>
    </>:<>
      <ol className="mt-3 list-decimal space-y-2 pl-5"><li>Abrí el vault que querés conectar. Instalá y activá <strong>Local REST API with MCP</strong> desde los complementos de Obsidian.</li><li>En los ajustes del complemento, obtené su API key y la dirección MCP. El endpoint local habitual es <code className="break-all">https://127.0.0.1:27124/mcp/</code>.</li><li>Configurá un túnel HTTPS autenticado hacia ese servicio, con una URL estable y conservando el token Bearer del complemento. La URL ingresada aquí debe ser accesible desde la VPS de Jetree. No abras el puerto de Obsidian directamente a Internet ni desactives la autenticación.</li><li>Ingresá la URL HTTPS pública terminada en <code>/mcp/</code> y pegá únicamente la API key en el campo protegido de Jetree. Luego asigná la conexión a tus agentes.</li></ol>
      <p className="mt-3">Vault local: Obsidian y el túnel deben permanecer activos en el equipo que lo contiene. Vault con Sync: conectá el complemento en una copia sincronizada; los cambios se propagarán cuando Sync los sincronice. Jetree no conecta directamente con la nube de Sync ni confirma que otro dispositivo ya recibió el cambio.</p>
      <p className="mt-2">Usá un token distinto por vault. El token permite acceso al vault del complemento; revisá qué notas contiene antes de asignarlo. Las actualizaciones requieren aprobación por defecto.</p>
      <div className="mt-2 flex flex-wrap gap-3"><a href="https://github.com/coddingtonbear/obsidian-local-rest-api" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Guía del complemento</a><a href="/ayuda/notas" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Configuración del túnel y Sync</a></div>
    </>}
  </details>;
}
