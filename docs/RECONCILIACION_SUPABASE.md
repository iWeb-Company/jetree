# Reconciliación de Jetree: estado verificable

Fecha: 2026-10-06. Proyecto auditado: `jetree`, ref `lgimqhuohkjtwfxbaecb`.
Base de código: `bc19ef1234b3db0b314360d3cf319ebf4fa45d01`; rama de trabajo: `codex/production-verification`, PR #8.

## Verificado en Supabase

La lectura SQL inocua y `get_project` funcionaron; el proyecto está saludable. Se auditaron metadatos de tablas, las 55 columnas, 26 constraints, 8 índices, enums, dos funciones de aplicación, el trigger de Auth, 12 políticas, grants de tablas/columnas y privilegios por defecto. No se inspeccionaron filas personales ni secretos.

Hay siete tablas base con RLS. El historial está vacío y no existe `supabase_migrations.schema_migrations`. No hay objetos de 002–008 ni ramas de desarrollo. Un conteo agregado confirma tres perfiles y tres administradores previstos, sin revelar filas.

Comparado con una instalación limpia de 001, las tablas, columnas, constraints, índices, enums y trigger coinciden. La política `departments_write` debe llamarse `departments_admin_write`; su expresión coincide. Las funciones tienen formato diferente pero la misma definición normalizada, propietario y configuración. Los grants explícitos de Supabase se conservan. Tanto el esquema remoto como 001 tienen el defecto `m.department_id = m.department_id` en las políticas de agents/tasks; no se acepta como condición final.

El panel autenticado confirmó que el plan Free no incluye backups. La primera exportación falló por autenticación de PostgreSQL, sin modificar la base. La conexión corregida permitió exportar public/Auth. El archivo cifrado con DPAPI se verificó por SHA-256 y se restauró en PostgreSQL local aislado con los grants originales y roles de prueba sin login. Los ocho hashes de public coinciden exactamente; los conteos agregados de perfiles, admins y Auth son 3/3/3. El respaldo queda fuera del repositorio y depende de la misma cuenta Windows para descifrarlo.

## Estrategia versionada preparada

`supabase/reconciliation/20261006145142_reconcile_existing_001.sql` fue generado mediante Supabase CLI 2.119.0. Es una vía exclusiva de adopción de la base existente, separada del flujo de instalación limpia 001–008.

El baseline verifica hashes de columnas, constraints, índices, políticas, enums, funciones, triggers y grants antes de modificar nada, y exige siete tablas con RLS. Aborta ante drift. Renombra una política y reemplaza las dos políticas defectuosas con referencias externas calificadas. No recrea tablas ni tipos y no reescribe datos.

Después del baseline se aplican 002–008 en orden, una aplicación/transacción por archivo; la adición del enum de 002 se confirma antes de continuar. El mecanismo remoto disponible es `apply_migration`: registra cada aplicación con su versión real. No se hará `repair` de 001 ni se fabricarán versiones aplicadas. El historial debe reflejar el baseline realmente ejecutado y las siguientes aplicaciones, con un manifiesto que relacione versión remota, nombre, archivo y SHA-256.

No ejecutar `supabase db push` contra esta base con el directorio legacy 001–008 sin reconciliar antes ese manifiesto y la historia. El historial no debe ocultarse ni reinterpretarse como si 001 se hubiese ejecutado en esta sesión.

## Verificado solo en local

- Se reconstruyó el esquema remoto exclusivamente a partir del catálogo, sin datos reales, en PostgreSQL 17 descartable.
- Los ocho hashes previos coincidieron exactamente con la reconstrucción local.
- El baseline y 002–008 terminaron correctamente. Las 21 tablas, 187 columnas, constraints, índices, funciones normalizadas, triggers y 22 políticas resultantes coinciden con una instalación limpia.
- Otro ensayo con cinco perfiles sintéticos, dos departamentos, dos membresías, dos agentes y dos tareas conservó todos esos registros. Dos identidades quedaron aisladas en ambos sentidos y tres administradores sintéticos conservaron lectura y escritura global. Nunca se usaron cuentas personales como fixtures.
- Pasaron 21 pruebas de aplicación y 16 comprobaciones HTTP contra servidor local con valores sintéticos: acceso sin sesión rechazado y webhook global retirado. TypeScript y lint pasan; hay dos advertencias de imágenes ya existentes. El build del mismo código había pasado en la verificación anterior.
- La CI del commit previo `359ac8e1cbec61c8e9f3928f5764709585e40ae5` terminó correctamente. La nueva CI añade ensayo de reconciliación con datos sintéticos y smoke HTTP; sus resultados remotos se registrarán después de publicar el commit.

## Aplicaciones remotas

**Baseline y 002–008 aplicados mediante apply_migration.** Las ocho versiones reales y hashes de sus archivos están en supabase/reconciliation/applied-manifest.json. No se marcó 001 como ejecutada. Tras cada paso se consultó el historial y se compararon los ocho hashes del catálogo con un replay local limpio: todos coinciden. Resultado remoto: 21 tablas con RLS, 187 columnas, 22 políticas, tres administradores previstos conservados.

Después de cada `apply_migration`: consultar historial, verificar tablas/columnas/constraints/índices/políticas/funciones esperadas y grants; conservar el resultado y abortar la secuencia ante cualquier discrepancia. La prueba de aislamiento remota debe usar identidades sintéticas y una transacción revertida, sin dejar fixtures permanentes.

## Pendientes críticos

E2E con Supabase Auth/REST, conectores/proveedores/Telegram reales, configuración de despliegue y rotación de la credencial histórica. Los advisors señalan funciones SECURITY DEFINER expuestas y protección de contraseñas filtradas deshabilitada; revisar y corregir según el modelo de acceso, sin romper las funciones usadas por RLS. No publicar Jetree todavía.

## Pruebas remotas y recuperación

La prueba tests/database/remote-isolation.sql pasó en Supabase y revirtió toda su transacción. Dos identidades sintéticas quedaron impedidas de leer agentes ajenos y de insertar, actualizar o borrar agentes/tareas ajenos. Tres administradores sintéticos leyeron y modificaron ambos departamentos. Se verificaron permisos negativos sobre credenciales y funciones del worker. La comprobación posterior confirmó cero fixtures y tres perfiles/Auth/admins previstos. Esto prueba RLS con el rol authenticated y claims SQL; todavía no prueba login Auth ni el flujo HTTP autenticado completo.

rollback_001_008.sql pasó sobre una base local con datos sintéticos: recuperó los ocho hashes originales y conservó sus registros. Requiere detener la aplicación, conservar el respaldo y revisar que las tablas añadidas estén vacías; aborta si contienen datos o si se utiliza custom. La reversión restaura también las políticas históricas defectuosas, por lo que la aplicación debe permanecer detenida hasta corregirlas. No borra el historial: una reversión remota debe registrarse como nueva migración. No usarla como downgrade cotidiano ni descartar datos nuevos.

Para fallos en pasos intermedios: detener escrituras, conservar el estado fallido, descifrar el backup bajo la cuenta Windows que lo creó y restaurarlo primero en una base aislada con extensiones pgcrypto/uuid-ossp y roles requeridos. El ensayo de recuperación utilizó pg_restore --no-owner conservando ACLs. Validar hashes y conteos antes de decidir la restauración del destino; nunca restaurar encima de Auth activo sin ventana de recuperación. No se hizo rollback en Supabase.
