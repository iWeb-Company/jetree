# Solicitar acceso por suscripción para Jetree

Verificado el 8 de octubre de 2026. Ningún proveedor garantiza aceptación ni plazo. No afirmar que Jetree es open source, que tiene determinada cantidad de usuarios o que una integración propuesta ya está implementada.

## OpenAI

Formulario oficial: https://openai.com/form/sign-in-with-chatgpt-interest/

- Work email: correo laboral del responsable, por ejemplo facundod@iwebtecnology.com si sigue siendo tu contacto.
- First name / Last name: nombre y apellido reales.
- Company name: nombre real de tu organización; iWeb si es la entidad responsable.
- Website URL: https://jetree.iwebtecnology.com/
- Job title: tu cargo real.
- Capabilities: **Sign in and ChatGPT plan use for AI requests**. El inicio de sesión solo no habilita consumo del plan.
- Products: pegar el texto siguiente, ajustando lo que corresponda.

> Jetree is a hosted, multi-user AI agent workspace operated by iWeb at https://jetree.iwebtecnology.com/. Users chat with agents and connect their own GitHub and Google Drive accounts. External write actions require explicit user approval. We request access to Sign in with ChatGPT and eligible ChatGPT plan usage for AI requests, rather than identity sign-in alone.
>
> We are designing an optional personal local connector, paired to each Jetree user. Please confirm whether this hosted application plus personal connector architecture is eligible, and which approved OAuth client, token storage, inference and deployment requirements apply. The subscription integration is not enabled yet. We will keep API billing as a separate, explicitly selected option and will not reuse another product's OAuth client or shared account credentials. We can provide a product demo and an architecture/data-flow description.

Pedir por escrito: elegibilidad del servicio alojado y del conector personal, permiso de consumo del plan, modalidad de registro/client ID, scopes autorizados, callbacks admitidos, planes elegibles, restricciones comerciales, cuotas, renovación/revocación y requisitos de marca. No configurar callbacks o scopes por suposición antes de que confirmen la modalidad.

Referencia: https://developers.openai.com/siwc/token-sharing-open-source

## Anthropic

**Respuesta recibida por Facundo el 8 de octubre de 2026:** Anthropic no permite a Jetree ofrecer login Claude.ai ni enrutar solicitudes con credenciales Free/Pro/Max bajo las condiciones actuales. Recomienda API personal. Soporte no ofrece un contacto/proceso específico para negociar excepciones; se necesitaría un acuerdo directo que modifique las condiciones estándar. No continuar presentando OAuth Claude como pendiente de una aprobación ordinaria ni usar un conector para eludirlo.

La documentación también exige aprobación previa: https://code.claude.com/docs/en/agent-sdk/overview. Los pasos y el texto siguientes documentan la consulta inicial, ya respondida; no es necesario repetirla.

1. Iniciar sesión en Claude o Claude Console con la cuenta del responsable.
2. Menú del perfil → **Get help** → **Send us a message**. Alternativamente, el mensajero del centro de ayuda estando conectado.
3. Pedir que deriven el caso al equipo que autoriza integraciones de terceros. Este es un canal de consulta, no una aprobación automática.
4. Mantener un único hilo y guardar la respuesta escrita. El acceso humano depende del rol/plan. Si hay un contacto comercial ya asignado, enviarle la misma solicitud.

Texto para enviar:

> I am requesting prior written approval to offer Claude account authentication and eligible subscription usage in Jetree, a third-party hosted AI agent workspace operated by iWeb: https://jetree.iwebtecnology.com/.
>
> We understand the Claude Agent SDK documentation prohibits offering claude.ai login or subscription rate limits in third-party products unless previously approved. We have not enabled this integration. Users would connect their own accounts; we would not share subscriptions or reuse Claude Code's OAuth client credentials. Our proposed architecture includes an optional personal local connector paired to a single Jetree user. External GitHub and Google Drive write actions require explicit approval in Jetree.
>
> Please route this request to the team responsible for approving third-party Claude authentication integrations. Is this hosted plus personal connector architecture eligible? If so, please specify the approved authentication mechanism, supported plans, permitted usage, rate limits, token storage/refresh/revocation requirements and commercial conditions. API access would remain a separately selected alternative. We can provide a demo and data-flow documentation.

No existe una aprobación por comprar Pro/Max o instalar el SDK. Hasta recibir autorización explícita para este uso, Claude en Jetree permanece por API.

Canal oficial: https://support.claude.com/en/articles/9015913-how-to-get-support

### Alternativa oficial: Jetree como conector de Claude

Claude admite conectar servicios mediante MCP remoto: https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities.

Implementación preparada para validación y despliegue: servidor MCP de Jetree con autenticación individual y herramientas acotadas para consultar agentes/tareas y solicitar acciones. La conversación y la inferencia se realizan en la aplicación oficial de Claude. Jetree no recibe ni intermedia el token Claude, y la API Claude no se invoca desde Jetree en ese flujo. Las escrituras conservan aprobación y permisos por usuario.

Esta opción incorpora OAuth individual con PKCE, selección de agentes, revocación y propuestas de cambios aprobadas en Jetree. No permite usar el chat propio de Jetree como interfaz de Claude por suscripción. No sustituye la autorización necesaria para esa integración. Tampoco debe convertirse en un proxy que use MCP para enviar solicitudes de inferencia ocultas en nombre de Jetree.

## Material para ambas solicitudes

- URL y video breve del producto real; nunca compartir usuarios o tokens de producción.
- Identidad y contacto de la entidad responsable.
- Usuarios actuales, proyección y modelo comercial reales, si preguntan.
- Política de privacidad/condiciones de la app completa. Las páginas /backups describen otra integración y no deben presentarse como política general de Jetree.
- Diagrama que distinga navegador, VPS, conector personal y proveedor, con ubicación/retención de credenciales y mensajes.
- Estado de cada control: implementado o propuesto. La autorización del proveedor debe cubrir también ejecuciones delegadas, en segundo plano y Telegram si se pretende habilitarlas.

La autorización empresarial es independiente del consentimiento OAuth que luego da cada usuario. Conservar el permiso escrito y activar únicamente las modalidades que cubra.
