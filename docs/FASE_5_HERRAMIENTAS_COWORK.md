# Fase 5 — Conectores y herramientas

La app ofrece dos conectores ejecutables por usuario: GitHub y Google Drive. La configuración del agente guarda qué conectores puede usar; el servidor vuelve a comprobar esa autorización en cada llamada y requiere una conexión OAuth activa del mismo usuario.

## Operaciones implementadas

| Conector | Lectura inmediata | Escritura con aprobación |
| --- | --- | --- |
| GitHub | Listar repositorios públicos; leer archivo | Crear issue; crear archivo nuevo |
| Google Drive | Buscar archivos accesibles a la app; leer Docs o texto | Crear documento |

Las operaciones se lanzan desde el panel de herramientas asociado al agente. Las escrituras se guardan como aprobaciones pendientes. La persona usuaria puede revisar los datos concretos, aprobar y ejecutar, o rechazar. Revocar una conexión borra la credencial local y cada llamada posterior se rechaza; la revocación remota se intenta con el proveedor.

La bitácora registra usuario, agente, conector, operación, resultado, error y costo. Las integraciones de GitHub y Drive no facturan por llamada a través de estas API; `cost_microunits` queda en cero. No se guardan contenidos de lectura en la bitácora.

## Configuración OAuth

Configurar en el entorno del servidor:

- `JETREE_APP_URL`: origen HTTPS publicado o `http://localhost:3000` en desarrollo.
- `GITHUB_OAUTH_CLIENT_ID` y `GITHUB_OAUTH_CLIENT_SECRET`: OAuth App de GitHub. El permiso se limita a `read:user public_repo`, por lo que Jetree trabaja sobre repositorios públicos.
- `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`: cliente OAuth de Google con URI de callback `JETREE_APP_URL/api/tool-connections/oauth/callback` y scope `drive.file`.

Aplicar `supabase/migrations/007_agent_tool_connectors.sql`. Los tokens OAuth se cifran con AES-256-GCM usando `JETREE_CREDENTIALS_ENCRYPTION_KEY`. El inicio OAuth crea un `state` aleatorio ligado a la identidad y de un solo uso, con vencimiento a los 10 minutos.

Drive `drive.file` limita los archivos visibles a aquellos que el usuario abrió o creó con la app; no concede lectura general de todo el Drive. Las credenciales y sus tablas no son legibles por `anon` ni `authenticated`; las operaciones pasan por endpoints autenticados del servidor.

## Limitación de alcance

El catálogo ahora muestra solo los dos conectores que tienen endpoints reales. En esta iteración, una persona usuaria inicia la operación desde el panel; el modelo no emite llamadas autónomas de herramientas. Los resultados se muestran en el chat. No se finge soporte para las demás entradas del antiguo catálogo. Las funciones no incluidas (por ejemplo, repositorios privados, actualización/borrado de archivos, comentarios y búsquedas semánticas) quedan deshabilitadas.
