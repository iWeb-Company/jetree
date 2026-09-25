# Verificación funcional de Jetree

Fecha: 21 de septiembre de 2026. Entorno: aplicación local en `http://127.0.0.1:3000`, código del directorio de trabajo, dos cuentas reales de prueba y servicios configurados en `.env.local`.

## Resultado

**El proyecto no cumple todavía los requisitos de agentes propios por usuario, suscripciones conectadas mediante OAuth y herramientas ejecutables.** La interfaz permite configurar agentes, pero varias conexiones y estados son simulados. Hay fallos reproducidos de compilación, chat y aislamiento entre cuentas.

Se verificó la implementación existente; no se modificó su código para ocultar o corregir los resultados. Las pruebas externas se limitaron a dos consultas mínimas de IA y consultas de estado de Telegram. No se enviaron mensajes por Telegram ni se modificó su webhook.

## Matriz de funcionalidades

| Funcionalidad | Resultado | Evidencia y alcance |
| --- | --- | --- |
| Inicio y cierre de sesión | Funciona en las pruebas | Se ingresó con una cuenta, se cerró sesión y se ingresó con otra. La sesión se restauró después de recargar. |
| Registro y recuperación de cuenta | No implementados en la interfaz revisada | Solo hay formulario de inicio de sesión. |
| Navegación del panel | Funciona en las pantallas probadas | Panel, agentes y monitoreo; estructura de departamentos visible en el panel. |
| Crear agente y asignar departamento | Funciona localmente | Se creó `QA-20260921-Aislamiento` en Operaciones; sobrevivió a una recarga. |
| Editar agente y filtrar por departamento | Funciona localmente | El filtro mostró el agente de prueba; se guardó una descripción modificada. |
| Propiedad de agentes por usuario | **Falla** | La segunda cuenta vio y editó el agente creado por la primera en el mismo navegador. |
| Persistencia de agentes entre dispositivos | No implementada | Agentes en `localStorage`, sin almacenamiento por usuario en el servidor. |
| Administrar departamentos | Parcial | Se muestran departamentos predefinidos y se asignan agentes; no hay flujo de creación/edición de departamentos. |
| OAuth de suscripciones | **Simulado** | Al pulsar conectar Claude, el estado pasó a conectado sin autorización externa; persistió y apareció en la segunda cuenta. |
| Chat de agentes | **Falla** | La interfaz y la API devuelven `AVAILABLE_PLUGINS is not defined`. |
| Delegación entre agentes | Bloqueada | Comparte el orquestador defectuoso; no se pudo validar una delegación real de extremo a extremo. |
| Catálogo de herramientas | Solo configuración visual | Se visualizaron 65 entradas, se buscó GitHub y se guardó un cambio de selección. No existen ejecutores de esas herramientas. |
| OpenAI, llamada directa de diagnóstico | **Falla por saldo** | `gpt-4o-mini`: HTTP 429, `credit_balance_exhausted`. Esto no es OAuth ni acredita una suscripción de ChatGPT. |
| Gemini, llamada directa de diagnóstico | **Falla** | `gemini-2.5-flash`: HTTP 404. No se validaron todos los modelos alternativos del selector. |
| Claude | Sin credencial real configurada | Sin `ANTHROPIC_API_KEY`; prueba aislada del adaptador devolvió una respuesta simulada, sin petición de red. |
| Telegram global | Credencial y registro válidos | `getMe` y `getWebhookInfo`: HTTP 200, bot válido, webhook configurado, cero actualizaciones pendientes y sin último error registrado. No demuestra entrega extremo a extremo. |
| Telegram por agente | **Implementación incompleta** | El formulario abre, pero el webhook no carga los agentes creados en el navegador; usa agentes iniciales o inventa uno de reemplazo. |
| Tablero de tareas | Parcial | Vacío en las cuentas probadas. Renderizado aislado mostró `pending`, `in_progress` y `completed`, pero ocultó `failed`. |
| Persistencia y Realtime de tareas | Pendiente de prueba completa | No se generaron tareas externas. El código ignora errores de actualización y escucha solamente inserciones. |
| Monitoreo | Parcial y engañoso | Muestra cambios locales, pero también eventos precargados que afirman haber verificado Telegram. No es una auditoría persistente de ejecuciones. |

## Defectos prioritarios

### P1 — Aislamiento y autorización

- `src/app/page.tsx:79` y `:96`: la clave `jetree_agents` es compartida por todas las cuentas del mismo navegador. `jetree_user_subscriptions` tiene el mismo problema. Cerrar sesión no separa estos datos. Reproducido con dos cuentas, incluyendo edición cruzada.
- Los objetos de agentes pueden incluir `customApiKey` y `telegramBot.botToken`, y se serializan completos en ese almacenamiento. No se ingresaron secretos en la prueba, pero el flujo de almacenamiento está presente.
- `src/app/api/agents/chat/route.ts:7`: no verifica sesión ni propiedad del agente. Confía en agentes, claves, historial y subordinados proporcionados por el cliente. Una petición sin cookies llegó al orquestador. Corregir únicamente la variable inexistente dejaría expuesto el uso de claves globales.
- Los webhooks no comprueban un secreto de Telegram ni asocian la petición a un propietario. Una actualización vacía sin secreto devuelve 200. La falta de validación también se comprobó leyendo los handlers.
- Las consultas de tareas no incluyen propietario. No hay migraciones ni políticas RLS en el repositorio que permitan verificar la configuración remota; **no se afirma que RLS esté deshabilitado**.

### P1 — Ejecución y estados falsos

- `src/lib/agents/orchestrator.ts:20`: usa `AVAILABLE_PLUGINS`, aunque importa `ALL_CHATGPT_WORK_PLUGINS`. Bloquea TypeScript, build y chat.
- `src/components/OAuthSubscriptionsModal.tsx:25`: simula el handshake con un temporizador. No hay inicio de autorización, callback, canje, renovación ni revocación de tokens.
- `src/app/page.tsx:37`: OpenAI y Gemini aparecen conectados desde los datos iniciales.
- `src/lib/agents/orchestrator.ts:25`: indica al modelo que puede simular integraciones. Los adaptadores solo envían texto; no hay llamadas a herramientas, cliente MCP, credenciales por conector ni resultados de ejecución.
- `src/lib/claude.ts:5`: sin clave devuelve texto simulado que sugiere conectar un OAuth inexistente.
- El orquestador captura errores de proveedores y luego registra finalizaciones exitosas. La delegación puede seleccionar el primer subordinado cuando el identificador no corresponde, o acceder a un agente inexistente si la lista queda vacía.

### P2 — Tareas, Telegram y observabilidad

- `src/app/page.tsx:299`: actualiza la tarea visualmente antes de persistir y no comprueba el `error` devuelto por Supabase ni revierte el cambio.
- `src/components/TaskBoard.tsx:26`: no incluye columna para `failed`.
- El Realtime solo escucha `INSERT`; no sincroniza modificaciones ni eliminaciones. Los logs y chats no se guardan de forma persistente.
- `src/app/api/webhook/telegram/[agentId]/route.ts:32`: no recupera la configuración guardada por el usuario. Las tareas se insertan sin propietario/departamento/agente y no se completan al terminar la respuesta. Los helpers no validan el éxito HTTP de los envíos.
- La interfaz de Telegram puede guardar un bot como activo después de un error de red. Registrar un webhook directamente desde el navegador tampoco valida su ejecución.
- `src/lib/agents/initialData.ts`: incluye mensajes ficticios sobre validación de Telegram y monitoreo del manager.
- El proveedor `custom` no configura un endpoint personalizado: termina llamando a OpenAI o Gemini.
- `README.md` contiene una credencial en texto plano. Debe retirarse y rotarse si sigue vigente; no se reprodujo su valor en este informe.

## Pruebas técnicas reproducidas

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | Falla: TS2304 y TS7006 en el orquestador. |
| `npm run build` | Falla en comprobación de tipos por la misma variable. |
| `npm run lint` | Solicita configurar ESLint; no ejecuta una comprobación configurada. |
| `GET /api/agents` | 200; solo comprueba que el handler responde. |
| `POST /api/agents/chat` con `{}` | 400 por campos faltantes. |
| Mismo endpoint con JSON mal formado | 500; debería tratarlo como entrada inválida. |
| Mismo endpoint con agente de prueba, sin sesión | 500 por variable inexistente, sin rechazo de autenticación. |
| Ambos webhooks con `{}`, sin secreto | 200, sin procesamiento externo. |

La prueba aislada de Claude ejecutó el adaptador con entorno vacío y red bloqueada. La del tablero utilizó `renderToStaticMarkup` con una tarea por estado. No se atribuyen a estas pruebas resultados de integración con servicios reales.

## Viabilidad de las suscripciones y herramientas

**No existe una implementación uniforme demostrada de “conectar cualquier suscripción y usarla como API”.** Hay que diferenciar identidad, derecho de uso del modelo y autorización de herramientas.

- **OpenAI:** Codex App Server documenta integración en productos y OAuth administrado de ChatGPT. Es una vía para evaluar mediante un runtime aislado por usuario; no convierte el cliente actual de Chat Completions en acceso por suscripción. [App Server](https://learn.chatgpt.com/docs/app-server), [autenticación](https://learn.chatgpt.com/docs/auth).
- **Gemini:** la API documenta OAuth asociado a un proyecto de Google Cloud y facturación propia. Gemini CLI permite iniciar sesión con una cuenta Pro/Ultra, pero su FAQ rechaza reutilizar su OAuth desde agentes de terceros. No prometer a Jetree acceso a esa cuota mediante extracción de tokens. [OAuth de API](https://ai.google.dev/gemini-api/docs/oauth), [facturación](https://ai.google.dev/gemini-api/docs/billing), [FAQ de CLI](https://geminicli.com/docs/resources/faq/).
- **Claude:** una nota de soporte reciente describe consumo de suscripción mediante Agent SDK; la documentación del SDK exige aprobación previa para que terceros ofrezcan login de claude.ai o sus límites en sus productos. Para Jetree hay que resolver esa habilitación concreta; no darla por existente. La alternativa documentada es autenticación de API. [Nota sobre suscripciones](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).
- **Herramientas estilo Cowork:** necesitan un runtime con ejecución de herramientas, conectores MCP/API autorizados por usuario, permisos por agente, resultados verificables y control de efectos externos. Agent SDK documenta herramientas y MCP; seleccionarlas en un catálogo no las conecta. [Capacidades del SDK](https://code.claude.com/docs/en/agent-sdk/overview).

## Orden de implementación y criterios de aceptación

1. **Identidad y persistencia:** departamentos, agentes, conexiones, tareas y conversaciones con propietario, validación de sesión en servidor y RLS. La cuenta B no debe leer ni modificar datos de A, tampoco con IDs o cuerpos manipulados.
2. **Credenciales:** secretos solo en servidor, cifrados y vinculados al usuario. Ninguna clave del proveedor debe aparecer en respuestas, logs o almacenamiento del navegador.
3. **Conexiones reales:** adaptadores diferenciados por proveedor y modo de acceso permitido. Estado conectado solo tras validación; desconexión, expiración y falta de saldo deben reflejarse correctamente.
4. **Motor de agentes:** corregir compilación, validar entradas y subordinados, preservar errores, persistir ejecuciones y aplicar límites de tiempo/consumo. Probar chat y delegación con respuestas reales y fallos controlados.
5. **Herramientas:** empezar por una herramienta de lectura y otra de escritura, con permisos por usuario/agente. Verificar llamada, resultado, rechazo por falta de permiso y revocación. Ampliar el catálogo cuando los conectores funcionen.
6. **Telegram y tareas:** configuración persistida por agente, secreto de webhook, deduplicación, asignación de propietario/departamento y actualización del estado final. Probar un mensaje completo en un bot de prueba autorizado.
7. **Regresión:** automatizar aislamiento entre dos usuarios, expiración de conexiones, errores de proveedor, herramientas y flujo completo de tareas. Configurar lint y pruebas en CI.

## Estado dejado por la verificación

- Quedó el agente local `QA-20260921-Aislamiento`, sin claves, en Operaciones, con descripción que identifica la prueba de edición cruzada y ocho plugins seleccionados. La interfaz no ofrece eliminar agentes.
- Se devolvió Claude al estado local desconectado. No se autorizó ninguna conexión OAuth real.
- No se alteraron agentes existentes, datos de tareas ni configuraciones remotas de Telegram.
- Quedan sin validar: uso real de Claude, modelos alternativos, RLS remoto, entrega de mensajes de Telegram, persistencia/Realtime de tareas con datos y ejecución de herramientas todavía inexistentes.
