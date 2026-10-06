# Verificación y recuperación antes de producción

Auditoría: 2026-10-06. Base de código: `bc19ef1234b3db0b314360d3cf319ebf4fa45d01`.

## Estado remoto comprobado

Se confirmó acceso de lectura SQL al proyecto `jetree`, ref `lgimqhuohkjtwfxbaecb`, saludable. No se modificó la base remota.

- Hay siete tablas base con RLS habilitado; no hay tablas de las migraciones 002–008.
- `list_migrations` devuelve una lista vacía y no existe `supabase_migrations.schema_migrations`.
- Conteos exactos: 3 perfiles; 0 departamentos, membresías, agentes, conexiones, tareas y logs. No se inspeccionaron filas personales ni secretos.
- `agents_visible` y `tasks_visible` comparan `m.department_id = m.department_id`: un miembro podría leer otros departamentos. La corrección está en 002 y se reemplaza posteriormente en 004.
- Hay drift respecto de 001: la política de escritura de departamentos se llama `departments_write`, mientras el archivo usa `departments_admin_write`. Esto impide afirmar equivalencia exacta del baseline.
- La copia local registrada estaba en `9a38886`, con solo 001 y el contexto sin versionar. Se preservó esa copia y se trabajó en un clon del remoto actual.

## Validación automatizada

`.github/workflows/verify.yml` ejecuta pruebas de aplicación, lint, TypeScript y build con valores sintéticos. Un segundo job aplica todas las migraciones en PostgreSQL 17 aislado y comprueba lectura, modificación, borrado e inserción cruzada de agentes con dos identidades, lectura de tareas y departamentos, denegación de tablas de credenciales y funciones reservadas al servicio.

La prueba SQL revierte sus fixtures. La autenticación se representa mediante una función `auth.uid()` mínima; no prueba Supabase Auth, sesiones HTTP, REST, Realtime, conectores OAuth, proveedores ni Telegram. No usar el bootstrap de pruebas en Supabase.

## Estrategia de baseline y reconciliación

1. Volver a capturar columnas, tipos, defaults, constraints, claves, índices, funciones, triggers, políticas y grants del proyecto correcto. Compararlos con una base limpia tras 001; no basta comparar nombres de tablas.
2. Conservar las diferencias en un manifiesto. Preparar una migración de reconciliación explícita de 001; no recrear tablas ni tipos ya existentes y no marcar 001 aplicada mientras difieran sus efectos.
3. Ensayar la reconciliación sobre una restauración aislada del esquema real y datos sintéticos. Luego aplicar 002–008 en orden, una transacción por archivo; el nuevo valor enum de 002 debe estar confirmado antes de usarlo en otra transacción.
4. Verificar el resultado completo y las pruebas RLS antes de registrar la historia del baseline mediante el mecanismo oficial de reparación. No insertar manualmente una historia que atribuya efectos no ejecutados.
5. Aplicar a producción únicamente después del respaldo/restauración y staging descritos abajo. Repetir auditoría y comparar el esquema final con el staging aprobado.

## Respaldo y recuperación requeridos

Antes del primer cambio remoto, registrar de forma protegida el identificador, fecha, proyecto y alcance del respaldo; incluir esquema, datos de aplicación, Auth y configuración necesaria. Conservar la clave de cifrado protegida junto al respaldo; nunca en Git. Storage y configuraciones externas requieren respaldo independiente según su uso.

Restaurar el respaldo en un proyecto aislado y comprobar conteos, constraints, funciones, políticas, grants y acceso de un administrador. Medir el tiempo de recuperación. Un respaldo existente sin ensayo de restauración no satisface este criterio.

Durante la publicación detener workers y escrituras, guardar el commit anterior, aplicar archivos versionados y ejecutar smoke tests. Si falla una migración, abortar su transacción y detener las siguientes. Si fallan verificaciones posteriores, mantener el servicio en mantenimiento y restaurar el respaldo ensayado junto con la versión compatible de la aplicación. No hacer rollback borrando tablas de conversaciones, tokens o colas. Reactivar workers solo después de verificar permisos y deduplicación.

## Bloqueos de lanzamiento

No se ha verificado un respaldo remoto ni restauración. No hay staging Supabase comprobado ni E2E/REST RLS con dos cuentas. La rotación de la credencial publicada históricamente sigue sin verificarse. Falta validar secretos de despliegue sin revelarlos, proveedores autorizados, OAuth real, entrega/reintentos de Telegram, observabilidad y recuperación. No declarar listo para producción por pasar el build o el SQL local.
