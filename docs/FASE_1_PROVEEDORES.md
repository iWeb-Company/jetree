# Fase 1 — Conexiones de proveedores y ejecución por usuario

## Alcance implementado

- Cada usuario configura sus propias credenciales API para OpenAI, Gemini, Anthropic o OpenRouter.
- La interfaz muestra metadatos de conexión; nunca vuelve a recibir la clave guardada.
- El servidor cifra las claves con AES-256-GCM y las guarda en `provider_connection_secrets`, separadas de los metadatos y sin acceso para `anon` o `authenticated`.
- El endpoint de chat autentica la sesión, carga el agente desde Supabase con RLS y obtiene las credenciales del usuario autenticado. No acepta un agente, proveedor, permiso o API key enviados por el navegador.
- Los agentes managers solo pueden delegar a agentes visibles dentro de su departamento.
- OpenRouter usa un endpoint fijo para evitar aceptar URLs de destino arbitrarias desde la configuración.
- Si falta una clave o falla el proveedor, la ejecución devuelve un error explícito; no usa credenciales globales ni respuestas simuladas.

## Configuración del servidor

Definir estas variables solo en el entorno del servidor:

```env
SUPABASE_SERVICE_ROLE_KEY=
JETREE_CREDENTIALS_ENCRYPTION_KEY=
```

Generar la clave de cifrado con `openssl rand -base64 32`. No debe tener prefijo `NEXT_PUBLIC_`. Guardar una copia protegida junto con los respaldos de la base. Para cambiarla, primero hay que descifrar y volver a cifrar todos los secretos; reemplazarla directamente dejaría las credenciales existentes ilegibles.

Aplicar las migraciones de Supabase en orden, incluida `002_provider_credential_vault.sql`, antes de habilitar las rutas nuevas.

## Modos de uso y límites actuales

| Proveedor | Estado en esta fase |
|---|---|
| OpenAI | API key de OpenAI Platform. La suscripción ChatGPT Pro no se usa como saldo de API. Integrar Codex con login ChatGPT requiere una validación separada antes de habilitarlo en Jetree. |
| Gemini | API key de Gemini API. No se reutiliza OAuth de Gemini CLI ni la cuota de Google AI Pro. |
| Anthropic | API key de Anthropic Console. No se ofrece login de Claude.ai Pro/Max en Jetree. El runtime oficial alojado requiere validación comercial y de producto con Anthropic. |
| OpenRouter | API key propia, con identificador del modelo configurado en el agente. |

`configured` significa que la clave quedó cifrada y guardada. Todavía no significa que el proveedor la haya validado ni que tenga saldo disponible; la primera ejecución puede informar un rechazo del proveedor.

## Antes de habilitar en producción

1. Configurar las variables anteriores en staging y producción.
2. Aplicar migraciones y probar lectura cruzada de conexiones con dos usuarios.
3. Probar guardar, reemplazar, usar y revocar una clave de cada proveedor en staging.
4. Validar con cada proveedor cualquier runtime que use una suscripción personal; no aceptar tokens OAuth extraídos de clientes o CLIs.
5. Definir límites de frecuencia y gasto antes de abrir el alta de usuarios externos.
