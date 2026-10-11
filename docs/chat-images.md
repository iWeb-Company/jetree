# Imágenes en web y Telegram

Los managers y agentes pueden recibir una imagen por mensaje (JPG, PNG o WebP, hasta 5 MB y 16 millones de píxeles), analizarla y generar una imagen como respuesta. La web permite adjuntar archivos y descargar las respuestas. Telegram admite fotos y documentos de imagen; devuelve las imágenes generadas como fotos con una descripción.

En **Editar agente → Imágenes**, se configura:

- **Modelo para leer imágenes**: opcional, del mismo proveedor que el agente. Vacío usa su modelo de chat. Debe admitir visión; un modelo de texto puro puede rechazar el pedido.
- **API para generar imágenes**: Google, OpenAI u OpenRouter; usa la conexión API seleccionada de ese proveedor. Por defecto usa el proveedor del agente, sin cambiar de cuenta automáticamente.
- **Modelo para generar imágenes**: acepta cualquier ID compatible. Las sugerencias no constituyen una lista permitida ni garantizan disponibilidad o gratuidad.

Se reconoce «Generá una imagen de…», «Creame un logo…» y pedidos similares. También se puede marcar **Generar imagen** en la web o enviar `/imagen un paisaje al atardecer` en Telegram. Una pregunta sobre qué modelo usar no genera una imagen. Una nota de voz transcripta puede pedir una imagen de la misma forma.

Los consejos se muestran al adjuntar/pedir una imagen y acompañan la respuesta. Si una API falla, Jetree explica que hay que revisar modelo, permisos o cuota. La generación puede requerir saldo aunque el chat tenga un plan gratuito. No se sustituye automáticamente el proveedor.

## Historial, privacidad y límites

Las imágenes se guardan en el bucket privado `chat-images`. No hay URLs públicas ni claves en el cliente. El endpoint autenticado comprueba RLS; las imágenes enviadas siguen los permisos de la conversación del departamento. Los adjuntos sin enviar son privados del usuario y expiran a las 24 horas. La limpieza elimina hasta 20 adjuntos vencidos por carga de imagen o ejecución del worker.

Se decodifican imágenes reales, se quitan metadatos y se reducen a un máximo de 2048 píxeles por lado. La web prepara la carga por debajo de 768 KiB para respetar el límite habitual de Nginx, conservando PNG cuando entra y usando JPEG cuando necesita compresión. Se conserva en contexto un máximo de dos imágenes anteriores de los últimos ocho mensajes y la imagen actual; se acota también el tamaño total. SVG y animaciones quedan fuera de esta versión.

La generación usa una sola imagen de salida por pedido. Las referencias recibidas o recientes se envían al proveedor para permitir cambios de una imagen. El historial compartido conserva los adjuntos recibidos y generados al recargar el chat.

Telegram persiste la imagen antes de enviarla. Si Telegram rechaza explícitamente una entrega, el worker reutiliza el archivo sin generar de nuevo. Si se pierde la confirmación de entrega, no reenvía la foto automáticamente: avisa que está disponible en la web. Si una generación comenzó y no pudo confirmarse/guardarse, tampoco la repite automáticamente, para evitar otro cobro.

## Despliegue

Aplicar `20261011020708_chat_images.sql` en Supabase del entorno y actualizar su `schema.sha256` antes del merge. No hacen falta variables ni servicios nuevos. La migración crea el bucket privado y campos de modelos opcionales; los agentes existentes conservan su configuración.

El proxy de la web debe permitir ejecuciones largas de imágenes. Dentro del `location` que contiene `proxy_pass` para Jetree, usar `proxy_read_timeout 240s;` y `proxy_send_timeout 240s;` si no hay ya un timeout superior. Validar con `sudo nginx -t` antes de recargar. La app limita la generación a 150 segundos y la visión a 25 segundos por llamada; las cuotas del workspace siguen aplicándose.

## Referencias oficiales verificadas

- [Google: generación de imágenes](https://ai.google.dev/gemini-api/docs/image-generation), [Interactions API](https://ai.google.dev/api/interactions-api) y [visión](https://ai.google.dev/gemini-api/docs/image-understanding).
- [OpenAI: generación y edición](https://developers.openai.com/api/docs/guides/image-generation) y [visión](https://developers.openai.com/api/docs/guides/images-vision).
- [OpenRouter: Images API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) y [catálogo de modelos de imágenes](https://openrouter.ai/api/v1/models?output_modalities=image).
- [Claude: visión](https://platform.claude.com/docs/en/build-with-claude/vision) y [Groq: visión](https://console.groq.com/docs/vision).
- [Supabase: control de acceso a Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Verificación

`npm test`, lint, TypeScript y build. El E2E aislado agrega cargas privadas, separación entre propietario/miembro/otro usuario, lectura con contexto, manager, tres APIs de generación, Telegram con fotos, entrega reintentada sin nueva generación y capturas de escritorio/móvil. Los proveedores y Telegram de CI son transportes sintéticos; las pruebas reales se hacen después del deploy de dev con la API conectada por el usuario.
