# Cuentas de modelos y conector por usuario

Estado al 8 de octubre de 2026: el acceso personal de Gemini CLI fue retirado por Google. La adaptación a Antigravity CLI está en validación; solo se habilita el login local y la vinculación permanece bloqueada. ChatGPT por suscripción requiere acceso autorizado. Anthropic respondió al responsable que Claude.ai Free/Pro/Max no puede integrarse en Jetree bajo las condiciones actuales: El chat Claude dentro de Jetree permanece por API; el MCP remoto permite usar herramientas de Jetree desde la aplicación oficial de Claude con autorización individual. El catálogo completo por cuenta y Telegram por conector personal no están habilitados; la API sigue disponible por elección explícita. Antes de habilitar el equipo Google debe validarse la sesión nativa, seleccionar explícitamente un modelo Gemini y verificar los permisos efectivos.

## Objetivo

Cada usuario conecta su propia cuenta. Una instalación local pertenece a un usuario de Jetree; nunca se comparte la sesión del administrador con otros usuarios. La API será una alternativa que el usuario elige explícitamente, sin cambiar a facturación API cuando una sesión OAuth falle.

## Disponibilidad oficial

| Proveedor | Acceso por cuenta | Condición para Jetree |
| --- | --- | --- |
| OpenAI | Sign in with ChatGPT admite consumo del plan para aplicaciones locales elegibles | Una aplicación alojada como Jetree necesita solicitar acceso como partner antes de ofrecerlo desde la VPS. |
| Google | Antigravity CLI reemplaza el acceso individual retirado de Gemini CLI | Validar el conector individual con login oficial de Antigravity y sin fallback API. La vinculación está bloqueada durante esta validación. |
| Anthropic | No permite login Claude.ai ni consumir planes Free/Pro/Max en Jetree bajo las condiciones actuales | API personal soportada. Solo un acuerdo directo distinto podría cambiar la situación; soporte no indicó un proceso para solicitarlo. |

Fuentes oficiales: [OpenAI](https://developers.openai.com/siwc/token-sharing-open-source), [registro y sesión](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [modelos e inferencia](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [transición oficial a Antigravity](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).

## Contrato del conector

1. El usuario autenticado crea un código aleatorio de 256 bits, de un solo uso y 5 minutos de vigencia. Vincula una instalación exclusivamente a su usuario; el servidor guarda hashes de los códigos y credenciales de transporte.
2. El conector abre el login oficial en la computadora del usuario. Google administra su OAuth en un perfil local exclusivo, protegido con permisos de archivo/ACL; no se promete que todos los sistemas dispongan de keychain. Jetree no recibe la contraseña ni el token Google y no reutiliza un client ID de otro producto.
3. La instalación consulta trabajos mediante TLS saliente, exclusivamente en los dominios oficiales de Jetree. El chat verifica su conversación y autoriza los trabajos por usuario e instalación; una credencial de dispositivo no permite consultar agentes o conversaciones. No se abre un puerto público en la computadora.
4. El usuario selecciona una conexión explícita en el chat. La pantalla muestra equipo, fuente de consumo, selección explícita de un modelo Gemini validado y disponibilidad. Una sesión vencida solicita reconexión, sin cobrar por API automáticamente; el catálogo completo por cuenta queda pendiente.
5. Las herramientas externas mantienen la autorización y aprobación en Jetree. El runtime de modelos no recibe permisos generales para ejecutar comandos o acceder a archivos locales.
6. Desvincular revoca la instalación y elimina trabajos pendientes. Un equipo apagado deja la conexión fuera de línea. La consulta del chat tiene un límite total de 50 segundos para encajar en el proxy actual. Los prompts/resultados temporales se eliminan al terminar/cancelar la petición; residuos de un proceso caído se limpian en la próxima actividad del relay, sin permitir su ejecución después de vencer.

Instalación: [connector/README.md](../connector/README.md). Solicitudes a proveedores: [provider-access-requests.md](provider-access-requests.md). OpenAI sigue pendiente. El MCP de Claude no ofrece inferencia ni reutiliza credenciales de Claude: autoriza agentes seleccionados, lectura y propuestas de escritura que se aprueban dentro de Jetree. La guía pública está en `/ayuda/conexiones`.

El catálogo OAuth de OpenAI usa `models` y `slug`, distinto del catálogo API `data` e `id`. Responses por cuenta requiere streaming y `store: false`; una desconexión o respuesta incompleta no se registra como éxito. La implementación debe seguir la documentación vigente, validar PKCE, estado y tokens, y renovar sesiones de forma coordinada por cuenta.

## Pruebas necesarias antes de habilitarlo

- Dos usuarios y dos instalaciones: ninguno puede ejecutar, listar modelos ni recibir resultados de la cuenta del otro.
- Código de vinculación vencido/reutilizado, dispositivo revocado y sesión vencida: rechazo sin alternativa API implícita.
- Equipo desconectado durante una respuesta: estado incompleto y reintento visible, sin duplicar acciones.
- Catálogo por cuenta y cambio de cuenta: no conservar modelos que la nueva cuenta no ofrece.
- Solicitud de herramienta: revisión y aprobación por el mismo usuario en Jetree, independientemente del runtime.

## Mejoras siguientes

Priorizar respuestas en streaming con cancelación, actividad de herramientas agrupada por ejecución, actualización de archivos existentes y consulta de PRs, y selección explícita de archivos de Drive. Las herramientas conversacionales de esta entrega se habilitan en el chat web autenticado; Telegram requiere primero una vinculación fiable entre el remitente y el usuario dueño de la conexión externa.

GitHub permite elegir acceso público o público y privado en esta entrega. El scope OAuth `repo` es amplio y no permite seleccionar repositorios individuales; una futura GitHub App puede ofrecer esa selección. Jetree guarda la elección del usuario y bloquea privados en modo público aunque el token conserve un scope amplio anterior. Drive mantiene `drive.file`; documentos fuera de ese acceso necesitan selección de archivos autorizada por el usuario.
