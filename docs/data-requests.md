# Solicitudes de datos del workspace

La página `/datos` permite descargar JSON mediante `/api/data-export` y enviar una solicitud de corrección/eliminación al administrador. La exportación requiere sesión verificada en servidor, usa el cliente del usuario sujeto a RLS y selecciona columnas explícitas. No consulta almacenes de credenciales ni estados OAuth. Los administradores exportan los datos compartidos que sus permisos permiten; el perfil y el estado de conexiones corresponden únicamente a su cuenta.

Una solicitud por correo no autentica por sí sola al remitente ni ejecuta una eliminación. Antes de procesarla:

1. Verificar al titular mediante su cuenta autenticada o un canal ya establecido. No solicitar claves, tokens ni contraseñas por correo.
2. Registrar fecha, cuenta, alcance y decisión. Diferenciar datos personales, agentes/departamentos compartidos y documentos en servicios externos.
3. Ofrecer una exportación y aclarar que archivar es recuperable, no una eliminación definitiva.
4. Para cerrar una cuenta, revocar conexiones y sesiones antes de gestionar su identidad. Las relaciones `created_by` impiden eliminar indiscriminadamente usuarios con registros compartidos: revisar y transferir responsabilidad cuando corresponda.
5. Preparar una operación acotada a IDs verificados, revisar referencias y obtener confirmación antes de borrar definitivamente. No ejecutar bootstrap, fixtures ni eliminaciones amplias en producción.
6. Registrar qué se eliminó de la base activa, qué se conserva y qué permanece en respaldos o servicios externos. La solicitud no borra automáticamente archivos de GitHub, Drive o Telegram.
7. Mantener el registro de solicitudes accesible al operador de recuperación y reaplicar las eliminaciones posteriores si se restaura un respaldo anterior.

Las páginas de privacidad/condiciones describen el workspace actual. El responsable debe revisar el contacto, los proveedores y la conservación antes de abrirlo a usuarios externos. No existe borrado automático de cuentas o conversaciones compartidas en esta versión.
