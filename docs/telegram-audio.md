# Telegram: respuesta inmediata y audios

El webhook guarda el mensaje y confirma su recepción antes de empezar el trabajo con `after` de Next.js. Se procesa la cola de ese bot con las mismas exclusiones por chat y locks de PostgreSQL del scheduler. Este último permanece como respaldo, con intervalo predeterminado de 3 segundos. Chats diferentes se procesan en paralelo (máximo dos por lote); el orden de cada chat se conserva.

Al procesar, el bot muestra “escribiendo…” y renueva el estado cada cuatro segundos hasta entregar la respuesta o fallar. Un fallo de sendChatAction no bloquea la respuesta.

Se reciben notas de voz y adjuntos audio, hasta 5 minutos y 10 MB. Telegram entrega el archivo al servidor; se verifica la ruta y el tamaño real. No se guarda el archivo binario ni se expone el token del bot. La transcripción se guarda para evitar repetirla al reintentar y entra como texto en la conversación del agente, junto con el caption si existe. El bot responde por texto.

Para agentes OpenRouter, la transcripción prioriza una conexión seleccionada de Google, luego OpenAI y finalmente OpenRouter: los modelos gratuitos de chat no incluyen la transcripción Whisper. Para Google/OpenAI se prioriza su propia conexión; para Claude/DeepSeek se usa Google, OpenAI u OpenRouter en ese orden. Se utilizan conexiones del mismo usuario y no se cambian claves al fallar. La transcripción puede consumir cuota o saldo de la cuenta API. Modelos: Gemini 2.5 Flash, Whisper-1 o OpenRouter openai/whisper-1. La cuota de ejecución se reserva antes de enviar audio a un proveedor. Los rechazos permanentes (saldo, autenticación, modelo o formato) fallan con un aviso inmediato en Telegram; solo los fallos transitorios se reintentan.

Despliegue: migración `20261009233141_telegram_audio.sql` agrega metadata/transcripción y un RPC restringido a service_role; preservar RLS. Aplicar en dev y actualizar su schema.sha256 antes del deploy. Repetir después en producción. Si worker.env fija JETREE_WORKER_INTERVAL_SECONDS=60, cambiar a 3 para mejorar también la recuperación; la ruta inmediata funciona aunque siga fijado a 60.

Validación: unitarias de formatos, límites, rutas/descargas, transcripción y typing. E2E CI con Auth/base real descartable, Telegram y proveedores simulados: ACK rápido, procesamiento sin invocar scheduler, audio, deduplicación, typing y rechazo de duración excesiva. Después de deploy dev, probar texto y audio real y observar “escribiendo…”, luego promover a main.

Fuentes: https://core.telegram.org/bots/api#sendchataction ; https://core.telegram.org/bots/api#getfile ; https://ai.google.dev/gemini-api/docs/audio ; https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create ; https://openrouter.ai/blog/tutorials/transcription-on-openrouter/ .
