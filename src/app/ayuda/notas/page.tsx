import Link from 'next/link';
export default function NotesGuide() {
  return <main className="min-h-dvh bg-[#080c14] px-4 py-8 text-gray-200"><article className="mx-auto max-w-3xl space-y-6">
    <Link href="/" className="text-cyan-300 underline">Volver a Jetree</Link>
    <h1 className="text-2xl font-bold">Conectar Notion y Obsidian</h1>
    <p>Cada usuario administra sus conexiones en Herramientas → MCP personalizados. Después de conectar, elegí los agentes y managers que podrán usarlas en web y Telegram. Pedí cambios en lenguaje natural; revisá el destino y el contenido antes de aprobarlos.</p>
    <h2 className="text-xl font-semibold">Notion</h2>
    <p>Pulsá Conectar Notion. Jetree completa la URL del MCP oficial y OAuth. Autorizá tu cuenta y workspace en Notion, revisando el alcance: puede acceder al contenido disponible para esa cuenta. Al volver a Jetree, asigná la conexión a los agentes elegidos. No pegues tokens de la API REST de Notion en este conector OAuth.</p>
    <p>Ejemplo: «Buscá la página Roadmap, leela y prepará agregar una sección Próximos pasos». Si hay varias páginas o workspaces, indicá el enlace o cuál corresponde. El agente debe obtener el contenido real antes de preparar la actualización.</p>
    <a href="https://developers.notion.com/guides/mcp/get-started-with-mcp" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Documentación oficial de Notion MCP</a>
    <h2 className="text-xl font-semibold">Obsidian: vault local o sincronizado</h2>
    <p>En el vault que quieras conectar, activá el complemento comunitario Local REST API with MCP y obtené su API key. El token corresponde a ese vault. Jetree necesita una URL HTTPS pública que llegue a su endpoint MCP y conserve el encabezado Authorization del complemento.</p>
    <p>La dirección 127.0.0.1 del equipo no es accesible desde la VPS de Jetree. Podés usar un túnel con hostname estable. Mantené el complemento limitado al equipo local y la autenticación activada; no publiques su puerto directamente en el router.</p>
    <details className="rounded-xl border border-gray-800 p-4"><summary className="cursor-pointer text-cyan-200">Ejemplo de túnel con Cloudflare</summary><div className="mt-3 space-y-3 text-sm">
      <p>Necesitás cloudflared instalado desde su fuente oficial, una cuenta de Cloudflare y un hostname de un dominio que controles. Seguí su guía para crear un túnel y registrar el hostname. Usá un nombre y una URL diferentes por vault.</p>
      <p>Para el origen local, preferí HTTPS y configurá la autoridad de certificación que genera el complemento. Si elegís su opción HTTP, habilitala únicamente en loopback: el tráfico entre cloudflared y Obsidian quedará dentro de ese equipo. No desactives la validación TLS del endpoint público.</p>
      <p>Ejemplo de la parte de rutas de un túnel ya creado, para el endpoint HTTP local habilitado en el complemento:</p>
      <pre className="overflow-auto rounded-lg bg-black/40 p-3 text-xs">{'ingress:\n  - hostname: notas.tu-dominio.example\n    path: ^/mcp/.*$\n    service: http://127.0.0.1:27123\n  - service: http_status:404'}</pre>
      <p>En Jetree ingresá <code className="break-all">https://notas.tu-dominio.example/mcp/</code>, autenticación Token/API key y encabezado Authorization. Pegá solo la clave, sin el prefijo Bearer. El túnel debe conservarla; si agregás otra capa de autenticación, comprobá que sea compatible con el cliente MCP.</p>
      <p>Antes de conectar un vault real, comprobá que una solicitud MCP sin token sea rechazada. No pegues tokens ni contraseñas en conversaciones o URLs.</p>
      <a href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Crear un túnel según la guía oficial</a>
    </div></details>
    <p>Con Obsidian Sync, conectá una copia local sincronizada igual que cualquier otro vault. El complemento escribe en esa copia; Sync distribuye los cambios según su estado y configuración. El equipo, Obsidian y el túnel deben estar activos. Una respuesta exitosa del MCP no demuestra que todos tus dispositivos estén sincronizados.</p>
    <p>Obsidian ofrece también Headless Sync para sincronizar una copia en un servidor. Ese cliente no ejecuta por sí solo el complemento Local REST API with MCP: requiere otro servicio MCP sobre esa copia. Esta guía configura el complemento de Obsidian, no instala servicios ni credenciales de Sync en la VPS de Jetree.</p>
    <div className="flex flex-wrap gap-3"><a href="https://github.com/coddingtonbear/obsidian-local-rest-api" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Complemento y endpoints MCP</a><a href="https://obsidian.md/help/sync/headless" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Headless Sync oficial</a></div>
    <h2 className="text-xl font-semibold">Cambios y aprobaciones</h2>
    <p>Buscar, leer, crear y actualizar dependen de las herramientas que anuncie el servidor conectado. Las llamadas requieren aprobación por defecto. Marcá lectura automática solo para herramientas que sepas que no modifican contenido. Para una actualización, el agente lee el destino, prepara el cambio y espera tu aprobación. Si hubo un error de transporte, revisá la nota antes de repetirlo.</p>
    <p>Podés conectar varios workspaces y vaults, con nombres claros, y asignarlos por separado. Revocar una conexión elimina sus credenciales y asignaciones de Jetree; revocá también el permiso o token en el servicio cuando corresponda.</p>
  </article></main>;
}
