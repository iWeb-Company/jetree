# E2E reales de Gemini y Telegram — 2026-10-06

Base mergeada: main 76d065bed2695fd905b3375cbdd3f385838b40f0 (PR #10). Rama propuesta: codex/live-provider-telegram.

## Fallos encontrados y corregidos

Gemini 2.5 Flash devolvió 404 para la conexión de prueba aunque aparecía en el listado de modelos. Google documenta acceso limitado a proyectos con uso previo: https://ai.google.dev/gemini-api/docs/models . El nuevo valor predeterminado es gemini-3.5-flash-lite, probado con inferencia real. El selector elimina Gemini 1.5 Pro e incorpora opciones actuales. No se cambian agentes existentes automáticamente.

El worker fallaba con MESSAGE_SAVE_FAILED antes de inferir: usaba un upsert sobre telegram_update_id, cuyo índice único es parcial. El índice remoto se verificó en pg_indexes. Se reemplaza por insert; una violación 23505 se admite solamente si existe el mensaje para ese update exacto. Las demás fallas siguen deteniendo la ejecución. No hay cambios de esquema ni nuevas migraciones.

## Verificado contra Supabase y servicios externos

Sobre build local de producción, proyecto Jetree lgimqhuohkjtwfxbaecb y una identidad Auth sintética:

- Conexión Gemini validada y credencial cifrada guardada mediante Jetree.
- Inferencia real: suma sintética con respuesta 42, mensajes persistidos y ejecución completed.
- Webhook local autenticado y duplicado: una sola entrada de cola.
- Reintento con mensaje ya persistido: un solo mensaje, sin MESSAGE_SAVE_FAILED.
- Worker: inferencia real, sendMessage aceptado por Telegram y tarea completed.
- Error de entrega inducido con token inválido exclusivamente sintético: delivery_pending, backoff futuro y código seguro TELEGRAM_DELIVERY_FAILED.
- Credencial restaurada: entrega recuperada, con dos ejecuciones totales (chat y worker), sin nueva inferencia por reintento de entrega.
- Quinto intento fallido: update y tarea failed.
- Revocación local de Gemini: nuevas ejecuciones HTTP 409. Esto elimina la conexión de Jetree; no invalida la clave en Google.

El bot de pruebas no tenía webhook público. No se registró ni eliminó ningún webhook remoto; el ingreso HTTP fue reproducido localmente con un payload sintético, usando el destino del marcador jetree-e2e-ready autorizado. La entrega externa fue real. Telegram confirmó aceptación de sendMessage; no se afirma recepción humana ni webhook HTTPS de producción.

Las claves se leen desde un archivo protegido fuera de Git. No se guardan respuestas del modelo, tokens ni identificadores del chat en este documento. Auth, departamento, agentes, conexiones cifradas, tareas, conversaciones y cola sintéticos se eliminan al terminar. Los mensajes sintéticos enviados a Telegram permanecen en el chat de pruebas.

## Reproducción y límites

npm run test:e2e:live requiere el entorno protegido del servidor más JETREE_E2E_PROVIDER_KEY, JETREE_E2E_TELEGRAM_BOT_TOKEN y, opcionalmente, JETREE_E2E_MODEL. El modelo por defecto es gemini-3.5-flash-lite. JETREE_APP_URL debe ser loopback 127.0.0.1 y Supabase debe ser el proyecto exacto. Las tablas de negocio y cola deben estar vacías. El bot no debe tener webhook existente y debe contener el marcador sintético de preparación. No ejecutar en CI pública ni contra una base con datos personales. La prueba consume cuota de Gemini y del workspace.

Verificación local: 22 pruebas unitarias, lint, TypeScript y build aprobados; dos avisos img existentes. La suite Auth/RLS de once grupos se repite tras la corrección y se informa en el PR.

Rollback: regresar al artefacto/código 76d065b; no requiere restauración de esquema. No se publicó Jetree. Pendientes: webhook público HTTPS y programación operativa del worker, límites de gasto del worker, manager con proveedor real, escritura GitHub autorizada, staging y controles operativos/legales del plan. Persisten las nueve alertas de dependencias de desarrollo documentadas en el PR #10.

Verificación final: los once grupos E2E Auth/RLS pasaron. Lectura remota posterior: cero usuarios sintéticos, departamentos, agentes, proveedores, bots, updates y tareas; tres administradores conservados. Las ocho entradas de migración registradas siguen presentes.

