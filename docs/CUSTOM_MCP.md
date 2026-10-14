# MCP personalizados

En **Herramientas → MCP personalizados**, agregá el nombre y la URL HTTPS pública del servidor. Elegí autenticación sin credenciales, token/API key o OAuth, y transporte automático, Streamable HTTP o SSE clásico. Jetree descubre las herramientas, recursos y prompts que anuncia el servidor.

**Conectar Notion** prepara el MCP oficial con OAuth. **Conectar Obsidian** prepara autenticación Bearer para el complemento Local REST API with MCP; cada usuario ingresa la URL HTTPS accesible y el token de su vault. Ambas opciones tienen una guía breve cerrada por defecto. La [guía de notas](/ayuda/notas) explica vaults locales, copias con Sync y túneles. No se instala ni configura una cuenta o vault compartido para todo Jetree.

Asigná cada conexión a los managers y agentes que deban usarla. La asignación habilita el conector MCP en ese agente; las conexiones pertenecen al usuario que las creó. Los mismos permisos y aprobaciones se usan en el chat web y Telegram. El servidor recibe los argumentos de las herramientas; conectá solo servidores de confianza. Las respuestas y descripciones del MCP son contenido externo, no instrucciones que puedan ampliar permisos.

Las llamadas a herramientas, lecturas de recursos y recuperación de prompts requieren aprobación por defecto. En **Herramientas y aprobaciones** podés autorizar herramientas individuales como lectura automática. Los `readOnlyHint` enviados por el servidor no conceden permisos. Cambiar su definición invalida la autorización automática y las aprobaciones anteriores. Desconectar elimina credenciales y asignaciones de Jetree; para OAuth también podés revocar el permiso desde el proveedor.

## Autenticación

- **Token:** `Authorization` usa `Bearer`; para otros servicios podés indicar un encabezado como `x-api-key`. Ingresá el secreto en el campo protegido, nunca en la URL.
- **OAuth:** Jetree descubre el issuer y registra el cliente si el servidor permite registro dinámico. Si exige un cliente preconfigurado, ingresá Client ID, issuer exacto y client secret si corresponde. Registrá el callback de ese entorno: `https://jetree-dev.iwebtecnology.com/api/custom-mcp/oauth/callback` para dev. No es el callback de Gmail ni de la autenticación de modelos.
- Las credenciales se cifran con la clave existente de Jetree. El modelo no recibe los tokens; OAuth usa PKCE, estado de un solo uso y renovación de tokens. No se necesitan nuevas variables para esta integración.

## Primera prueba sin cuenta externa

El MCP público de documentación de Cloudflare admite `https://docs.mcp.cloudflare.com/mcp`, sin autenticación y con transporte automático. Después de conectarlo y asignarlo a un agente, pedile: «Usá el MCP de documentación de Cloudflare para buscar cómo configurar Workers». Revisá y aprobá la llamada en web o Telegram. No se conecta automáticamente a la cuenta de Cloudflare ni se conceden permisos sobre sus recursos.

Referencia del proveedor: https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/

## Alcance y límites

Esta versión conecta servidores remotos desde la VPS: la PC puede estar apagada. No ejecuta comandos `stdio`, paquetes `npx` ni servidores locales en la PC; tampoco agrega MCP al motor de las sesiones de código aisladas. Mantiene la elección de modelo API del agente.

Se admiten 20 conexiones por usuario, hasta 500 herramientas por servidor, esquemas de 16 KB y argumentos de 12 KB. Las respuestas HTTP tienen límite de 2 MiB y cada conexión dura como máximo 45 segundos. El catálogo del modelo se consulta por páginas. Los resultados se acotan y redactan; los bloques binarios de imagen, audio o archivos se omiten del chat de texto en esta versión. Un servidor que requiera otras capacidades o exceda estos límites puede no ser compatible.

No se reintenta automáticamente una llamada fallida: un error de transporte puede ocurrir después de que el servidor haya ejecutado la acción. Revisá el resultado externo antes de solicitarla nuevamente.

## Validación

Las pruebas usan el SDK oficial contra fixtures de Streamable HTTP/JSON/SSE, SSE clásico y OAuth con PKCE/refresh. Cubren SSRF, DNS, redirecciones, límites, esquemas en workers, aislamiento de propietarios, asignaciones, aprobaciones y revocación. PostgreSQL descartable aplica todas las migraciones y verifica permisos privados. El E2E de CI usa usuarios Auth reales y capturas de escritorio/móvil; no necesita credenciales ni servidores externos. La conexión pública de Cloudflare se prueba aparte, sin datos privados.
