# Fase 2 — Persistencia de la aplicación y permisos de workspace

## Alcance de esta entrega

- La aplicación carga agentes, departamentos, conexiones, tareas y actividad desde rutas autenticadas de Jetree. Ya no lee ni escribe agentes en `localStorage`.
- El CRUD de agentes y departamentos persiste en Supabase. Managers solo pueden referenciar agentes independientes del mismo departamento; la migración lo valida también en PostgreSQL.
- Los administradores pueden asignar a departamentos cuentas existentes de Jetree y quitar membresías. Al crear un departamento, su creador queda agregado como miembro automáticamente.
- Las tareas y eventos de actividad se cargan y guardan en Supabase. Las actualizaciones de tareas pasan por la API autenticada.
- Archivar un agente o departamento es recuperable desde **Papelera**; sus conversaciones y tareas no se borran en cascada.
- RLS limita datos de agentes y tareas a administradores, sus creadores y miembros del departamento. Las escrituras vinculadas a un departamento exigen que siga activo y que el usuario tenga acceso.

## Migración y configuración

Aplicar `004_app_data_permissions.sql` después de las migraciones `001`, `002` y `003`. La migración completa perfiles de cuentas existentes, promueve a los administradores definidos en `001_multiuser_workspace.sql`, agrega archivo recuperable y ajusta políticas y validaciones.

La gestión de membresías está disponible solo para perfiles con `role = 'admin'`. Se asigna un email que ya tenga cuenta; esta entrega no envía invitaciones ni crea usuarios en Supabase Auth.

## Verificación pendiente en staging

Esta rama no aplica migraciones ni modifica Supabase remoto. Antes de habilitarla, verificar con dos cuentas:

1. Un usuario sin membresía no puede listar ni modificar departamentos, agentes o tareas de otro usuario mediante API o Supabase REST.
2. Un miembro puede ver y usar agentes de su departamento, pero no escribir en otro departamento.
3. Un administrador puede asignar y revocar membresías y operar todos los departamentos.
4. Un manager solo delega a subordinados independientes del mismo departamento.
5. Al cambiar de sesión o navegador no se mezclan datos; al archivar/restaurar, las conversaciones y tareas quedan intactas.

La configuración de Telegram continúa en la fase 6 del plan; no forma parte de esta migración de persistencia.
