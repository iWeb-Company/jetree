# Claude MCP y Google personal: promoción

El PR #35 ya fue desplegado en producción. Google personal requiere esta nueva adaptación: el flujo individual de Gemini CLI fue retirado por Google. Las migraciones y la huella no cambian con Antigravity. El PR #36 permanece en borrador hasta completar las pruebas nativas.

## Dev

1. Aplicar `20261008162802_personal_model_connector.sql` y `20261008171309_claude_mcp_connector.sql` y verificar historial, RLS y permisos. Completado en dev.
2. Actualizar la huella VPS de dev a `5fe6cc30589c7f0976b7e194b01990bdb31095972627027f53d63a6ae1ca8938`. La huella se calcula desde los bytes de la revisión publicada en GitHub; no desde un checkout Windows con conversión de saltos de línea.
3. Aprobar CI del PR: aplicación, base de datos, contenedor y Auth/navegador desechables. Promover a dev y esperar despliegue saludable.
4. Abrir `/ayuda/conexiones` desde dev en móvil y escritorio. Descargar el conector sin requerir acceso al repositorio.
5. En Claude oficial, agregar `https://jetree-dev.iwebtecnology.com/mcp`, autenticar cada usuario en Jetree, seleccionar agentes y comprobar listado. Proponer una rama y rechazarla en Jetree; comprobar estado y revocar acceso. No usar credenciales de Claude dentro de Jetree.
6. Google: validar primero el login individual oficial de Antigravity CLI en Windows. La adaptación mantiene bloqueados la vinculación y el relay. Antes de habilitarlos: comprobar permisos efectivos, ausencia de herramientas locales, selección explícita de Gemini, respuesta real, cancelación y aislamiento entre dos usuarios. Después validar vinculación, desconexión y revocación en dev. No cambiar automáticamente a API.

## Producción

1. Después de validar dev, aplicar las mismas dos migraciones en el proyecto de producción y verificar permisos e historial. Son tablas y funciones nuevas; no migran credenciales de proveedores.
2. Respaldar y actualizar la huella VPS de producción al mismo valor. Mantener las credenciales y configuración de producción existentes.
3. Crear PR dev → main con CI en verde, mergear y esperar el despliegue automático y sus comprobaciones de revisión/salud.
4. Verificar `/api/health` 200, `/api/agents` sin sesión 401, guía pública 200 y descarga del conector. Las rutas `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, `/mcp`, `/api/mcp-oauth/*` y `/claude/*` deben llegar a la app mediante el proxy existente. No registrar códigos OAuth, tokens ni prompts en logs de acceso.
5. Repetir Claude y Google con URLs de producción y cuentas individuales. Dev y producción tienen autorizaciones independientes; no reutilizar un código ni una credencial de dispositivo entre entornos.
6. Verificar que el chat API y Telegram existentes siguen funcionando. Telegram no usa el conector personal Google ni ejecuta inferencia Claude por MCP.

OpenAI por suscripción permanece pendiente de respuesta y deshabilitado. El MCP no permite inferencia Claude en el chat propio de Jetree; la conversación ocurre en Claude oficial. No usar el modelo predeterminado de Antigravity como si fuese necesariamente Gemini. La selección explícita y el acceso efectivo de la cuenta deben validarse antes de habilitar el transporte.

## Reversión

Restaurar la imagen anterior con el procedimiento app + worker existente si fallan las comprobaciones del despliegue. Conservar las nuevas tablas privadas; no borrar datos de usuarios para revertir una imagen. Conservar la huella anterior junto al respaldo para restaurar la compatibilidad del despliegue anterior de forma controlada.
