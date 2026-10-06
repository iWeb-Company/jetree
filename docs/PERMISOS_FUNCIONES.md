# Permisos de funciones: migración posterior a 001–008

La migración `20261006214423_restrict_function_execution.sql` revoca ejecución de PUBLIC y anon para siete funciones SECURITY DEFINER. También revoca authenticated para las cuatro funciones de triggers; conserva service_role. Las tres funciones RLS que consultan auth.uid() conservan authenticated y service_role. No cambia cuerpos, triggers, políticas ni datos.

Supabase dev (`zanyrounguhexhqlyxeg`): la auditoría del 6 de octubre de 2026 confirmó ejecución anon/authenticated en esas siete funciones. La migración candidata y `function-permissions.sql` se probaron dentro de una transacción junto con `remote-isolation.sql`: dos miembros aislados y tres admins sintéticos conservaron sus permisos. La transacción terminó con rollback. Esto no equivale a una migración aplicada ni a una prueba HTTP Auth del proyecto alojado.

CI comprueba privilegios efectivos en esquema fresco y reconciliado. Auth y navegador se prueban además contra Supabase desechable. El replay ahora incluye todas las migraciones posteriores a 001, incluidas las futuras con timestamp.

## Aplicación y recuperación

Antes de aplicar por el mecanismo de migraciones de Supabase, conservar las ACL anteriores de estas siete funciones y verificar el resultado de CI. Dev primero: verificar historial, privilegios efectivos, pruebas de aislamiento y limpieza después de aplicar. No ejecutar el bootstrap sobre el proyecto alojado.

Si la aplicación falla en su transacción, no se registra ni conserva el cambio. Si falla una verificación después del commit, restaurar las ACL anteriores mediante una nueva migración compensatoria y volver a probar; no borrar el historial ni marcar registros manualmente. La reversión reabre los permisos anteriores y debe usarse solo para recuperar un fallo confirmado.

Producción no se modificó en esta revisión. Antes de aplicar allí, reauditar sus ACL y verificar respaldo recuperable. Después de incorporar y verificar esta migración en un entorno, regenerar su `schema.sha256` desde la release que contiene el mismo SQL. El hash 001–008 anterior debe bloquear imágenes con esta migración hasta entonces.

Fuente: https://supabase.com/docs/guides/database/functions
