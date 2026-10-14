# Modelos conectados y actividad de código en dev

La pantalla Código permite elegir entre las claves locales del ejecutor y una conexión API ya guardada en Jetree. Cada conexión conserva su identidad, aunque haya varias claves del mismo proveedor. El catálogo se obtiene con esa conexión; la sesión fija el proveedor, modelo y conexión elegidos.

## Claves y compatibilidad

Google, OpenAI, Claude, OpenRouter, DeepSeek y Groq usan sus endpoints oficiales compatibles con Chat Completions. Las claves de Jetree se descifran únicamente en el servidor. El broker recibe una credencial de inferencia de hasta ocho minutos, vinculada a la sesión y su claim. No recibe la API key del proveedor. El proxy comprueba propietario, conexión, ejecutor vigente, lease, cancelación, modelo, límite de 40 llamadas y una llamada simultánea. Las respuestas se limitan a 4 MiB y 120 segundos.

El catálogo no garantiza soporte de herramientas, cuota ni éxito con todos los modelos. El motor sigue necesitando un modelo de conversación capaz de utilizar herramientas. La compatibilidad OpenAI de Anthropic se ofrece como evaluación en dev: su documentación recomienda la API nativa para uso duradero y no ofrece todas sus funcionalidades, como caching. No se envían parámetros de sampling a Claude.

Referencias: [OpenCode Server](https://opencode.ai/docs/server/), [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [Anthropic OpenAI compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk).

## Actualizar el ejecutor

Esperar a que termine cualquier tarea activa. El proceso actual mantiene su configuración cargada y sus contenedores; no reiniciarlo a mitad de una tarea. Los ejecutores anteriores siguen aceptando sus modelos locales.

Construir la imagen actualizada con `node coding-runner/cli.mjs build` desde Ubuntu. Para autorizar conexiones de Jetree, añadir `"jetreeModels": true` al proyecto de la configuración local antes de vincularlo. Una vinculación existente conserva su propia copia privada de los proyectos en `connection.json`; debe autorizarse también allí o crear una vinculación nueva con la configuración actualizada. No imprimir ni compartir ese archivo porque contiene el token del ejecutor. Al iniciar el nuevo listener, registra la capacidad de los proyectos autorizados. No añade rutas, comandos ni permisos de instalación: mantiene las restricciones locales existentes.

## Actividad visible

El ejecutor escucha `/event` por SSE dentro del contenedor autenticado de OpenCode. Envía herramientas (lecturas, ediciones y comandos), mensajes visibles completados y la verificación independiente. No exporta partes de razonamiento. Envía lotes cada tres segundos; el panel consulta cada dos segundos. Los eventos se deduplican por secuencia y se muestran como texto, con seguimiento opcional dentro del visor. Límite: 500 eventos y 1 MiB por sesión, etiquetas de 600 caracteres y salida de 4096 por evento. Se filtran credenciales conocidas, Bearer y patrones de claves. Evitar secretos en comandos o archivos del proyecto: un filtro de patrones no puede reconocer cualquier dato privado.

La actividad es informativa y su entrega es best effort; un fallo de logs no repite la tarea. El informe y su entrega persistida siguen siendo el resultado de referencia. Una sesión iniciada con el ejecutor anterior mostrará estados generales, sin recuperar logs históricos.

## Validación

Pruebas unitarias de firmas, expiración, modelo fijo, seis proveedores, broker, autorización local, parser SSE, redacción y deduplicación. Postgres descartable comprueba permisos, ownership, claims, concurrencia, cuota, cancelación y bytes de actividad. La prueba Docker usa OpenCode 1.19.0 real, verifica llegada de herramientas y tests, conserva el original y comprueba aislamiento. Build, tipos, lint y vistas de 1440/390 px. Los tests CI autenticados comprueban logs y accesos cruzados; no equivalen a inferencia real con cada cuenta.
