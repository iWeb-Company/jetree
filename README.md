# Jetree

Workspace multiusuario de agentes de iWeb.

## Configuración local

Copiá `.env.example` a `.env.local` y completá la configuración del proyecto Supabase de desarrollo.

No subas credenciales reales al repositorio. Las claves de proveedores y los tokens de Telegram deben gestionarse del lado servidor; nunca se deben guardar en el navegador.

Usá proyectos separados para desarrollo, staging y producción. No configures credenciales de producción en entornos de desarrollo.

Consulta [PLAN_PRODUCCION.md](PLAN_PRODUCCION.md) para la hoja de ruta.

## Telegram y procesamiento de tareas

Aplica las migraciones de Supabase en orden hasta `008_telegram_task_queue.sql`. Para conectar bots, configura `JETREE_APP_URL` con el origen HTTPS público de la aplicación, `SUPABASE_SERVICE_ROLE_KEY` y `JETREE_CREDENTIALS_ENCRYPTION_KEY`.

Configura un programador externo para enviar `POST /api/telegram/worker` al menos una vez por minuto con la cabecera `x-jetree-worker-secret`. El valor debe ser un secreto aleatorio de al menos 32 caracteres y coincidir con `JETREE_TELEGRAM_WORKER_SECRET`. El worker procesa hasta 2 updates por llamada; los errores se reintentan con demora creciente hasta cinco intentos. Los fallos terminales se pueden reabrir desde el tablero.

Cada bot guarda su token cifrado por agente. Telegram autentica las llamadas al webhook con un secreto independiente, y los `update_id` duplicados se descartan mediante una restricción única. La desconexión elimina el token y quita el webhook.
