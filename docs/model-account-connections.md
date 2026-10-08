# Cuentas de modelos y conector por usuario

Estado al 8 de octubre de 2026: diseño de integración; OAuth por suscripción y el conector local todavía no están implementados. El catálogo de modelos de esta entrega usa la conexión API personal existente.

## Objetivo

Cada usuario conecta su propia cuenta. Una instalación local pertenece a un usuario de Jetree; nunca se comparte la sesión del administrador con otros usuarios. La API será una alternativa que el usuario elige explícitamente, sin cambiar a facturación API cuando una sesión OAuth falle.

## Disponibilidad oficial

| Proveedor | Acceso por cuenta | Condición para Jetree |
| --- | --- | --- |
| OpenAI | Sign in with ChatGPT admite consumo del plan para aplicaciones locales elegibles | Una aplicación alojada como Jetree necesita solicitar acceso como partner antes de ofrecerlo desde la VPS. |
| Google | Gemini CLI permite iniciar sesión con Google y usar las cuotas correspondientes a la cuenta | Preparar un conector individual basado en el flujo oficial del CLI; OAuth de Gemini API sigue siendo consumo API. |
| Anthropic | Claude Code admite cuentas Claude, pero Anthropic restringe ofrecer ese login en productos de terceros | Obtener aprobación previa de Anthropic; instalar un conector local no elimina esta condición. |

Fuentes oficiales: [OpenAI](https://developers.openai.com/siwc/token-sharing-open-source), [registro y sesión](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [modelos e inferencia](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [Gemini CLI](https://geminicli.com/docs/get-started/authentication/), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).

## Contrato del conector propuesto

1. El usuario autenticado crea una vinculación de corta duración desde Jetree. Un código de un solo uso vincula una instalación y su clave pública exclusivamente con ese usuario.
2. El conector abre el login oficial en la computadora del usuario. Las credenciales quedan en el almacén seguro del sistema operativo, separadas por cuenta; Jetree no recibe la contraseña ni reutiliza un client ID de otro producto.
3. La instalación abre una conexión saliente TLS a Jetree. Los trabajos se autorizan por usuario, instalación, conversación y cuenta; no se abre un puerto público en la computadora.
4. El agente selecciona una conexión explícita. La pantalla muestra cuenta, fuente de consumo, modelos disponibles y disponibilidad de la instalación. Una sesión vencida solicita reconexión, sin cobrar por API automáticamente.
5. Las herramientas externas mantienen la autorización y aprobación en Jetree. El runtime de modelos no recibe permisos generales para ejecutar comandos o acceder a archivos locales.
6. Desvincular revoca la instalación y cancela trabajos pendientes. Un equipo apagado deja esa conexión fuera de línea; Telegram necesita una instalación encendida o una modalidad alojada autorizada.

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
