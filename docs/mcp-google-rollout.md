# Claude MCP y Google personal: promoción

## Dev

1. Aplicar `20261008162802_personal_model_connector.sql` y `20261008171309_claude_mcp_connector.sql` y verificar historial, RLS y permisos. Completado en dev.
2. Actualizar la huella VPS de dev a `5fe6cc30589c7f0976b7e194b01990bdb31095972627027f53d63a6ae1ca8938`. La huella se calcula desde los bytes de la revisión publicada en GitHub; no desde un checkout Windows con conversión de saltos de línea.
3. Aprobar CI del PR: aplicación, base de datos, contenedor y Auth/navegador desechables. Promover a dev y esperar despliegue saludable.
4. Abrir `/ayuda/conexiones` desde dev en móvil y escritorio. Descargar el conector sin requerir acceso al repositorio.
5. En Claude oficial, agregar `https://jetree-dev.iwebtecnology.com/mcp`, autenticar cada usuario en Jetree, seleccionar agentes y comprobar listado. Proponer una rama y rechazarla en Jetree; comprobar estado y revocar acceso. No usar credenciales de Claude dentro de Jetree.
6. Google: cada usuario descarga e instala su conector, inicia sesión en Google por Gemini CLI, vincula su equipo a dev y elige esa conexión en el chat. Comprobar respuesta real, desconexión, revocación y rechazo de dispositivos ajenos. No cambiar automáticamente a API.

## Producción

1. Después de validar dev, aplicar las mismas dos migraciones en el proyecto de producción y verificar permisos e historial. Son tablas y funciones nuevas; no migran credenciales de proveedores.
2. Respaldar y actualizar la huella VPS de producción al mismo valor. Mantener las credenciales y configuración de producción existentes.
3. Crear PR dev → main con CI en verde, mergear y esperar el despliegue automático y sus comprobaciones de revisión/salud.
4. Verificar `/api/health` 200, `/api/agents` sin sesión 401, guía pública 200 y descarga del conector. Las rutas `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, `/mcp`, `/api/mcp-oauth/*` y `/claude/*` deben llegar a la app mediante el proxy existente. No registrar códigos OAuth, tokens ni prompts en logs de acceso.
5. Repetir Claude y Google con URLs de producción y cuentas individuales. Dev y producción tienen autorizaciones independientes; no reutilizar un código ni una credencial de dispositivo entre entornos.
6. Verificar que el chat API y Telegram existentes siguen funcionando. Telegram no usa el conector personal Google ni ejecuta inferencia Claude por MCP.

OpenAI por suscripción permanece pendiente de respuesta y deshabilitado. El MCP no permite inferencia Claude en el chat propio de Jetree; la conversación ocurre en Claude oficial. La selección del modelo Google corresponde al modelo predeterminado del CLI, sin prometer un catálogo completo por suscripción.

## Reversión

Restaurar la imagen anterior con el procedimiento app + worker existente si fallan las comprobaciones del despliegue. Conservar las nuevas tablas privadas; no borrar datos de usuarios para revertir una imagen. Conservar la huella anterior junto al respaldo para restaurar la compatibilidad del despliegue anterior de forma controlada.
