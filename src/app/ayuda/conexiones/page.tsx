import Link from 'next/link';
export default function ConnectionGuide() {
  return <main className="min-h-dvh bg-[#080c14] px-4 py-8 text-gray-200"><article className="mx-auto max-w-3xl space-y-6">
    <Link href="/" className="text-cyan-300 underline">Volver a Jetree</Link>
    <h1 className="text-2xl font-bold">Conectar modelos por API</h1>
    <p>Jetree utiliza claves API propias de cada usuario. Admite Google Gemini, Anthropic Claude, OpenAI, OpenRouter y DeepSeek.</p>
    <ol className="list-inside list-decimal space-y-3"><li>Abrí Conexiones de modelos y pegá tu clave API en el único campo.</li><li>Presioná Conectar clave API. Jetree detecta el proveedor y valida la clave mediante una consulta de lectura.</li><li>Después de guardarla, podés agregar otra clave. También podés conservar varias del mismo proveedor.</li><li>Presioná Usar esta clave para elegir la conexión de ese proveedor que usarán tus agentes y Telegram. La primera queda seleccionada automáticamente.</li><li>Configurá el proveedor y modelo de cada agente. Su catálogo se consulta con tu clave seleccionada.</li></ol>
    <p>Una clave no corresponde a un único modelo: habilita el catálogo del proveedor. OpenRouter permite acceder a modelos de diferentes compañías a través de su propia API.</p>
    <p>Las claves se cifran en el servidor y nunca se devuelven al navegador. Para identificar claves antiguas que comparten el prefijo sk-, se consultan los endpoints oficiales de OpenAI y DeepSeek. No se generan respuestas ni se consume inferencia durante la validación.</p>
    <p>Si una clave falla, Jetree muestra el error. Elegí y validá otra explícitamente. El acceso a modelos mediante suscripciones, OAuth y equipos locales está pausado.</p>
    <h2 className="text-xl font-semibold">Herramientas de managers y agentes</h2>
    <p>En Conectores de herramientas podés conectar GitHub, Google Drive y Gmail. Después habilitá las herramientas en cada manager o agente. Gmail permite buscar, leer, enviar y responder correos, marcar como leído y mover a papelera o restaurar. Revisá las acciones pendientes en el panel de aprobaciones antes de enviarlas o ejecutarlas.</p>
    <p>Podés pedir las operaciones en lenguaje natural: «mostrame los correos», «contestale» o «buscá videos». Para usar herramientas por Telegram, el propietario vincula su chat privado desde la configuración del bot y envía el comando generado. Los envíos y cambios muestran el detalle con botones Aprobar y ejecutar o Rechazar en ese mismo chat. Podés revocar el acceso desde Jetree.</p>
    <p>Habilitá Internet y YouTube para buscar información actual y videos con enlaces a las fuentes. La búsqueda debe estar configurada por el administrador. Encontrar un video no significa que el agente pueda verlo o transcribirlo.</p>
  </article></main>;
}
