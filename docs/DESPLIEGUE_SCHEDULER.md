# Despliegue coordinado de Telegram

El helper revisado actualiza app y scheduler cuando existe el archivo root-owned
`/opt/jetree/environments/<entorno>/worker-enabled`. Sin ese archivo mantiene el
despliegue de app solamente. Producción todavía no está habilitada.

El servicio Compose `worker` usa la misma imagen inmutable que la app y solamente
el archivo protegido `worker.env`. No recibe claves de Supabase ni de proveedores.
Antes de reemplazar la app, el helper detiene el worker y espera hasta 250 segundos
para drenar la llamada en curso. El scheduler espera su llamada antes de salir.
Después comprueba salud de app, API sin sesión y una respuesta autenticada del
worker. Si falla, restaura las imágenes anteriores de ambos servicios. La revisión
`current` cambia solamente después de todas las verificaciones.

## Adoptar el scheduler manual en dev

Realizar después de que los checks de la PR pasen y de revisar el helper y Compose
del commit exacto. No instalar archivos provenientes del flujo SSH de despliegue:
el operador instala las copias revisadas como root. Mantener la base y credenciales
de dev separadas de producción.

1. Guardar copia de los helpers y del Compose actual en un directorio root-only.
2. Instalar `scripts/deploy-vps.sh` como `/usr/local/sbin/jetree-deploy` root:root
   modo 755 y `compose.autodeploy.yml` como Compose de dev root:root modo 600.
3. Verificar que `worker.env` contiene el secreto de worker de dev, con permisos
   root:root 600. No imprimirlo. No activar producción.
4. Detener el contenedor manual exacto `jetree-dev-worker` con tiempo de parada de
   250 segundos. No eliminarlo todavía: permite recuperación de la adopción.
5. Crear el marcador `worker-enabled` root:root 600 de dev y desplegar una imagen
   construida desde este cambio, mediante la conexión restringida existente.
6. Comprobar app y worker saludables, imágenes del mismo commit, API anónima 401
   y respuesta del bot exclusivo de dev sin invocación manual.
7. Si falla la primera adopción, quitar el marcador, detener el worker Compose y
   arrancar el contenedor manual conservado. Si funciona, eliminar solamente ese
   contenedor manual ya detenido.

El helper rechaza la adopción si detecta el scheduler manual todavía corriendo.
Una falla posterior al reemplazo intenta restaurar app y worker; si la recuperación
no resulta saludable, exige intervención y no registra la revisión como aplicada.
El rollback cubre imágenes de servicios, no cambios de esquema ni de archivos env.
No ejecutar migraciones ni cambiar credenciales durante esta comprobación.

## Evidencia existente y pendiente

Facu confirmó en dev el consentimiento real de GitHub y Drive, una respuesta de
Gemini y la respuesta `scheduler dev OK` en Telegram con el scheduler manual.
Esto prueba el recorrido real de dev; no prueba producción ni este nuevo helper.
La recuperación real de app sola fue probada anteriormente en la VPS. El cambio
coordinado requiere sus propios checks de CI y una prueba de recuperación en dev
antes de habilitarlo en producción.
