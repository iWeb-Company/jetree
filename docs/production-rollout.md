# Puesta en producción de las mejoras de Jetree

Esta lista deja las mejoras activables de forma gradual. No se debe saltar el paso de migración de Supabase.

## 1. Preparar la rama

1. Crear una rama con prefijo `jetree-branch-` y abrir un PR hacia `dev`.
2. Esperar todos los checks obligatorios: aplicación, base, contenedor, despliegue y E2E.
3. Revisar el resumen del PR: responsive, catálogo de modelos, herramientas y permisos GitHub.
4. Fusionar en `dev` y comprobar `https://jetree-dev.iwebtecnology.com/api/health`.

## 2. Migrar la base

Aplicar `supabase/migrations/20261008144529_github_permission_intent.sql` primero en el proyecto Supabase de dev y luego en producción usando el flujo de migraciones aprobado. La migración agrega únicamente el alcance solicitado a cada estado OAuth; los estados existentes quedan como `public`.

El despliegue de la VPS no aplica migraciones. Después de verificar la migración en cada base, regenerar `schema.sha256` desde la release revisada con exactamente estos archivos SQL y saltos de línea LF:

```bash
sha256sum supabase/migrations/*.sql | sha256sum | cut -d' ' -f1
```

Guardar ese valor en `/opt/jetree/environments/dev/schema.sha256` o `/opt/jetree/environments/production/schema.sha256`, según la base que se verificó. Hasta completar esto el deploy rechazará la imagen con código 65 y conservará el servicio anterior. Preparar base y huella antes de relanzar el deploy.

## 3. Configurar producción

Verificar antes del despliegue:

- `JETREE_APP_URL=https://jetree.iwebtecnology.com`.
- `GITHUB_OAUTH_CLIENT_ID` y `GITHUB_OAUTH_CLIENT_SECRET` corresponden a la aplicación OAuth cuya callback es `/api/tool-connections/oauth/callback`.
- La aplicación GitHub declara como callback exacta `https://jetree.iwebtecnology.com/api/tool-connections/oauth/callback`.
- El secreto de cifrado de credenciales es el mismo que ya protege las conexiones existentes.
- No se copian tokens de dev a producción.

## 4. Probar permisos GitHub en dev

Con un usuario de prueba:

1. Abrir Conectores de herramientas → GitHub.
2. Elegir “Solo repositorios públicos”. Comprobar en GitHub la pantalla de permisos y finalizar.
3. Confirmar que Jetree muestra la cuenta y `public_repo`.
4. Revocar la conexión y repetir con “Públicos y privados autorizados”. Confirmar que GitHub muestra `repo`.
5. Desde el chat, pedir listar commits y ramas de un repositorio público. Debe responder sin aprobación.
6. Pedir crear una rama o PR. Debe mostrar una aprobación; la rama propuesta debe comenzar con `jetree-branch-` y el PR debe abrirse como borrador.
7. Revocar la conexión y repetir una lectura. Debe fallar solicitando reconexión, sin usar otra cuenta.

## 5. Activar en producción

1. Fusionar el PR probado desde `dev` hacia `main`.
2. Esperar el despliegue verde.
3. Comprobar `/api/health`, `/api/agents` sin sesión (`401`) y la página principal autenticada.
4. Aplicar y verificar la migración de producción y actualizar la huella antes de relanzar el job de deploy; ese job no modifica el esquema.
5. Conectar GitHub desde la cuenta de cada usuario; no reutilizar la conexión del administrador.
6. Hacer una lectura y una escritura de prueba con un repositorio descartable. Rechazar una aprobación y verificar que no se crea la rama.

## 6. OAuth de modelos

La interfaz API personal y el catálogo dinámico están listos. OpenAI por consumo del plan requiere habilitación para la aplicación alojada; Anthropic no admite ese login en Jetree bajo las condiciones actuales; el MCP de Jetree permite usar herramientas desde Claude oficial con autorización propia; Gemini CLI corresponde a un conector local por usuario. Hasta recibir esas aprobaciones no se deben activar botones que prometan OAuth de suscripción. La API permanece opcional y explícita.

## 7. Recuperación

Si una migración o despliegue falla, conservar la imagen activa, revisar el job y restaurar la revisión anterior mediante el mecanismo de rollback de la VPS. Las conexiones OAuth y sus auditorías se mantienen cifradas; revocar una conexión elimina el token local de Jetree y solicita autorización nuevamente.


Claude MCP y Google personal: seguir [la promoción y pruebas específicas](mcp-google-rollout.md), incluida la guía pública y el conector descargable. OpenAI continúa pendiente.
