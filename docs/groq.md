# Groq en Jetree

1. Creá una API key en https://console.groq.com/keys.
2. En Conexiones IA ingresala en el campo único. Jetree detecta el prefijo `gsk_`, valida contra el endpoint oficial y guarda la clave cifrada en el servidor.
3. Podés agregar varias claves y elegir la activa, igual que con los otros proveedores.
4. Elegí Groq al crear o editar managers y agentes. El catálogo se consulta con la clave activa; elegí un modelo de generación de texto para conversar. Los modelos de audio no sirven como modelos de chat.

El chat, Telegram y las herramientas existentes usan el modelo elegido. Las notas de voz también pueden transcribirse con Groq (`whisper-large-v3-turbo`), conservando los límites actuales de Jetree. El plan gratuito tiene cuotas por modelo y por transcripción: consultar https://console.groq.com/docs/rate-limits.

No requiere contenedores adicionales, instalaciones ni variables nuevas en la VPS. Las claves se ingresan únicamente en Jetree, nunca por chat ni en `runtime.env`.

La migración `20261011000343_groq_provider.sql` incorpora el proveedor al enum existente. La migración previa de FreeLLMAPI se conserva porque ya fue aplicada en dev; su valor de enum queda inactivo. FreeLLMAPI no está habilitado ni se instala.
