# Conector personal Google para Jetree

Primera versión para pruebas en dev. No activar en producción hasta completar las pruebas reales de dos usuarios, revocación, desconexión y herramientas. ChatGPT por suscripción requiere acceso autorizado. El chat Claude en Jetree queda por API; desde la aplicación oficial de Claude se pueden usar las herramientas del MCP de Jetree con permisos propios. Anthropic no admite planes Free/Pro/Max en Jetree bajo las condiciones actuales, según su respuesta al responsable.

Cada usuario instala su conector en su propio equipo con Node.js 22 o superior. No compartir la carpeta `.jetree-personal` ni una sesión Google entre usuarios. El CLI oficial guarda sus credenciales en un perfil exclusivo. Jetree recibe mensajes/respuestas temporales y una credencial de dispositivo, nunca el token Google. La computadora debe permanecer encendida.

1. Desde `/ayuda/conexiones#google`, descargar el archivo del conector y extraerlo en una carpeta propia. No se necesita acceso al repositorio privado.
2. Ejecutar `npm ci` para instalar la versión fijada de Gemini CLI.
3. Ejecutar `npm run login`; completar **Login with Google** en el navegador oficial y salir con `/quit`.
4. En Jetree, abrir **Conexiones de modelos → Cuenta Google → Vincular mi equipo**.
5. Ejecutar `npm run pair`, ingresar el dominio exacto de dev o producción, el código (caduca en 5 minutos) y el nombre del equipo.
6. Ejecutar `npm start`, mantener esta terminal abierta, y actualizar el estado del equipo en Jetree.
7. En el chat de un agente Gemini, elegir el equipo en **Conexión para esta conversación**. El CLI selecciona su modelo por defecto según la cuenta; no utiliza el modelo del catálogo API del agente.

Si la sesión está vencida, detener el conector y repetir `npm run login`. Si se revoca el equipo en Jetree, los trabajos se cancelan y debe generarse una nueva vinculación. Apagar el conector no cambia automáticamente a API. El login y los límites son los del Gemini CLI, no una promesa de consumo ilimitado. Telegram y el catálogo completo por cuenta quedan fuera de esta primera versión.

El conector bloquea herramientas locales, MCP, extensiones, hooks, habilidades y credenciales API/Vertex del entorno. GitHub/Drive se ejecutan únicamente mediante Jetree y conservan aprobación explícita para escrituras. No ejecutar como administrador/root.

Datos locales: `~/.jetree-personal/`. Desvincular en Jetree revoca la credencial de transporte; para quitar la sesión Google local, usar `/auth` en `npm run login` o eliminar el perfil Google aislado después de detener el conector. Para revocar el consentimiento de Google, usar la sección de conexiones de tu cuenta Google.

Fuentes: https://geminicli.com/docs/get-started/authentication/, https://geminicli.com/docs/reference/configuration/, https://geminicli.com/docs/reference/policy-engine/.
