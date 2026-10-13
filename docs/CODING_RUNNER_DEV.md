# Ejecutor de código: primera etapa experimental

Este cambio añade un CLI independiente y una prueba del motor OpenCode; **todavía no permite iniciar tareas de código desde Jetree web o Telegram**. Es la etapa 1 del [plan](PLAN_AGENTE_CODIGO.md). No instala una app de escritorio ni un servicio en la VPS.

## Qué hace

- Diagnostica Node 22+, Git, Docker con contenedores Linux y la imagen del ejecutor.
- Prepara una copia de los archivos seguidos por Git, incluyendo sus modificaciones locales. Omite archivos sin seguimiento, submódulos, configuración de OpenCode, archivos de credenciales habituales y patrones conocidos de claves. Rechaza enlaces simbólicos/junctions y rutas fuera de la raíz. Límites: 2.000 archivos, 1 MiB por archivo, 20 MiB total.
- Trabaja sobre esa copia: no aplica cambios al origen, no hace push, PR, merge ni deploy.
- Ejecuta OpenCode 1.19.0 en un contenedor Linux sin privilegios, sin socket Docker, con filesystem base de solo lectura y límites de procesos, memoria y CPU.
- El contenedor de código solo tiene una red interna hacia el gateway. La clave real vive en otro contenedor y no se monta en la copia ni se inyecta al motor. El gateway fija destino y modelo y permite hasta 40 solicitudes, con salida de hasta 4.096 tokens cada una. Ese límite no es un tope monetario.
- Comprueba por separado el comando de tests indicado por el usuario y devuelve `report.json` con resultado, diff textual y resumen. Conserva la versión inicial fuera del contenedor, por lo que cambios humanos posteriores no alteran el diff. Archivos binarios, sensibles o grandes se listan sin contenido; los diffs tienen un límite total de 256 KiB. `ready_for_review` significa que ese comando terminó con cero; no prueba por sí solo la corrección completa del pedido ni impide que un agente cambie un test.
- No repite una ejecución iniciada. Una interrupción/fallo conserva la copia para revisar y requiere preparar otra para un nuevo intento.
- Motor y gateway vencen a los ocho minutos incluso si se termina abruptamente el CLI. El CLI elimina normalmente contenedores y red; ante una caída de Docker pueden quedar recursos detenidos para retirar manualmente.

El filtrado de patrones no garantiza detectar todos los secretos. Revisar la copia y sus exclusiones antes de autorizar inferencia. Los archivos necesarios se pueden enviar al proveedor seleccionado. Los informes contienen contexto del proyecto y deben mantenerse privados. El API key se pasa mediante archivos de entorno temporales con permisos restrictivos. En Windows el CLI fija y verifica una ACL de salida para el usuario actual, SYSTEM y administradores antes de copiar archivos y antes de crear credenciales; un fallo impide continuar. El administrador de Docker puede acceder a los contenedores y sus variables: no ejecutar en una máquina compartida con administradores no confiables.

## Requisitos en Windows

Node 22+, Git y Docker Desktop con contenedores Linux. `doctor` distingue cliente ausente, motor que no arranca, backend equivocado e imagen pendiente de construir. Docker y WSL instalados no garantizan que el backend Linux esté funcionando.

Instalar/configurar Docker implica requisitos de virtualización y puede requerir reiniciar Windows. Revisar las condiciones de licencia de Docker Desktop de la organización. Este prototipo no publica ningún puerto del motor: el CLI transporta las solicitudes autenticadas mediante Docker exec hacia el loopback del contenedor, con una contraseña aleatoria por ejecución.

## Probar después del merge a dev

Desde el checkout de la rama dev, en `app`:

```powershell
npm run code:doctor
npm run code:build
node coding-runner/cli.mjs prepare --project "C:\proyectos\mi-app" --output "C:\JetreeRuns\prueba-01"
```

La salida debe ser una carpeta nueva **fuera del repositorio**, cuyo padre exista. La preparación no requiere API key, ni Docker, ni conexión de cuenta. El repositorio debe tener un commit; los submódulos y archivos binarios/grandes deben adaptarse antes de incluirlos en el piloto. Revisar `manifest.json` (incluye archivos omitidos) y la carpeta `workspace`.

Para la prueba inicial, usar un proyecto pequeño de Node sin instalación de dependencias. La imagen trae Node, Git y ripgrep; no es un entorno universal ni permite descargar npm/pip desde el contenedor. Eso requiere una etapa separada de preparación de dependencias autorizada.

Ingresar la API key sin dejarla en el historial, únicamente en la terminal propia:

```powershell
$jetreeCodeSecure = Read-Host 'API key del proveedor' -AsSecureString
$jetreeCodeCredential = [System.Net.NetworkCredential]::new('', $jetreeCodeSecure)
$env:JETREE_CODE_API_KEY = $jetreeCodeCredential.Password
try {
  node coding-runner/cli.mjs run --output "C:\JetreeRuns\prueba-01" --provider groq --model "openai/gpt-oss-20b" --prompt "Corregí el bug de suma y verificá los tests" --test "node --test" --allow-inference
} finally {
  Remove-Item Env:JETREE_CODE_API_KEY -ErrorAction SilentlyContinue
  $jetreeCodeCredential = $null
  $jetreeCodeSecure = $null
}
node coding-runner/cli.mjs status --output "C:\JetreeRuns\prueba-01"
node coding-runner/cli.mjs diff --output "C:\JetreeRuns\prueba-01"
```

Transportes iniciales: `groq`, `openrouter`, `deepseek`, con el modelo compatible elegido y API key de esa cuenta. Que un transporte esté implementado no significa que ya haya pasado una evaluación real con todos sus modelos. No hay cambio automático de proveedor. Google, Claude y OpenAI tendrán adaptadores posteriores: no se presentan como soportados en este piloto.

El piloto usa instrucciones breves y únicamente las herramientas bash, read y edit para reducir el contexto enviado. En Groq adapta los mensajes al contrato de chat: conserva roles, texto y referencias de llamadas a herramientas, elimina metadatos del motor y rechaza partes que no sean texto. Los fallos conservan en `status.json` códigos HTTP y categorías permitidas; nunca guardan cuerpos de error del proveedor. Un 429 indica un límite de uso, sin garantizar que esperar lo resuelva.

`--allow-inference` autoriza enviar contexto al proveedor e implementar/ejecutar código **en la copia aislada** durante esta prueba. La clave no se comparte por chat ni con el proyecto. El proceso permanece en primer plano; cerrar la terminal puede interrumpirlo. No hay todavía login de Jetree ni recuperación distribuida.

## Validación

Tests locales comprueban preservación de cambios humanos, exclusiones, límites de rutas, junctions, bloqueo de sobrescrituras, gateway autenticado y límites del adaptador.

GitHub Actions construye la imagen fijada y usa **OpenCode real con un proveedor simulado**, sin claves externas. El motor solicita su herramienta bash, cambia un archivo dentro del contenedor y el ejecutor corre un test real. También verifica que el original quede intacto, el motor no reciba la API key, no pueda escribir el runtime ni acceder directamente a Internet, y que no se repita el trabajo. Esto valida transporte/herramientas/aislamiento básico; **no es una prueba de calidad de ningún modelo real**.

El 13 de octubre de 2026 se verificó localmente Groq con `openai/gpt-oss-20b` en Docker Engine dentro de Ubuntu/WSL2: corrigió una función de suma en una copia descartable y aprobó tres tests independientes sin modificar sus archivos ni el original. Es una prueba básica de un modelo, no una evaluación general de programación. Falta la prueba con un segundo proveedor.

## Siguiente etapa

Tras una prueba real con dos proveedores, decidir si OpenCode cumple el contrato. Después conectar sesiones persistentes, identidad revocable de ejecutores, selección de proyecto, diffs y resultados al panel web/Telegram. La ejecución remota y la app de escritorio siguen siendo etapas posteriores.

No hay migraciones ni cambios de huella de Supabase en esta PR. No ejecutar el prototipo en la VPS productiva.
