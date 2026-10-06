# Despliegues de dev y producción

## Estado y límites

Preparado para GitHub Actions; no está activado hasta completar la instalación y los secretos. `dev` parte del commit `8c6e07a7393226ca8bf10729687cd85093d905f0`. Producción usa `jetree.iwebtecnology.com`, dev usará `jetree-dev.iwebtecnology.com`. No existe todavía el Supabase de dev. La página pública de producción continúa en preparación; estos workflows no cambian Nginx ni habilitan Telegram.

Ningún CI garantiza ausencia de fallos. Las pruebas previas, candidato aislado y rollback reducen el riesgo; el reemplazo del contenedor puede causar una breve interrupción. Health comprueba arranque y autorización HTTP, no la disponibilidad completa de servicios externos. El rollback restaura la imagen anterior, no revierte datos ni acciones de terceros.

## Flujo

1. Abrir PR a `dev`: unitarias, lint, tipos, build, HTTP sin sesión, migraciones/RLS PostgreSQL 17, Docker/scheduler y E2E de Auth/UI con Supabase desechable deben pasar.
2. Merge a `dev`: repetir las pruebas sobre el commit final y desplegar solo si `AUTODEPLOY_DEV=true`.
3. Promover mediante PR `dev` → `main`; mismos controles. Merge a `main`: repetir pruebas y desplegar solo si `AUTODEPLOY_PRODUCTION=true`.

Los despliegues se serializan por entorno y no se interrumpen a mitad de actualización. Una ejecución fallida conserva el servicio anterior si falla el candidato; si falla el reemplazo, intenta recuperar y comprobar la imagen anterior. Si también falla esa recuperación, GitHub queda en rojo y requiere intervención. No hay migraciones automáticas ni despliegues desde PRs o forks.

## GitHub

Crear Environments `dev` y `production`, restringidos respectivamente a ramas `dev` y `main`. En cada Environment:

| Campo | Tipo | Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Variable | URL del proyecto de ese entorno |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Variable | Clave pública anon de ese proyecto |
| `DEPLOY_HOST` | Variable | `200.58.103.208` |
| `DEPLOY_PORT` | Variable | `5592` |
| `DEPLOY_SSH_KEY` | Secret | Clave privada nueva, exclusiva de ese entorno y de Actions |
| `DEPLOY_KNOWN_HOSTS` | Secret | Entrada OpenSSH del host y puerto, verificada contra la huella en la consola VPS |

No usar la clave `github_deploy`: sirve para leer el repositorio, no para ingresar desde Actions. No colocar service-role, cifrado, tokens ni archivos runtime en GitHub. Crear variables de repositorio `AUTODEPLOY_DEV=false` y `AUTODEPLOY_PRODUCTION=false`; cambiar a `true` únicamente después de comprobar el entorno correspondiente.

Proteger ambas ramas: PR obligatorio, checks `application`, `database`, `container`, `isolated-e2e` obligatorios y actualizados, conversaciones resueltas, aplicar a admins, sin force push ni borrado. Seleccionar los nombres exactos que muestre la primera ejecución de Actions. No habilitar un bypass para merges con pruebas fallidas.

## VPS: instalación revisada, una vez

Usar una cuenta dedicada `jetree-deploy`, sin pertenecer al grupo Docker. Instalar `scripts/deploy-vps.sh` como `/usr/local/sbin/jetree-deploy` y `scripts/deploy-ssh.sh` como `/usr/local/sbin/jetree-deploy-ssh`; propietario root, permisos 755, directorios no editables por esa cuenta. Validar ambos con `bash -n`.

Agregar mediante `visudo -f /etc/sudoers.d/jetree-deploy` únicamente:

```
jetree-deploy ALL=(root) NOPASSWD: /usr/local/sbin/jetree-deploy dev *, /usr/local/sbin/jetree-deploy production *
```

El helper exige exactamente dos argumentos: entorno permitido y SHA de 40 caracteres hexadecimales; no evalúa comandos recibidos. Validar sudoers con `visudo -c`. En `authorized_keys`, una clave distinta por entorno y estas opciones, sustituyendo solo la clave pública:

```
restrict,command="/usr/local/sbin/jetree-deploy-ssh dev" ssh-ed25519 CLAVE_PUBLICA_DEV
restrict,command="/usr/local/sbin/jetree-deploy-ssh production" ssh-ed25519 CLAVE_PUBLICA_PRODUCTION
```

Mantener autenticación de contraseña deshabilitada para esa cuenta; no modificar el acceso de administración existente. Las claves forzadas no dan terminal, túneles ni acceso al entorno contrario. Guardar las privadas únicamente en los Secrets correspondientes.

Crear `/opt/jetree/environments/dev` y `/opt/jetree/environments/production` con root:root y 700. Cada uno necesita:

- `runtime.env` root:root 600, mismas variables servidor requeridas por `scripts/start.mjs`, URL pública y callback de ese entorno. Dev debe tener Supabase y clave de cifrado separados; nunca copiar credenciales de producción a dev. Producción debe conservar su clave de cifrado existente para poder leer las conexiones ya guardadas.
- `compose.yml`: copia root-owned de `compose.autodeploy.yml`. El helper fija las rutas, puerto 3030 para dev y 3028 para producción. Confirmar primero que 3030 está libre. Producción mantiene el proyecto Docker `jetree`; dev usa `jetree-dev`.
- `schema.sha256`: ejecutar desde la release revisada `sha256sum supabase/migrations/*.sql | sha256sum | cut -d' ' -f1`. Guardar este hash solo después de verificar que ese esquema está aplicado en el Supabase correspondiente. Cambios futuros de SQL requieren respaldo, migración revisada y actualizar este archivo explícitamente.
- `enabled`: archivo vacío creado por root después de completar las verificaciones del entorno. Sin él, el helper rechaza el despliegue.

La imagen usa Node 22 de ECR público fijado por digest; no necesita login de Docker Hub. Actions envía la imagen por SSH, no sube secretos ni ejecuta scripts provenientes del repositorio en la VPS. Revisar e instalar explícitamente cualquier cambio futuro del helper.

Antes de activar: validar runtime y permisos; conservar una imagen anterior recuperable; comprobar que no hay un worker activo de otra release; ejecutar un despliegue de prueba y observar el rollback inducido solo en dev. Estos workflows gestionan únicamente `app`: el scheduler Telegram requiere una activación posterior y coordinada.

## DNS, HTTPS y callbacks de dev

Crear registro A `jetree-dev` → `200.58.103.208`. Configurar un sitio Nginx separado y emitir certificado con Certbot/webroot. Mantener las configuraciones de otros proyectos intactas. Proxy dev a `127.0.0.1:3030`, encabezados Host y X-Forwarded-Proto HTTPS; deshabilitar access log del callback para no registrar códigos OAuth. Comprobar HTTPS y renovación antes de abrir dev.

Registrar en aplicaciones OAuth de pruebas la URL exacta `https://jetree-dev.iwebtecnology.com/api/tool-connections/oauth/callback`. El sitio y redirect URLs de Supabase Auth también deben corresponder a dev. Preferir clientes OAuth separados; no reutilizar el bot productivo para pruebas.

## Migraciones y publicación

Dev nuevo aplica 001–008 en orden como esquema fresco; comprobar historial, RLS y fixtures sintéticos antes de permitir CI/CD. Producción conserva su historial reconciliado; no volver a ejecutar 001 sobre objetos existentes. El hash bloquea cambios no aprobados, pero no prueba por sí mismo el estado remoto.

No cambiar producción de mantenimiento a proxy completo hasta verificar los criterios críticos de `PLAN_PRODUCCION.md`, incluyendo Auth/aislamiento, consentimiento real, Gemini y Telegram en la VPS, respaldo recuperable y operación/rollback. Configurar CI/CD no equivale a haber completado esas pruebas.
