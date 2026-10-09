# Conexiones de modelos: solo API

Jetree admite Google Gemini, Anthropic Claude, OpenAI, OpenRouter (`custom`, por compatibilidad con agentes existentes) y DeepSeek. El login de Jetree y OAuth de GitHub/Drive siguen funcionando. OAuth de modelos, MCP de Claude y dispositivos personales están pausados: sus rutas devuelven 410 y el build deja de distribuir el conector local. Las tablas anteriores se conservan para evitar eliminar datos.

## Uso

Conexiones de modelos muestra un único campo. El servidor reconoce el formato, valida mediante una lectura oficial y guarda el proveedor detectado. La UI oculta el campo después del éxito y muestra Agregar otra clave API. Cada nueva clave queda independiente, incluso para un proveedor repetido.

La primera clave de cada proveedor queda seleccionada. Usar esta clave cambia la selección explícitamente para chat, catálogo y Telegram de ese usuario. Eliminar o fallar la seleccionada no activa otra automáticamente. Los nombres incluyen un identificador de conexión; nunca se devuelve la clave al navegador.

Una clave identifica un proveedor, no un modelo. El catálogo viene de la conexión seleccionada y el modelo se elige al configurar el agente. OpenRouter permite modelos de otras compañías mediante su API.

Los formatos reconocibles se envían solo al emisor. Las claves legacy `sk-` de OpenAI y DeepSeek comparten formato: se prueban con GET en ambos endpoints oficiales, sin generar inferencia. Esto se informa antes de conectar. Tokens OAuth de Anthropic se rechazan. Los errores de red/cuota no se presentan como credencial inválida.

## Migración y despliegue

`20261009222915_api_model_connections.sql` agrega DeepSeek al enum, elimina UNIQUE(user_id,provider), conserva las conexiones existentes como seleccionadas y agrega funciones SECURITY INVOKER de guardado atómico y selección. Solo service_role puede ejecutarlas. No altera RLS ni devuelve secretos.

Antes del merge a dev: aprobar CI y aplicar esta migración en Supabase dev por el mecanismo de migraciones. Verificar permisos, secretos privados y conexiones existentes. Actualizar `/opt/jetree/environments/dev/schema.sha256` desde los bytes Git de la revisión aprobada, usando el procedimiento documentado; el deploy no aplica SQL ni actualiza la huella.

Coordinar migración con despliegue: el endpoint anterior usa upsert con la restricción que esta migración elimina y no puede guardar claves entre ambos pasos. Chat con una sola conexión existente permanece compatible. No agregar varias claves hasta desplegar la versión nueva. No restaurar la restricción UNIQUE si ya existen múltiples conexiones; una reversión requiere conservar los datos y una versión compatible.

Después del deploy de dev: comprobar health, APIs sin sesión, rutas pausadas, flujo autenticado de primera/segunda/tercera clave, selección de claves repetidas, catálogo, chat y Telegram; negativas de claves inválidas, eliminación y aislamiento. Para inferencia real hacen falta claves autorizadas de cada proveedor; las pruebas sintéticas de CI no certifican cuotas ni facturación de cuentas reales.

Solo después de esa validación abrir dev → main. Antes del despliegue de producción, aplicar y verificar la misma migración y actualizar su huella con respaldo previo.

## Pruebas

- Unitarias: formatos, autenticación para claves ambiguas, exclusión OAuth, errores y catálogo DeepSeek.
- SQL desechable: múltiples claves, selección, aislamiento, guardado atómico y eliminación del secreto correcto. Replay de esquema fresco y reconciliado.
- E2E desechable: Auth real de Supabase local, cinco proveedores simulados en transporte, DeepSeek chat, errores, cifrado y UI móvil/escritorio. El preload de simulación vive solo en tests, exige CI y base loopback; nunca forma parte del servidor desplegado.

Fuentes: https://developers.openai.com/api/reference/resources/models/methods/list ; https://ai.google.dev/api/models ; https://platform.claude.com/docs/en/api/models/list ; https://openrouter.ai/docs/api_reference/authentication ; https://api-docs.deepseek.com/api/list-models/
