# Fase 3 — Conexiones de modelos

## Incluido

- Las claves API se comprueban con una solicitud de lectura al endpoint de modelos del proveedor antes de guardarlas.
- El servidor cifra las claves con AES-256-GCM; las respuestas del navegador contienen solo metadatos.
- Se puede revalidar una credencial guardada. El estado pasa a `connected`, `expired` o `error`, con fecha de última comprobación y un código de error seguro.
- La revocación elimina la conexión y su clave cifrada en cascada.
- `provider_connection_audit` registra guardado, validación, rechazo y revocación sin almacenar credenciales ni cuerpos de error del proveedor.
- La conexión es personal: el chat sigue obteniendo credenciales de la persona autenticada, aunque el agente sea compartido.

## Comprobación y límites

La validación usa endpoints de lectura de modelos de OpenAI, Gemini API y Anthropic, y el endpoint de estado de clave de OpenRouter. No genera contenido ni consume tokens de inferencia. `connected` confirma que la API aceptó la credencial para esta consulta; no garantiza cuota, saldo, habilitación de todos los modelos ni disponibilidad futura. El panel permite validar de nuevo y muestra errores con mensajes no sensibles.

Aplicar `005_provider_connection_health.sql` después de `001`–`004`. Asegurarse de que `SUPABASE_SERVICE_ROLE_KEY` y `JETREE_CREDENTIALS_ENCRYPTION_KEY` estén configuradas únicamente en el servidor.

## Fuera de este cambio

Este trabajo no conecta suscripciones ChatGPT Pro/Max, Claude Pro/Max ni Google AI Pro. Tampoco implementa renovación OAuth: las claves API no tienen refresh token. Codex App Server y cualquier runtime oficial alojado siguen requiriendo validación del producto, políticas y aislamiento antes de habilitarse.

## Verificación pendiente

En staging, probar guardar, reemplazar, revalidar y revocar una clave para cada proveedor; confirmar que un usuario no pueda ver la metadata ni usar la credencial de otro usuario; y verificar que los eventos de auditoría no contengan secretos. No se aplicó esta migración a Supabase remoto.
